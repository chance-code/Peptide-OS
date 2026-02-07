import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

// GET /api/health/cohort-insights - Get cohort insights for current user
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    // Check opt-in status
    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { cohortOptIn: true },
    })

    if (!user?.cohortOptIn) {
      return NextResponse.json({ insights: [], optedIn: false })
    }

    const insights = await prisma.cohortInsight.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { generatedAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      insights,
      optedIn: true,
    }, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (error) {
    console.error('Cohort insights API error:', error)
    return NextResponse.json({ error: 'Failed to fetch cohort insights' }, { status: 500 })
  }
}
