import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getProvider, HealthProviderType, MetricSyncState } from '@/lib/health-providers'

// Import providers to register them
import '@/lib/health-providers/oura'
import '@/lib/health-providers/eight-sleep'
import '@/lib/health-providers/apple-health'

// Parse per-metric sync state from the enabledMetrics JSON field
function parseSyncState(enabledMetrics: string | null): MetricSyncState {
  if (!enabledMetrics) return {}
  try {
    return JSON.parse(enabledMetrics) as MetricSyncState
  } catch {
    return {}
  }
}

// POST /api/health/sync/[provider] - Trigger manual sync
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const providerType = provider as HealthProviderType

  // Apple Health uses a native Capacitor plugin that only runs client-side.
  // The client fetches data directly and POSTs to /api/health/ingest/apple-health.
  if (providerType === 'apple_health') {
    return NextResponse.json(
      { error: 'Apple Health sync must be performed client-side', clientSideRequired: true },
      { status: 400 }
    )
  }

  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    // Get the integration
    const integration = await prisma.healthIntegration.findUnique({
      where: {
        userId_provider: { userId, provider: providerType }
      }
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    if (!integration.isConnected) {
      return NextResponse.json(
        { error: 'Integration is not connected' },
        { status: 400 }
      )
    }

    const providerImpl = getProvider(providerType)
    if (!providerImpl) {
      return NextResponse.json(
        { error: 'Unknown provider' },
        { status: 400 }
      )
    }

    // Check if token needs refresh (for OAuth providers)
    let accessToken = integration.accessToken
    if (integration.tokenExpiry && new Date() >= integration.tokenExpiry) {
      if (!integration.refreshToken || !providerImpl.refreshToken) {
        await prisma.healthIntegration.update({
          where: { id: integration.id },
          data: {
            isConnected: false,
            syncError: 'Token expired. Please reconnect.'
          }
        })

        return NextResponse.json(
          { error: 'Token expired. Please reconnect.' },
          { status: 401 }
        )
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
      } catch (error) {
        console.error('Token refresh failed:', error)

        await prisma.healthIntegration.update({
          where: { id: integration.id },
          data: {
            isConnected: false,
            syncError: 'Token refresh failed. Please reconnect.'
          }
        })

        return NextResponse.json(
          { error: 'Token refresh failed. Please reconnect.' },
          { status: 401 }
        )
      }
    }

    // Create sync log
    const syncLog = await prisma.healthSyncLog.create({
      data: {
        userId,
        provider: providerType,
        status: 'success',
        startedAt: new Date()
      }
    })

    // Load existing per-metric sync state
    const syncState = parseSyncState(integration.enabledMetrics)

    // Determine sync window — use oldest per-metric lastSyncAt or global lastSyncAt or 30 days
    const defaultSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    const since = integration.lastSyncAt || defaultSince

    try {
      // Use enhanced fetch if available (Apple Health), otherwise standard fetch
      let metrics: Array<{ metricType: string; value: number; unit: string; recordedAt: Date; context?: Record<string, unknown> }>
      let fetchPermissions: Record<string, boolean> | undefined
      let fetchErrors: Array<{ metricType: string; error: string }> | undefined
      let fetchMetricCounts: Record<string, number> | undefined

      if (providerImpl.fetchMetricsWithStatus) {
        const result = await providerImpl.fetchMetricsWithStatus(accessToken || '', since)
        metrics = result.metrics
        fetchPermissions = result.permissions
        fetchErrors = result.errors
        fetchMetricCounts = result.metricCounts
      } else {
        metrics = await providerImpl.fetchMetrics(accessToken || '', since)
      }

      // Batch upsert using transactions (chunks of 80 to stay within SQLite limits)
      let metricsCount = 0
      const CHUNK_SIZE = 80
      for (let i = 0; i < metrics.length; i += CHUNK_SIZE) {
        const chunk = metrics.slice(i, i + CHUNK_SIZE)
        const results = await prisma.$transaction(
          chunk.map(metric =>
            prisma.healthMetric.upsert({
              where: {
                userId_provider_metricType_recordedAt: {
                  userId,
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
                userId,
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
        metricsCount += results.length
      }

      // Build updated per-metric sync state
      const now = new Date()
      const nowISO = now.toISOString()
      const newSyncState: MetricSyncState = { ...syncState }

      // Update state for metrics that returned data
      if (fetchMetricCounts) {
        for (const [metricType, count] of Object.entries(fetchMetricCounts)) {
          newSyncState[metricType] = {
            lastSyncAt: nowISO,
            status: count > 0 ? 'ok' : 'no_data',
            dataPoints: count
          }
        }
      } else {
        // For non-enhanced providers, mark all returned metric types
        const seenTypes = new Set(metrics.map(m => m.metricType))
        for (const mt of seenTypes) {
          newSyncState[mt] = {
            lastSyncAt: nowISO,
            status: 'ok',
            dataPoints: metrics.filter(m => m.metricType === mt).length
          }
        }
      }

      // Mark per-metric errors
      if (fetchErrors) {
        for (const err of fetchErrors) {
          if (err.metricType === '*') continue // Global errors handled separately
          newSyncState[err.metricType] = {
            ...newSyncState[err.metricType],
            lastSyncAt: newSyncState[err.metricType]?.lastSyncAt || null,
            status: err.error.toLowerCase().includes('permission') ? 'permission_denied' : 'error',
            lastError: err.error
          }
        }
      }

      // Update integration and sync log
      await Promise.all([
        prisma.healthIntegration.update({
          where: { id: integration.id },
          data: {
            lastSyncAt: now,
            syncError: null,
            enabledMetrics: JSON.stringify(newSyncState)
          }
        }),
        prisma.healthSyncLog.update({
          where: { id: syncLog.id },
          data: {
            status: metricsCount > 0 ? 'success' : 'partial',
            metricsCount,
            completedAt: now
          }
        })
      ])

      return NextResponse.json({
        success: true,
        metricsCount,
        lastSyncAt: now,
        metricSyncState: newSyncState,
        permissions: fetchPermissions,
        errors: fetchErrors?.filter(e => e.metricType !== '*')
      })
    } catch (error) {
      console.error(`Sync error for ${provider}:`, error)

      const errorMessage = error instanceof Error ? error.message : 'Sync failed'

      await prisma.healthSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failed',
          errorMessage,
          completedAt: new Date()
        }
      })

      await prisma.healthIntegration.update({
        where: { id: integration.id },
        data: {
          syncError: errorMessage
        }
      })

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in sync route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
