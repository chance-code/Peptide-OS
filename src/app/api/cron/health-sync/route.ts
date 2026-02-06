import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getProvider, HealthProviderType, MetricSyncState } from '@/lib/health-providers'

// Import providers to register them
import '@/lib/health-providers/oura'
import '@/lib/health-providers/whoop'

// Vercel Cron: runs daily (Hobby plan) or every 4 hours (Pro plan)
// Syncs all connected OAuth integrations (Oura, WHOOP) server-side.

const OAUTH_PROVIDERS: HealthProviderType[] = ['oura', 'whoop']

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const integrations = await prisma.healthIntegration.findMany({
    where: {
      isConnected: true,
      provider: { in: OAUTH_PROVIDERS }
    },
    select: {
      id: true,
      userId: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiry: true,
      lastSyncAt: true,
      enabledMetrics: true,
    }
  })

  let synced = 0
  let errors = 0
  const results: Array<{ userId: string; provider: string; status: string; metricsCount?: number; error?: string }> = []

  for (const integration of integrations) {
    try {
      const providerType = integration.provider as HealthProviderType
      const providerImpl = getProvider(providerType)
      if (!providerImpl) {
        results.push({ userId: integration.userId, provider: integration.provider, status: 'skipped', error: 'Unknown provider' })
        continue
      }

      // Refresh token if expired or expiring within 1 hour
      let accessToken = integration.accessToken
      const expiringWithinHour = integration.tokenExpiry &&
        new Date(integration.tokenExpiry).getTime() - Date.now() < 60 * 60 * 1000

      if (expiringWithinHour || (integration.tokenExpiry && new Date() >= integration.tokenExpiry)) {
        if (!integration.refreshToken || !providerImpl.refreshToken) {
          await prisma.healthIntegration.update({
            where: { id: integration.id },
            data: { isConnected: false, syncError: 'Token expired. Please reconnect.' }
          })
          results.push({ userId: integration.userId, provider: integration.provider, status: 'error', error: 'Token expired, no refresh token' })
          errors++
          continue
        }

        try {
          const tokens = await providerImpl.refreshToken(integration.refreshToken)
          accessToken = tokens.accessToken

          let tokenExpiry: Date | null = null
          if (tokens.expiresIn) {
            tokenExpiry = new Date()
            tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokens.expiresIn)
          }

          await prisma.healthIntegration.update({
            where: { id: integration.id },
            data: {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken || integration.refreshToken,
              tokenExpiry
            }
          })
        } catch (refreshError) {
          console.error(`[Cron] Token refresh failed for ${integration.userId}/${integration.provider}:`, refreshError)
          await prisma.healthIntegration.update({
            where: { id: integration.id },
            data: { isConnected: false, syncError: 'Token refresh failed. Please reconnect.' }
          })
          results.push({ userId: integration.userId, provider: integration.provider, status: 'error', error: 'Token refresh failed' })
          errors++
          continue
        }
      }

      // Determine sync window
      const defaultSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days
      const since = integration.lastSyncAt || defaultSince

      // Fetch metrics from provider
      const metrics = await providerImpl.fetchMetrics(accessToken || '', since)

      // Create sync log
      const syncLog = await prisma.healthSyncLog.create({
        data: {
          userId: integration.userId,
          provider: providerType,
          status: 'success',
          startedAt: new Date()
        }
      })

      // Load existing sync state
      let syncState: MetricSyncState = {}
      if (integration.enabledMetrics) {
        try { syncState = JSON.parse(integration.enabledMetrics) as MetricSyncState } catch { /* ignore */ }
      }

      // Batch upsert metrics
      let metricsCount = 0
      const CHUNK_SIZE = 80
      for (let i = 0; i < metrics.length; i += CHUNK_SIZE) {
        const chunk = metrics.slice(i, i + CHUNK_SIZE)
        const upsertResults = await prisma.$transaction(
          chunk.map(metric =>
            prisma.healthMetric.upsert({
              where: {
                userId_provider_metricType_recordedAt: {
                  userId: integration.userId,
                  provider: providerType,
                  metricType: metric.metricType,
                  recordedAt: metric.recordedAt
                }
              },
              update: {
                value: metric.value,
                unit: metric.unit,
                context: metric.context ? JSON.stringify(metric.context) : null
              },
              create: {
                userId: integration.userId,
                provider: providerType,
                metricType: metric.metricType,
                value: metric.value,
                unit: metric.unit,
                recordedAt: metric.recordedAt,
                context: metric.context ? JSON.stringify(metric.context) : null
              }
            })
          )
        )
        metricsCount += upsertResults.length
      }

      // Update sync state
      const now = new Date()
      const nowISO = now.toISOString()
      const newSyncState: MetricSyncState = { ...syncState }
      const seenTypes = new Set(metrics.map(m => m.metricType))
      for (const mt of seenTypes) {
        newSyncState[mt] = {
          lastSyncAt: nowISO,
          status: 'ok',
          dataPoints: metrics.filter(m => m.metricType === mt).length
        }
      }

      await Promise.all([
        prisma.healthIntegration.update({
          where: { id: integration.id },
          data: { lastSyncAt: now, syncError: null, enabledMetrics: JSON.stringify(newSyncState) }
        }),
        prisma.healthSyncLog.update({
          where: { id: syncLog.id },
          data: { status: metricsCount > 0 ? 'success' : 'partial', metricsCount, completedAt: now }
        })
      ])

      results.push({ userId: integration.userId, provider: integration.provider, status: 'success', metricsCount })
      synced++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Cron] Sync failed for ${integration.userId}/${integration.provider}:`, errorMessage)

      await prisma.healthIntegration.update({
        where: { id: integration.id },
        data: { syncError: `Cron sync failed: ${errorMessage}` }
      }).catch(() => {}) // Don't let update failure cascade

      results.push({ userId: integration.userId, provider: integration.provider, status: 'error', error: errorMessage })
      errors++
    }
  }

  console.log(`[Cron health-sync] Synced: ${synced}, Errors: ${errors}, Total: ${integrations.length}`)

  return NextResponse.json({ synced, errors, total: integrations.length, results })
}
