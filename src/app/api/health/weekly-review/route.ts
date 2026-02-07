import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { generateWeeklyReview } from '@/lib/health-weekly-review'

// GET /api/health/weekly-review?weekEnd=2026-02-02
export async function GET(request: NextRequest) {
  const start = Date.now()
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const weekEndParam = searchParams.get('weekEnd')

    let weekEndDate: Date | undefined
    if (weekEndParam) {
      weekEndDate = new Date(weekEndParam)
      if (isNaN(weekEndDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid weekEnd date format. Use YYYY-MM-DD.' },
          { status: 400 }
        )
      }
    }

    const review = await generateWeeklyReview(userId, weekEndDate)

    // Detect empty report: no metrics moved and no protocols tracked
    const hasMetrics = review.overall.metricsImproving > 0
      || review.overall.metricsDeclining > 0
      || review.overall.metricsStable > 0
    const hasProtocols = review.protocols.length > 0
    const isEmpty = !hasMetrics && !hasProtocols

    console.log(`[health/weekly-review] userId=${userId} ${Date.now() - start}ms 200 empty=${isEmpty}`)
    return NextResponse.json({ review, isEmpty }, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error(`[health/weekly-review] ${Date.now() - start}ms 500`, error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to generate weekly review. Please try again.' },
      { status: 500 }
    )
  }
}
