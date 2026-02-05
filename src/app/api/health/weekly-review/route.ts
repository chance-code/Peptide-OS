import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { generateWeeklyReview } from '@/lib/health-weekly-review'

// GET /api/health/weekly-review?weekEnd=2026-02-02
export async function GET(request: NextRequest) {
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

    return NextResponse.json({ review }, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('Error generating weekly review:', error)
    return NextResponse.json(
      { error: 'Failed to generate weekly review' },
      { status: 500 }
    )
  }
}
