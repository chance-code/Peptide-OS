import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import { subDays, format } from 'date-fns'
import { computeEnhancedBodyComp, type EnhancedBodyCompState } from '@/lib/health-trajectory'
import type { SeedMetric } from '@/lib/demo-data/seed-metrics'

// GET /api/health/body-comp?targetWeight=180&targetBodyFat=12
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const targetWeight = searchParams.get('targetWeight')
    const targetBodyFat = searchParams.get('targetBodyFat')

    const targets = (targetWeight != null || targetBodyFat != null) ? {
      weight: targetWeight != null ? parseFloat(targetWeight) : undefined,
      bodyFat: targetBodyFat != null ? parseFloat(targetBodyFat) : undefined,
    } : undefined

    // Validate targets if provided
    if (targets) {
      if (targets.weight != null && (isNaN(targets.weight) || targets.weight <= 0 || targets.weight > 1000)) {
        return NextResponse.json(
          { error: 'Invalid targetWeight. Must be a positive number.' },
          { status: 400 }
        )
      }
      if (targets.bodyFat != null && (isNaN(targets.bodyFat) || targets.bodyFat <= 0 || targets.bodyFat > 60)) {
        return NextResponse.json(
          { error: 'Invalid targetBodyFat. Must be between 0 and 60.' },
          { status: 400 }
        )
      }
    }

    // Fetch 90 days of body comp + basal calories data
    const bodyCompTypes = [
      'weight', 'body_fat_percentage', 'body_fat',
      'lean_body_mass', 'muscle_mass', 'bmi',
      'bone_mass', 'body_water', 'basal_calories',
    ]

    const since = subDays(new Date(), 90)
    const rawMetrics = await prisma.healthMetric.findMany({
      where: {
        userId,
        metricType: { in: bodyCompTypes },
        recordedAt: { gte: since },
      },
      select: {
        metricType: true,
        value: true,
        recordedAt: true,
      },
      orderBy: { recordedAt: 'asc' },
    })

    // Aggregate to daily values (average per day per metric)
    const dailyMap = new Map<string, { sum: number; count: number }>()
    for (const m of rawMetrics) {
      const dateKey = `${m.metricType}:${format(m.recordedAt, 'yyyy-MM-dd')}`
      const existing = dailyMap.get(dateKey)
      if (existing) {
        existing.sum += m.value
        existing.count++
      } else {
        dailyMap.set(dateKey, { sum: m.value, count: 1 })
      }
    }

    const seedMetrics: SeedMetric[] = Array.from(dailyMap.entries()).map(
      ([key, { sum, count }]) => {
        const [metricType, date] = key.split(':')
        return {
          metricType,
          date,
          value: sum / count,
          unit: '',
          source: 'aggregated',
        }
      }
    )

    const result: EnhancedBodyCompState = computeEnhancedBodyComp(seedMetrics, targets)

    return NextResponse.json({ bodyComp: result }, {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    console.error('Error computing body composition:', error)
    return NextResponse.json(
      { error: 'Failed to compute body composition analysis' },
      { status: 500 }
    )
  }
}
