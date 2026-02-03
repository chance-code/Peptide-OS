import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import {
  calculateCorrelations,
  getInsightsSummary,
  getProtocolMarkers
} from '@/lib/health-correlation'
import { MetricType } from '@/lib/health-providers'

// GET /api/health/insights - Generate correlation insights
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const metricType = searchParams.get('metricType') as MetricType | null
    const windowDays = parseInt(searchParams.get('windowDays') || '14', 10)
    const includeSummary = searchParams.get('summary') !== 'false'
    const includeMarkers = searchParams.get('markers') === 'true'

    // Calculate correlations
    const correlations = await calculateCorrelations(
      userId,
      metricType || undefined,
      windowDays
    )

    // Get summary if requested
    let summary = null
    if (includeSummary) {
      summary = await getInsightsSummary(userId)
    }

    // Get protocol markers if requested
    let markers = null
    if (includeMarkers) {
      const startDateStr = searchParams.get('startDate')
      const endDateStr = searchParams.get('endDate')

      const endDate = endDateStr ? new Date(endDateStr) : new Date()
      const startDate = startDateStr
        ? new Date(startDateStr)
        : new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000) // 90 days

      markers = await getProtocolMarkers(userId, startDate, endDate)
    }

    return NextResponse.json({
      correlations,
      summary,
      markers
    }, {
      headers: {
        // Insights are expensive to compute, cache for longer
        'Cache-Control': 'private, max-age=300' // 5 min cache
      }
    })
  } catch (error) {
    console.error('Error generating health insights:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}
