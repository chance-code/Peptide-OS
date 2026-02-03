import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getProvider, HealthProviderType } from '@/lib/health-providers'

// Import providers to register them
import '@/lib/health-providers/oura'
import '@/lib/health-providers/eight-sleep'

// GET /api/health/integrations/[provider]/callback - OAuth callback handler
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const providerType = provider as HealthProviderType
  const { searchParams } = new URL(request.url)

  const code = searchParams.get('code')
  const state = searchParams.get('state') // Contains userId
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Base URL for redirects
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Handle OAuth errors
  if (error) {
    console.error(`OAuth error for ${provider}:`, error, errorDescription)
    return NextResponse.redirect(
      `${baseUrl}/health?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // Validate required params
  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/health?error=${encodeURIComponent('Missing authorization code or state')}`
    )
  }

  const userId = state

  // Get the provider implementation
  const providerImpl = getProvider(providerType)
  if (!providerImpl || !providerImpl.exchangeCode) {
    return NextResponse.redirect(
      `${baseUrl}/health?error=${encodeURIComponent('Unknown provider')}`
    )
  }

  try {
    // Exchange authorization code for tokens
    const redirectUri = `${baseUrl}/api/health/integrations/${provider}/callback`
    const tokens = await providerImpl.exchangeCode(code, redirectUri)

    // Calculate token expiry
    let tokenExpiry: Date | null = null
    if (tokens.expiresIn) {
      tokenExpiry = new Date()
      tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokens.expiresIn)
    }

    // Create or update the integration
    await prisma.healthIntegration.upsert({
      where: {
        userId_provider: { userId, provider: providerType }
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry,
        isConnected: true,
        syncError: null
      },
      create: {
        userId,
        provider: providerType,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry,
        isConnected: true
      }
    })

    // Trigger initial sync in the background
    triggerInitialSync(userId, providerType, tokens.accessToken)

    // Redirect to health page with success
    return NextResponse.redirect(
      `${baseUrl}/health?connected=${provider}`
    )
  } catch (error) {
    console.error(`Error exchanging code for ${provider}:`, error)

    // Store the error in the integration
    try {
      await prisma.healthIntegration.upsert({
        where: {
          userId_provider: { userId, provider: providerType }
        },
        update: {
          isConnected: false,
          syncError: error instanceof Error ? error.message : 'Unknown error'
        },
        create: {
          userId,
          provider: providerType,
          isConnected: false,
          syncError: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    } catch (dbError) {
      console.error('Error saving integration error:', dbError)
    }

    return NextResponse.redirect(
      `${baseUrl}/health?error=${encodeURIComponent('Failed to connect. Please try again.')}`
    )
  }
}

// Trigger initial sync (non-blocking)
async function triggerInitialSync(
  userId: string,
  provider: HealthProviderType,
  accessToken: string
) {
  try {
    const providerImpl = getProvider(provider)
    if (!providerImpl) return

    // Fetch metrics from the last 30 days
    const since = new Date()
    since.setDate(since.getDate() - 30)

    // Create sync log
    const syncLog = await prisma.healthSyncLog.create({
      data: {
        userId,
        provider,
        status: 'success', // Will update if fails
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
              provider,
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
            provider,
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
          userId_provider: { userId, provider }
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

    console.log(`Initial sync for ${provider}: ${metricsCount} metrics stored`)
  } catch (error) {
    console.error(`Initial sync error for ${provider}:`, error)

    // Update integration with error
    await prisma.healthIntegration.update({
      where: {
        userId_provider: { userId, provider }
      },
      data: {
        syncError: error instanceof Error ? error.message : 'Sync failed'
      }
    }).catch(console.error)
  }
}
