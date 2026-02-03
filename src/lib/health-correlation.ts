// Health Correlation Engine
// Calculates correlations between health metrics and protocol changes

import { prisma } from './prisma'
import { MetricType, getMetricDisplayName, formatMetricValue } from './health-providers'

export interface CorrelationResult {
  protocolId: string
  protocolName: string
  peptideName: string
  metricType: MetricType
  metricDisplayName: string
  beforeAvg: number
  afterAvg: number
  delta: number
  percentChange: number
  confidence: 'high' | 'medium' | 'low'
  dataPointsBefore: number
  dataPointsAfter: number
  startDate: Date
  insight: string
}

export interface InsightSummary {
  correlations: CorrelationResult[]
  topInsight: string | null
  hasEnoughData: boolean
}

/**
 * Calculate correlations between health metrics and protocol changes
 *
 * @param userId - The user's ID
 * @param metricType - Optional specific metric to analyze (analyzes all if not provided)
 * @param windowDays - Number of days before/after protocol start to analyze (default 14)
 */
export async function calculateCorrelations(
  userId: string,
  metricType?: MetricType,
  windowDays: number = 14
): Promise<CorrelationResult[]> {
  const correlations: CorrelationResult[] = []

  // Get all protocols with start dates (need at least some time since start)
  const minDaysActive = 7
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - minDaysActive)

  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      startDate: {
        lte: cutoffDate
      }
    },
    include: {
      peptide: {
        select: {
          name: true
        }
      }
    }
  })

  if (protocols.length === 0) {
    return []
  }

  // Get all health metrics for this user
  const metricQuery: { userId: string; metricType?: string } = { userId }
  if (metricType) {
    metricQuery.metricType = metricType
  }

  const metrics = await prisma.healthMetric.findMany({
    where: metricQuery,
    orderBy: { recordedAt: 'asc' }
  })

  if (metrics.length === 0) {
    return []
  }

  // Group metrics by type
  const metricsByType = new Map<string, Array<{ value: number; recordedAt: Date }>>()
  for (const metric of metrics) {
    if (!metricsByType.has(metric.metricType)) {
      metricsByType.set(metric.metricType, [])
    }
    metricsByType.get(metric.metricType)!.push({
      value: metric.value,
      recordedAt: metric.recordedAt
    })
  }

  // Calculate correlations for each protocol and metric type
  for (const protocol of protocols) {
    const protocolStart = new Date(protocol.startDate)

    // Calculate window boundaries
    const beforeStart = new Date(protocolStart)
    beforeStart.setDate(beforeStart.getDate() - windowDays)

    const afterEnd = new Date(protocolStart)
    afterEnd.setDate(afterEnd.getDate() + windowDays)

    for (const [mType, metricValues] of metricsByType) {
      // Get metrics before protocol start
      const beforeMetrics = metricValues.filter(
        m => m.recordedAt >= beforeStart && m.recordedAt < protocolStart
      )

      // Get metrics after protocol start
      const afterMetrics = metricValues.filter(
        m => m.recordedAt >= protocolStart && m.recordedAt <= afterEnd
      )

      // Need at least 3 data points in each window for meaningful comparison
      if (beforeMetrics.length < 3 || afterMetrics.length < 3) {
        continue
      }

      // Calculate averages
      const beforeAvg = beforeMetrics.reduce((sum, m) => sum + m.value, 0) / beforeMetrics.length
      const afterAvg = afterMetrics.reduce((sum, m) => sum + m.value, 0) / afterMetrics.length

      // Calculate delta and percent change
      const delta = afterAvg - beforeAvg
      const percentChange = beforeAvg !== 0 ? (delta / beforeAvg) * 100 : 0

      // Determine confidence based on data points
      const totalPoints = beforeMetrics.length + afterMetrics.length
      let confidence: 'high' | 'medium' | 'low'
      if (totalPoints >= 20) {
        confidence = 'high'
      } else if (totalPoints >= 10) {
        confidence = 'medium'
      } else {
        confidence = 'low'
      }

      // Skip if change is negligible (less than 2%)
      if (Math.abs(percentChange) < 2) {
        continue
      }

      // Generate insight text
      const metricName = getMetricDisplayName(mType as MetricType)
      const direction = delta > 0 ? 'increased' : 'decreased'
      const formattedDelta = formatMetricValue(Math.abs(delta), mType as MetricType)
      const insight = generateInsightText(
        mType as MetricType,
        protocol.peptide.name,
        delta,
        percentChange
      )

      correlations.push({
        protocolId: protocol.id,
        protocolName: `${protocol.peptide.name} Protocol`,
        peptideName: protocol.peptide.name,
        metricType: mType as MetricType,
        metricDisplayName: metricName,
        beforeAvg,
        afterAvg,
        delta,
        percentChange,
        confidence,
        dataPointsBefore: beforeMetrics.length,
        dataPointsAfter: afterMetrics.length,
        startDate: protocolStart,
        insight
      })
    }
  }

  // Sort by absolute percent change (most significant first)
  correlations.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))

  return correlations
}

