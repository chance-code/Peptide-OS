import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getProvider, getProviderInfo, HealthProviderType, MetricSyncState } from '@/lib/health-providers'

// Import providers to register them
import '@/lib/health-providers/oura'
import '@/lib/health-providers/whoop'
import '@/lib/health-providers/apple-health'

// GET /api/health/integrations - List user's health integrations
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    // Get user's integrations
    const integrations = await prisma.healthIntegration.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        isConnected: true,
        lastSyncAt: true,
        syncError: true,
        enabledMetrics: true,
        createdAt: true,
        updatedAt: true
      }
    })

    // Merge with provider info, parse per-metric sync state
    const providerInfoList = getProviderInfo()
    const result = providerInfoList.map(info => {
      const integration = integrations.find(i => i.provider === info.name)
      let metricSyncState: MetricSyncState | null = null
      if (integration?.enabledMetrics) {
        try {
          metricSyncState = JSON.parse(integration.enabledMetrics) as MetricSyncState
        } catch { /* ignore malformed JSON */ }
      }
      return {
        ...info,
        integration: integration ? {
          id: integration.id,
          provider: integration.provider,
          isConnected: integration.isConnected,
          lastSyncAt: integration.lastSyncAt,
          syncError: integration.syncError,
          metricSyncState,
        } : null
      }
    })

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=30'
      }
    })
  } catch (error) {
    console.error('Error fetching health integrations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch health integrations' },
      { status: 500 }
    )
  }
}

// POST /api/health/integrations - Initiate OAuth flow or connect Apple Health
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const body = await request.json()
    const { provider } = body as { provider: HealthProviderType }

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    const providerImpl = getProvider(provider)
    if (!providerImpl) {
      return NextResponse.json(
        { error: 'Unknown provider' },
        { status: 400 }
      )
    }

    // Handle Apple Health (native permissions, no OAuth)
    if (provider === 'apple_health') {
      // Create or update integration record
      const integration = await prisma.healthIntegration.upsert({
        where: {
          userId_provider: { userId, provider }
        },
        update: {
          isConnected: true,
          syncError: null
        },
        create: {
          userId,
          provider,
          isConnected: true
        }
      })

      return NextResponse.json({
        integration,
        requiresNativePermission: true
      })
    }

    // For OAuth providers (Oura)
    if (!providerImpl.getAuthUrl) {
      return NextResponse.json(
        { error: 'Provider does not support OAuth' },
        { status: 400 }
      )
    }

    // Build redirect URI - use provider-specific short paths
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    let redirectUri: string
    switch (provider) {
      case 'oura':
        redirectUri = `${baseUrl}/oauth/oura`
        break
      case 'whoop':
        redirectUri = `${baseUrl}/oauth/whoop`
        break
      default:
        redirectUri = `${baseUrl}/api/health/integrations/${provider}/callback`
    }

    const authUrl = providerImpl.getAuthUrl(userId, redirectUri)

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Error initiating health integration:', error)
    return NextResponse.json(
      { error: 'Failed to initiate integration' },
      { status: 500 }
    )
  }
}

// DELETE /api/health/integrations - Disconnect integration
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') as HealthProviderType

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    // Find the integration
    const integration = await prisma.healthIntegration.findUnique({
      where: {
        userId_provider: { userId, provider }
      }
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    // Try to revoke access token if available
    const providerImpl = getProvider(provider)
    if (providerImpl?.revokeAccess && integration.accessToken) {
      try {
        await providerImpl.revokeAccess(integration.accessToken)
      } catch (error) {
        console.error('Error revoking access:', error)
        // Continue with deletion even if revoke fails
      }
    }

    // Delete the integration
    await prisma.healthIntegration.delete({
      where: {
        userId_provider: { userId, provider }
      }
    })

    // Optionally delete associated metrics
    const deleteMetrics = searchParams.get('deleteMetrics') === 'true'
    if (deleteMetrics) {
      await prisma.healthMetric.deleteMany({
        where: { userId, provider }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting health integration:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect integration' },
      { status: 500 }
    )
  }
}
