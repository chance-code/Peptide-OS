import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { MetricType } from '@/lib/health-providers'

// GET /api/health/metrics - Query health metrics
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const metricTypesStr = searchParams.get('metricTypes')
    const provider = searchParams.get('provider')

    // Default to last 30 days
    const endDate = endDateStr ? new Date(endDateStr) : new Date()
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Build query
    const where: {
      userId: string
      recordedAt: { gte: Date; lte: Date }
      metricType?: { in: string[] }
      provider?: string
    } = {
      userId,
      recordedAt: {
        gte: startDate,
        lte: endDate
      }
    }

    if (metricTypesStr) {
      const metricTypes = metricTypesStr.split(',') as MetricType[]
      where.metricType = { in: metricTypes }
    }

    if (provider) {
      where.provider = provider
    }

    // Fetch metrics
    const metrics = await prisma.healthMetric.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
      select: {
        id: true,
        provider: true,
        metricType: true,
        value: true,
        unit: true,
        recordedAt: true,
        context: true
      }
    })

    // Group by metric type for easier frontend consumption
    const groupedMetrics: Record<string, Array<{
      id: string
      provider: string
      value: number
      unit: string
      recordedAt: Date
      context: unknown
    }>> = {}

    for (const metric of metrics) {
      if (!groupedMetrics[metric.metricType]) {
        groupedMetrics[metric.metricType] = []
      }

      let parsedContext = null
      if (metric.context) {
        try {
          parsedContext = JSON.parse(metric.context)
        } catch {
          parsedContext = null
        }
      }

      groupedMetrics[metric.metricType].push({
        id: metric.id,
        provider: metric.provider,
        value: metric.value,
        unit: metric.unit,
        recordedAt: metric.recordedAt,
        context: parsedContext
      })
    }

    // Calculate basic stats for each metric type
    const stats: Record<string, {
      count: number
      min: number
      max: number
      avg: number
      latest: number
      latestDate: Date
    }> = {}

    for (const [metricType, values] of Object.entries(groupedMetrics)) {
      if (values.length === 0) continue

      const numericValues = values.map(v => v.value)
      const sum = numericValues.reduce((a, b) => a + b, 0)
      const latest = values[values.length - 1]

      stats[metricType] = {
        count: values.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        avg: sum / values.length,
        latest: latest.value,
        latestDate: latest.recordedAt
      }
    }

    return NextResponse.json({
      metrics: groupedMetrics,
      stats,
      dateRange: {
        start: startDate,
        end: endDate
      }
    }, {
      headers: {
        'Cache-Control': 'private, max-age=60' // 1 min cache
      }
    })
  } catch (error) {
    console.error('Error fetching health metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch health metrics' },
      { status: 500 }
    )
  }
}
