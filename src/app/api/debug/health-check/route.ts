import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// Public diagnostic endpoint - no auth required
// DELETE THIS after debugging
export async function GET() {
  try {
    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      version: 'diag-v4',
    }

    // Check DB connection
    try {
      const userCount = await prisma.userProfile.count()
      results.dbConnected = true
      results.userCount = userCount
    } catch (e) {
      results.dbConnected = false
      results.dbError = (e as Error).message
    }

    // Check metrics
    try {
      const metricCount = await prisma.healthMetric.count()
      results.metricCount = metricCount

      const latest = await prisma.healthMetric.findFirst({
        orderBy: { recordedAt: 'desc' },
        select: { recordedAt: true, metricType: true },
      })
      results.latestMetric = latest
    } catch (e) {
      results.metricError = (e as Error).message
    }

    // Check integrations
    try {
      const integrations = await prisma.healthIntegration.findMany({
        select: { provider: true, isConnected: true, lastSyncAt: true },
      })
      results.integrations = integrations
    } catch (e) {
      results.integrationError = (e as Error).message
    }

    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, version: 'diag-v4' },
      { status: 500 }
    )
  }
}
