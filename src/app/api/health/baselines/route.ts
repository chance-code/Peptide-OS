import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import { subDays, format } from 'date-fns'
import {
  computeMultiWindowBaseline,
  computeWeeklyPattern,
  computePersonalZones,
  calculateVolatility,
  calculateMomentum,
  classifySignal,
  METRIC_POLARITY,
  type DailyMetricValue,
  type MultiWindowBaseline,
  type WeeklyPattern,
  type PersonalZones,
  type MetricVolatility,
  type TrendMomentum,
  type SignalClass,
} from '@/lib/health-baselines'
import { getCached, setCached, baselineCacheKey } from '@/lib/health-baseline-cache'

interface MetricSignalResponse {
  classification: SignalClass
  confidence: number
}

interface MetricBaselineResponse {
  metricType: string
  baselines: MultiWindowBaseline
  weeklyPattern: WeeklyPattern | null
  personalZones: PersonalZones | null
  volatility: MetricVolatility | null
  momentum: TrendMomentum | null
}

// GET /api/health/baselines?metrics=hrv,sleep_duration
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const metricsParam = searchParams.get('metrics')

    if (!metricsParam) {
      return NextResponse.json(
        { error: 'metrics query parameter is required (comma-separated metric types)' },
        { status: 400 }
      )
    }

    const metricTypes = metricsParam.split(',').map(m => m.trim()).filter(Boolean)
    if (metricTypes.length === 0) {
      return NextResponse.json(
        { error: 'At least one metric type is required' },
        { status: 400 }
      )
    }

    // Cap at 10 metrics per request
    if (metricTypes.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 metrics per request' },
        { status: 400 }
      )
    }

    const results: MetricBaselineResponse[] = []
    const signals: Record<string, MetricSignalResponse> = {}

    for (const metricType of metricTypes) {
      // Check cache
      const cacheKey = baselineCacheKey(userId, metricType)
      const cached = getCached<MetricBaselineResponse>(cacheKey)
      if (cached) {
        results.push(cached)
        continue
      }

      // Fetch 90 days of data (enough for all windows)
      const since = subDays(new Date(), 90)
      const rawMetrics = await prisma.healthMetric.findMany({
        where: {
          userId,
          metricType,
          recordedAt: { gte: since },
        },
        select: {
          value: true,
          recordedAt: true,
        },
        orderBy: { recordedAt: 'asc' },
      })

      // Aggregate to daily values (average per day)
      const dailyMap = new Map<string, { sum: number; count: number }>()
      for (const m of rawMetrics) {
        const dateKey = format(m.recordedAt, 'yyyy-MM-dd')
        const existing = dailyMap.get(dateKey)
        if (existing) {
          existing.sum += m.value
          existing.count++
        } else {
          dailyMap.set(dateKey, { sum: m.value, count: 1 })
        }
      }

      const dailyValues: DailyMetricValue[] = Array.from(dailyMap.entries()).map(
        ([date, { sum, count }]) => ({ date, value: sum / count })
      )

      // Compute all baseline data
      const baselines = computeMultiWindowBaseline(dailyValues)

      // Set metricType on each baseline
      if (baselines.w7) baselines.w7.metricType = metricType
      if (baselines.w28) baselines.w28.metricType = metricType
      if (baselines.w90) baselines.w90.metricType = metricType

      const weeklyPattern = computeWeeklyPattern(dailyValues)
      if (weeklyPattern) weeklyPattern.metricType = metricType

      const personalZones = computePersonalZones(dailyValues)

      // Volatility from 28-day baseline
      const volatility = baselines.w28 ? calculateVolatility(baselines.w28) : null

      // Momentum
      const polarity = METRIC_POLARITY[metricType] ?? 'higher_better'
      const momentum = calculateMomentum(dailyValues, polarity, metricType)

      const result: MetricBaselineResponse = {
        metricType,
        baselines,
        weeklyPattern,
        personalZones,
        volatility,
        momentum,
      }

      // Classify signal using the 28-day baseline (or 7-day fallback)
      const signalBaseline = baselines.w28 ?? baselines.w7 ?? null
      let signal: MetricSignalResponse | null = null
      if (signalBaseline && dailyValues.length > 0) {
        const classified = classifySignal(metricType, dailyValues, signalBaseline, polarity)
        if (classified) {
          signal = {
            classification: classified.signalClass,
            confidence: classified.confidence,
          }
        }
      }

      // Cache for 5 minutes
      setCached(cacheKey, result)
      results.push(result)

      if (signal) {
        signals[metricType] = signal
      }
    }

    return NextResponse.json({ baselines: results, signals }, {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    console.error('Error computing baselines:', error)
    return NextResponse.json(
      { error: 'Failed to compute baselines' },
      { status: 500 }
    )
  }
}
