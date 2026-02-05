// Protocol Impact Analysis Engine
// Correlates active peptide/supplement protocols with health metric changes
// Uses baseline computation and mechanism database for evidence-based assessments

import prisma from '@/lib/prisma'
import { getUnifiedMetrics } from '@/lib/health-synthesis'
import { computeBaseline, type DailyMetricValue } from '@/lib/health-baselines'
import {
  findProtocolMechanism,
  isChangeExpected,
  getAffectedMetrics,
  getExpectedTimeline,
  isWithinExpectedTimeline,
  getProtocolInsight,
  type ProtocolMechanism,
} from '@/lib/protocol-mechanisms'
import { safeDivide, safePercentChange } from '@/lib/health-constants'
import { getMetricDisplayName, type MetricType } from '@/lib/health-providers'

// ============================================================================
// TYPES
// ============================================================================

export interface ProtocolImpact {
  protocolId: string
  peptideName: string
  peptideCategory: string
  startDate: string
  daysSinceStart: number
  metrics: ProtocolMetricImpact[]
  overallAssessment: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ProtocolMetricImpact {
  metricType: string
  metricLabel: string
  beforeAvg: number
  afterAvg: number
  changePercent: number
  direction: 'improving' | 'declining' | 'stable'
  isExpectedEffect: boolean
  expectedEffect: string | null
  dataPointsBefore: number
  dataPointsAfter: number
  confidence: 'high' | 'medium' | 'low'
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Minimum days on protocol before we attempt analysis
const MIN_DAYS_FOR_ANALYSIS = 7

// How many days before protocol start we look for baseline data
const BEFORE_WINDOW_DAYS = 28

// Minimum data points required in either window for a valid comparison
const MIN_DATA_POINTS = 3

// Metric polarity — which direction is "improving"
const METRIC_POLARITY: Record<string, 'higher_better' | 'lower_better'> = {
  hrv: 'higher_better',
  rhr: 'lower_better',
  resting_heart_rate: 'lower_better',
  sleep_duration: 'higher_better',
  deep_sleep: 'higher_better',
  rem_sleep: 'higher_better',
  sleep_efficiency: 'higher_better',
  sleep_score: 'higher_better',
  sleep_quality: 'higher_better',
  sleep_latency: 'lower_better',
  time_in_bed: 'higher_better',
  readiness_score: 'higher_better',
  recovery_score: 'higher_better',
  steps: 'higher_better',
  active_calories: 'higher_better',
  exercise_minutes: 'higher_better',
  stand_hours: 'higher_better',
  vo2_max: 'higher_better',
  walking_running_distance: 'higher_better',
  weight: 'lower_better',
  body_fat_percentage: 'lower_better',
  body_fat: 'lower_better',
  bmi: 'lower_better',
  lean_body_mass: 'higher_better',
  muscle_mass: 'higher_better',
  bone_mass: 'higher_better',
  body_water: 'higher_better',
  blood_oxygen: 'higher_better',
  respiratory_rate: 'lower_better',
}

// Stable threshold — below this %, direction is "stable"
const STABLE_THRESHOLD = 3

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze the impact of all active protocols on a user's health metrics.
 * For each active protocol:
 *   1. Compute a "before" baseline from 14-28 days before the protocol start
 *   2. Compute "after" averages from protocol start to now
 *   3. Compare with mechanism database for expected effects
 *   4. Return structured impact analysis
 */
export async function analyzeProtocolImpact(userId: string): Promise<ProtocolImpact[]> {
  // Step 1: Query all active protocols for this user
  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: 'active',
    },
    include: {
      peptide: {
        select: { name: true, type: true, category: true },
      },
    },
    orderBy: { startDate: 'desc' },
    take: 10, // Limit to 10 most recent active protocols
  })

  if (protocols.length === 0) {
    return []
  }

  const impacts: ProtocolImpact[] = []

  for (const protocol of protocols) {
    const startDate = new Date(protocol.startDate)
    const now = new Date()
    const daysSinceStart = Math.floor(
      (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Skip protocols that are too new for meaningful analysis
    if (daysSinceStart < MIN_DAYS_FOR_ANALYSIS) {
      continue
    }

    const peptideName = protocol.peptide.name
    const mechanism = findProtocolMechanism(peptideName)
    const peptideCategory = mechanism?.category ?? protocol.peptide.type ?? 'unknown'

    // Determine which metrics to analyze
    // If we have mechanism data, focus on affected metrics; otherwise use a broad set
    const metricsToAnalyze = mechanism
      ? getAffectedMetrics(peptideName)
      : getDefaultMetricsToAnalyze()

    if (metricsToAnalyze.length === 0) {
      continue
    }

    // Step 2: Fetch "before" data (14-28 days before protocol start)
    const beforeStart = new Date(startDate)
    beforeStart.setDate(beforeStart.getDate() - BEFORE_WINDOW_DAYS)

    // "before" window ends at protocol start date
    const beforeMetrics = await getUnifiedMetrics(
      userId,
      beforeStart,
      startDate,
      metricsToAnalyze as MetricType[]
    )

    // Step 3: Fetch "after" data (protocol start to now)
    const afterMetrics = await getUnifiedMetrics(
      userId,
      startDate,
      now,
      metricsToAnalyze as MetricType[]
    )

    // Step 4: Compute impacts per metric
    const metricImpacts: ProtocolMetricImpact[] = []
    const weeksOnProtocol = daysSinceStart / 7

    for (const metricType of metricsToAnalyze) {
      const beforeData = beforeMetrics.get(metricType as MetricType) ?? []
      const afterData = afterMetrics.get(metricType as MetricType) ?? []

      // Need sufficient data in both windows
      if (beforeData.length < MIN_DATA_POINTS || afterData.length < MIN_DATA_POINTS) {
        continue
      }

      // Convert to DailyMetricValue format for baseline computation
      const beforeValues: DailyMetricValue[] = beforeData.map((m) => ({
        date: m.date,
        value: m.value,
      }))

      // Compute baseline from "before" period
      const baseline = computeBaseline(
        beforeValues,
        BEFORE_WINDOW_DAYS,
        startDate,
        MIN_DATA_POINTS
      )
      if (!baseline) {
        continue
      }

      const beforeAvg = baseline.mean

      // Compute "after" average
      const afterAvg =
        afterData.reduce((sum, m) => sum + m.value, 0) / afterData.length

      // Calculate change
      const changePercent = safePercentChange(afterAvg, beforeAvg) ?? 0

      // Determine direction based on polarity
      const polarity = METRIC_POLARITY[metricType] ?? 'higher_better'
      let direction: 'improving' | 'declining' | 'stable'
      if (Math.abs(changePercent) < STABLE_THRESHOLD) {
        direction = 'stable'
      } else if (polarity === 'higher_better') {
        direction = changePercent > 0 ? 'improving' : 'declining'
      } else {
        direction = changePercent < 0 ? 'improving' : 'declining'
      }

      // Check if the change matches expected effects from the mechanism database
      let isExpectedEffect = false
      let expectedEffect: string | null = null

      if (mechanism && direction !== 'stable') {
        const result = isChangeExpected(
          peptideName,
          metricType,
          direction,
          Math.floor(weeksOnProtocol)
        )
        isExpectedEffect = result.expected
        expectedEffect = result.expected ? result.explanation : null
      }

      // Determine confidence for this metric comparison
      const metricConfidence = computeMetricConfidence(
        beforeData.length,
        afterData.length,
        daysSinceStart,
        baseline.stdDev,
        beforeAvg
      )

      metricImpacts.push({
        metricType,
        metricLabel: getMetricDisplayName(metricType as MetricType),
        beforeAvg: round(beforeAvg, 2),
        afterAvg: round(afterAvg, 2),
        changePercent: round(changePercent, 1),
        direction,
        isExpectedEffect,
        expectedEffect,
        dataPointsBefore: beforeData.length,
        dataPointsAfter: afterData.length,
        confidence: metricConfidence,
      })
    }

    if (metricImpacts.length === 0) {
      continue
    }

    // Step 5: Sort metrics — expected effects first, then by magnitude
    metricImpacts.sort((a, b) => {
      if (a.isExpectedEffect && !b.isExpectedEffect) return -1
      if (!a.isExpectedEffect && b.isExpectedEffect) return 1
      return Math.abs(b.changePercent) - Math.abs(a.changePercent)
    })

    // Step 6: Compute overall confidence
    const overallConfidence = computeOverallConfidence(metricImpacts, daysSinceStart)

    // Step 7: Generate overall assessment
    const overallAssessment = generateOverallAssessment(
      peptideName,
      mechanism,
      metricImpacts,
      daysSinceStart,
      weeksOnProtocol
    )

    impacts.push({
      protocolId: protocol.id,
      peptideName,
      peptideCategory,
      startDate: startDate.toISOString(),
      daysSinceStart,
      metrics: metricImpacts,
      overallAssessment,
      confidence: overallConfidence,
    })
  }

  // Sort by protocols with most data / strongest effects first
  impacts.sort((a, b) => {
    const aScore = a.metrics.reduce((s, m) => s + Math.abs(m.changePercent), 0)
    const bScore = b.metrics.reduce((s, m) => s + Math.abs(m.changePercent), 0)
    return bScore - aScore
  })

  return impacts
}

// ============================================================================
// HELPERS
// ============================================================================

function getDefaultMetricsToAnalyze(): string[] {
  return [
    'hrv',
    'rhr',
    'sleep_duration',
    'deep_sleep',
    'sleep_score',
    'sleep_efficiency',
    'steps',
    'active_calories',
    'exercise_minutes',
    'weight',
    'body_fat_percentage',
    'lean_body_mass',
    'muscle_mass',
    'vo2_max',
    'recovery_score',
    'readiness_score',
    'resting_heart_rate',
  ]
}

/**
 * Compute confidence for a single metric comparison.
 * Based on:
 *   - Data density in both windows
 *   - Time on protocol (more time = more confidence)
 *   - Signal-to-noise ratio (change vs variability)
 */
function computeMetricConfidence(
  dataPointsBefore: number,
  dataPointsAfter: number,
  daysSinceStart: number,
  baselineStdDev: number,
  baselineMean: number
): 'high' | 'medium' | 'low' {
  let score = 0

  // Data density (0-3 points)
  if (dataPointsBefore >= 7 && dataPointsAfter >= 7) score += 3
  else if (dataPointsBefore >= 5 && dataPointsAfter >= 5) score += 2
  else if (dataPointsBefore >= MIN_DATA_POINTS && dataPointsAfter >= MIN_DATA_POINTS) score += 1

  // Time on protocol (0-2 points)
  if (daysSinceStart >= 28) score += 2
  else if (daysSinceStart >= 14) score += 1

  // Signal quality — low coefficient of variation means cleaner signal (0-1 point)
  const cv = safeDivide(baselineStdDev, Math.abs(baselineMean))
  if (cv !== null && cv < 0.2) score += 1

  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

/**
 * Compute overall confidence for a protocol's impact analysis.
 */
function computeOverallConfidence(
  metrics: ProtocolMetricImpact[],
  daysSinceStart: number
): 'high' | 'medium' | 'low' {
  if (metrics.length === 0) return 'low'

  const highCount = metrics.filter((m) => m.confidence === 'high').length
  const mediumCount = metrics.filter((m) => m.confidence === 'medium').length

  // Need both sufficient time and data
  if (daysSinceStart >= 21 && highCount >= 2) return 'high'
  if (daysSinceStart >= 14 && (highCount >= 1 || mediumCount >= 2)) return 'medium'
  return 'low'
}

/**
 * Generate a human-readable overall assessment string.
 */
function generateOverallAssessment(
  peptideName: string,
  mechanism: ProtocolMechanism | null,
  metrics: ProtocolMetricImpact[],
  daysSinceStart: number,
  weeksOnProtocol: number
): string {
  const improving = metrics.filter((m) => m.direction === 'improving')
  const declining = metrics.filter((m) => m.direction === 'declining')
  const expectedImproving = improving.filter((m) => m.isExpectedEffect)

  // Case 1: Expected improvements observed
  if (expectedImproving.length > 0) {
    const topMetrics = expectedImproving
      .slice(0, 2)
      .map((m) => m.metricLabel.toLowerCase())
      .join(' and ')

    // Use protocol-specific insight template if available
    if (mechanism && expectedImproving[0]) {
      const status = weeksOnProtocol < 2 ? 'earlyImproving' : 'improving'
      const insight = getProtocolInsight(
        peptideName,
        expectedImproving[0].metricType,
        status,
        expectedImproving[0].changePercent
      )
      if (insight) return insight
    }

    return `${peptideName} showing expected improvements in ${topMetrics} after ${daysSinceStart} days.`
  }

  // Case 2: General improvements without mechanism match
  if (improving.length > 0 && declining.length === 0) {
    const topMetrics = improving
      .slice(0, 2)
      .map((m) => m.metricLabel.toLowerCase())
      .join(' and ')
    return `Positive trends in ${topMetrics} since starting ${peptideName} ${daysSinceStart} days ago.`
  }

  // Case 3: Mixed results
  if (improving.length > 0 && declining.length > 0) {
    return `Mixed results after ${daysSinceStart} days on ${peptideName}: ${improving.length} metric${improving.length > 1 ? 's' : ''} improving, ${declining.length} declining. Continue monitoring.`
  }

  // Case 4: Declining
  if (declining.length > 0 && improving.length === 0) {
    // Check if decline might be expected (e.g., weight on semaglutide)
    const expectedDeclines = declining.filter((m) => m.isExpectedEffect)
    if (expectedDeclines.length > 0) {
      const topMetric = expectedDeclines[0].metricLabel.toLowerCase()
      return `${peptideName} producing expected changes in ${topMetric} after ${daysSinceStart} days.`
    }
    return `Health metrics have declined since starting ${peptideName} ${daysSinceStart} days ago. Consider discussing with your provider.`
  }

  // Case 5: All stable
  if (daysSinceStart < 14) {
    return `${peptideName} started ${daysSinceStart} days ago. Most protocols take 2-4 weeks to show measurable effects.`
  }

  // Check if we're still within expected timeline
  if (mechanism) {
    const allEffects = Object.values(mechanism.expectedEffects)
    const maxTimelineDays = Math.max(
      ...allEffects.map((e) => e.timelineDays?.[1] ?? e.timelineWeeks[1] * 7)
    )
    if (daysSinceStart < maxTimelineDays) {
      return `No significant changes yet on ${peptideName} after ${daysSinceStart} days. Expected effects typically emerge within ${Math.round(maxTimelineDays / 7)} weeks.`
    }
  }

  return `Metrics stable since starting ${peptideName} ${daysSinceStart} days ago. Continue monitoring.`
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}
