import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { authenticateEightSleep } from '@/lib/health-providers/eight-sleep'
import { getProvider } from '@/lib/health-providers'

// Import provider to register it
import '@/lib/health-providers/eight-sleep'

// POST /api/health/integrations/eight-sleep/login
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const body = await request.json()
    const { email, password } = body as { email: string; password: string }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Authenticate with Eight Sleep
    const tokens = await authenticateEightSleep(email, password)

    // Calculate token expiry
    let tokenExpiry: Date | null = null
    if (tokens.expiresIn) {
      tokenExpiry = new Date()
      tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokens.expiresIn)
    }

    // Create or update the integration
    await prisma.healthIntegration.upsert({
      where: {
        userId_provider: { userId, provider: 'eight_sleep' }
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: null, // No refresh token with password auth
        tokenExpiry,
        isConnected: true,
        syncError: null
      },
      create: {
        userId,
        provider: 'eight_sleep',
        accessToken: tokens.accessToken,
        refreshToken: null,
        tokenExpiry,
        isConnected: true
      }
    })

    // Trigger initial sync
    await triggerInitialSync(userId, tokens.accessToken)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Eight Sleep login error:', error)

    const message = error instanceof Error ? error.message : 'Login failed'

    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.message.includes('Invalid') ? 401 : 500 }
    )
  }
}

// Trigger initial sync
async function triggerInitialSync(userId: string, accessToken: string) {
  try {
    const providerImpl = getProvider('eight_sleep')
    if (!providerImpl) return

    // Fetch metrics from the last 30 days
    const since = new Date()
    since.setDate(since.getDate() - 30)

    // Create sync log
    const syncLog = await prisma.healthSyncLog.create({
      data: {
        userId,
        provider: 'eight_sleep',
        status: 'in_progress',
        startedAt: new Date()
      }
    })

    const metrics = await providerImpl.fetchMetrics(accessToken, since)

    // Store metrics (upsert to handle duplicates)
    let metricsCount = 0
    for (const metric of metrics) {
      try {
        await prisma.healthMetric.upsert({
          where: {
            userId_provider_metricType_recordedAt: {
              userId,
              provider: 'eight_sleep',
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
            provider: 'eight_sleep',
            metricType: metric.metricType,
            value: metric.value,
            unit: metric.unit,
            recordedAt: metric.recordedAt,
            context: metric.context ? JSON.stringify(metric.context) : null
          }
        })
        metricsCount++
      } catch (error) {
        console.error('Error storing metric:', error)
      }
    }

    // Update integration and sync log
    await Promise.all([
      prisma.healthIntegration.update({
        where: {
          userId_provider: { userId, provider: 'eight_sleep' }
        },
        data: {
          lastSyncAt: new Date(),
          syncError: null
        }
      }),
      prisma.healthSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'success',
          metricsCount,
          completedAt: new Date()
        }
      })
    ])

    console.log(`Eight Sleep initial sync: ${metricsCount} metrics stored`)
  } catch (error) {
    console.error('Eight Sleep initial sync error:', error)

    await prisma.healthIntegration.update({
      where: {
        userId_provider: { userId, provider: 'eight_sleep' }
      },
      data: {
        syncError: error instanceof Error ? error.message : 'Sync failed'
      }
    }).catch(console.error)
  }
}
