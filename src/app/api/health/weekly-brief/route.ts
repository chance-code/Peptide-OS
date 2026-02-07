import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import { generateWeeklyReview } from '@/lib/health-weekly-review'
import { startOfWeek } from 'date-fns'

// GET /api/health/weekly-brief - Cached weekly health brief
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const weekStartParam = searchParams.get('weekStart')
    const weekStart = weekStartParam
      ? new Date(weekStartParam)
      : startOfWeek(new Date(), { weekStartsOn: 1 })

    // Check for cached brief
    const cached = await prisma.weeklyHealthBrief.findFirst({
      where: {
        userId,
        weekStartDate: {
          gte: weekStart,
          lt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (cached) {
      return NextResponse.json({
        brief: cached,
        cached: true,
      }, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      })
    }

    // Generate new review
    const review = await generateWeeklyReview(userId, weekStart)

    return NextResponse.json({
      brief: review,
      cached: false,
    }, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (error) {
    console.error('Weekly brief API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate weekly brief' },
      { status: 500 }
    )
  }
}
