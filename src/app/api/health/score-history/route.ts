import { NextRequest, NextResponse } from 'next/server'
import { verifyUserAccess } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// GET /api/health/score-history?userId=X&days=30
// Returns daily health scores over time
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 7), 90)

    const authResult = await verifyUserAccess(userId)
    if (!authResult.success) {
      return authResult.response
    }

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Query all health metrics for this user in the date range
    const metrics = await prisma.healthMetric.findMany({
      where: {
        userId: authResult.userId,
        recordedAt: { gte: startDate, lte: endDate },
      },
      select: {
        metricType: true,
        value: true,
        recordedAt: true,
      },
      orderBy: { recordedAt: 'asc' },
    })

    // Group metrics by date
    const byDate = new Map<string, { types: Set<string>; values: number[] }>()

    for (const metric of metrics) {
      const dateKey = metric.recordedAt.toISOString().split('T')[0]
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { types: new Set(), values: [] })
      }
      const day = byDate.get(dateKey)!
      day.types.add(metric.metricType)
      day.values.push(metric.value)
    }

    // For each date, compute a simplified score:
    // - More distinct metric types = more complete picture = higher base
    // - Quality factor: normalized mean of values (capped for sanity)
    // Score formula: min(100, metricTypeCount * 8 + qualityBonus)
    // This rewards days with more data coverage and reasonable values.
    const scores: { date: string; score: number; metricCount: number }[] = []

    for (const [date, day] of byDate) {
      const metricTypeCount = day.types.size

      // Quality factor: percentage of key metric categories present
      // Key categories: sleep, recovery (hrv/rhr), activity (steps/calories), body comp
      const sleepMetrics = ['sleep_duration', 'sleep_score', 'sleep_efficiency', 'rem_sleep', 'deep_sleep']
      const recoveryMetrics = ['hrv', 'rhr', 'blood_oxygen', 'respiratory_rate']
      const activityMetrics = ['steps', 'active_calories', 'exercise_minutes', 'vo2_max']

      const hasSleep = sleepMetrics.some(m => day.types.has(m))
      const hasRecovery = recoveryMetrics.some(m => day.types.has(m))
      const hasActivity = activityMetrics.some(m => day.types.has(m))

      const categoriesPresent = [hasSleep, hasRecovery, hasActivity].filter(Boolean).length
      // Base score: 20 per category present (max 60), plus bonus for metric diversity
      const categoryScore = categoriesPresent * 20
      const diversityBonus = Math.min(40, metricTypeCount * 4)

      const score = Math.min(100, Math.max(0, categoryScore + diversityBonus))

      scores.push({ date, score, metricCount: metricTypeCount })
    }

    // Sort by date ascending
    scores.sort((a, b) => a.date.localeCompare(b.date))

    const averageScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : null

    return NextResponse.json({
      scores,
      averageScore,
      days,
      totalDaysWithData: scores.length,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error fetching score history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch score history' },
      { status: 500 }
    )
  }
}