/**
 * Generate a human-readable insight text
 */
function generateInsightText(
  metricType: MetricType,
  peptideName: string,
  delta: number,
  percentChange: number
): string {
  const direction = delta > 0 ? 'improved' : 'decreased'
  const absPercent = Math.abs(percentChange).toFixed(0)

  switch (metricType) {
    case 'sleep_duration':
      const minsDelta = Math.abs(delta)
      if (delta > 0) {
        return `Sleep duration increased ${minsDelta.toFixed(0)} min/night after starting ${peptideName}`
      } else {
        return `Sleep duration decreased ${minsDelta.toFixed(0)} min/night since starting ${peptideName}`
      }

    case 'sleep_score':
      return `Sleep score ${direction} ${absPercent}% since adding ${peptideName}`

    case 'hrv':
      if (delta > 0) {
        return `HRV improved ${absPercent}% since adding ${peptideName}`
      } else {
        return `HRV decreased ${absPercent}% since starting ${peptideName}`
      }

    case 'rhr':
      if (delta < 0) {
        // Lower RHR is generally better
        return `Resting heart rate improved (down ${Math.abs(delta).toFixed(0)} bpm) since adding ${peptideName}`
      } else {
        return `Resting heart rate increased ${delta.toFixed(0)} bpm since starting ${peptideName}`
      }

    case 'weight':
      const weightDelta = Math.abs(delta).toFixed(1)
      if (delta < 0) {
        return `Weight decreased ${weightDelta} kg since starting ${peptideName}`
      } else {
        return `Weight increased ${weightDelta} kg since starting ${peptideName}`
      }

    case 'steps':
      return `Daily steps ${direction} ${absPercent}% since adding ${peptideName}`

    case 'bed_temperature':
    case 'time_in_bed':
    default:
      return `${getMetricDisplayName(metricType)} ${direction} ${absPercent}% after starting ${peptideName}`
  }
}

/**
 * Get a summary of insights for the health dashboard
 */
export async function getInsightsSummary(userId: string): Promise<InsightSummary> {
  const correlations = await calculateCorrelations(userId)

  // Filter to only high and medium confidence correlations
  const significantCorrelations = correlations.filter(
    c => c.confidence !== 'low' && Math.abs(c.percentChange) >= 5
  )

  // Generate top insight (most significant positive change)
  let topInsight: string | null = null
  const positiveCorrelations = significantCorrelations.filter(c => {
    // For most metrics, positive delta is good
    // For RHR, negative delta (lower heart rate) is good
    if (c.metricType === 'rhr') {
      return c.delta < 0
    }
    return c.delta > 0
  })

  if (positiveCorrelations.length > 0) {
    topInsight = positiveCorrelations[0].insight
  }

  return {
    correlations: significantCorrelations.slice(0, 5), // Top 5 insights
    topInsight,
    hasEnoughData: correlations.length > 0
  }
}

/**
 * Get protocol markers for chart overlay
 * Returns protocol start dates with names for displaying on health charts
 */
export async function getProtocolMarkers(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: Date; name: string; id: string }>> {
  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      startDate: {
        gte: startDate,
        lte: endDate
      }
    },
    include: {
      peptide: {
        select: { name: true }
      }
    },
    orderBy: { startDate: 'asc' }
  })

  return protocols.map(p => ({
    date: p.startDate,
    name: p.peptide.name,
    id: p.id
  }))
}
