import { NextRequest, NextResponse } from 'next/server'
import { verifyUserAccess } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { calculateDailyScore, DailyScoreResult } from '@/lib/health-synthesis'
import { MetricType } from '@/lib/health-providers'

interface DailyScoreResponse {
  date: string
  score: number
  categoryScores: {
    sleep: number | null
    recovery: number | null
    activity: number | null
    bodyComp: number | null
  }
  topPositive: { category: string; metric: string; contribution: string } | null
  topNegative: { category: string; metric: string; contribution: string } | null
}

// GET /api/health/score-history?userId=X&days=30
// Returns daily health scores over time using the real health scoring engine
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

    // Group metrics by date, keeping the latest value for each metric type per day
    const byDate = new Map<string, Map<MetricType, number>>()

    for (const metric of metrics) {
      const dateKey = metric.recordedAt.toISOString().split('T')[0]
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, new Map())
      }
      // Use the latest value for each metric type on each day
      byDate.get(dateKey)!.set(metric.metricType as MetricType, metric.value)
    }

    // Calculate real health score for each day
    const scores: DailyScoreResponse[] = []

    for (const [date, metricsMap] of byDate) {
      const result = calculateDailyScore(metricsMap)

      scores.push({
        date,
        score: result.overall,
        categoryScores: {
          sleep: result.sleep,
          recovery: result.recovery,
          activity: result.activity,
          bodyComp: result.bodyComp,
        },
        topPositive: result.topPositive,
        topNegative: result.topNegative,
      })
    }

    // Sort by date ascending
    scores.sort((a, b) => a.date.localeCompare(b.date))

    // Calculate statistics
    const scoreValues = scores.map(s => s.score)
    const averageScore = scores.length > 0
      ? Math.round(scoreValues.reduce((sum, s) => sum + s, 0) / scores.length)
      : null

    const minScore = scores.length > 0 ? Math.min(...scoreValues) : null
    const maxScore = scores.length > 0 ? Math.max(...scoreValues) : null

    // Find best and worst days
    let bestDay: { date: string; score: number } | null = null
    let worstDay: { date: string; score: number } | null = null

    if (scores.length > 0) {
      const maxIdx = scoreValues.indexOf(Math.max(...scoreValues))
      const minIdx = scoreValues.indexOf(Math.min(...scoreValues))
      bestDay = { date: scores[maxIdx].date, score: scores[maxIdx].score }
      worstDay = { date: scores[minIdx].date, score: scores[minIdx].score }
    }

    // Calculate trend (compare first half to second half)
    let trendPercent: number | null = null
    if (scores.length >= 4) {
      const midpoint = Math.floor(scores.length / 2)
      const firstHalf = scores.slice(0, midpoint)
      const secondHalf = scores.slice(midpoint)

      const firstAvg = firstHalf.reduce((s, d) => s + d.score, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((s, d) => s + d.score, 0) / secondHalf.length

      if (firstAvg > 0) {
        trendPercent = Math.round(((secondAvg - firstAvg) / firstAvg) * 1000) / 10 // One decimal
      }
    }

    // Calculate standard deviation for consistency metric
    let stdDev: number | null = null
    if (scores.length >= 2 && averageScore !== null) {
      const variance = scoreValues.reduce((sum, s) => sum + Math.pow(s - averageScore, 2), 0) / scores.length
      stdDev = Math.round(Math.sqrt(variance) * 10) / 10 // One decimal
    }

    // Calculate average category scores
    const categoryAverages = {
      sleep: null as number | null,
      recovery: null as number | null,
      activity: null as number | null,
      bodyComp: null as number | null,
    }

    for (const cat of ['sleep', 'recovery', 'activity', 'bodyComp'] as const) {
      const catScores = scores
        .map(s => s.categoryScores[cat])
        .filter((v): v is number => v !== null)

      if (catScores.length > 0) {
        categoryAverages[cat] = Math.round(catScores.reduce((s, v) => s + v, 0) / catScores.length)
      }
    }

    return NextResponse.json({
      scores,
      averageScore,
      minScore,
      maxScore,
      bestDay,
      worstDay,
      trendPercent,
      stdDev,
      categoryAverages,
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
