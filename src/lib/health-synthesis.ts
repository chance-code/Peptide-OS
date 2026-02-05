// Advanced Health Data Synthesis Engine
// Unifies multi-source data and generates intelligent, actionable insights

import { prisma } from './prisma'
import { MetricType, getMetricDisplayName, formatMetricValue } from './health-providers'
import { findProtocolMechanism, getProtocolInsight, isChangeExpected, confidenceScore } from './protocol-mechanisms'
import { getRecommendations, formatTopRecommendations } from './health-claims'
import { safeDivide, safePercentChange, getStableThreshold, validateMetricValue } from './health-constants'
import { derivePolarityMap, deriveOptimalRanges } from './health-metric-contract'

// Active protocol type for protocol-aware insights
interface ActiveProtocol {
  name: string
  startDate: Date
}

// ============================================================================
// HELPERS
// ============================================================================

// Helper: Clamp percent change to prevent extreme values from division edge cases
function clampPercent(pct: number): number {
  return Math.max(-500, Math.min(500, pct))
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const SOURCE_PRIORITY: Record<string, string[]> = {
  // Sleep - prefer Oura > WHOOP > Apple Health (watch aggregation)
  sleep_duration: ['oura', 'whoop', 'apple_health'],
  rem_sleep: ['oura', 'whoop', 'apple_health'],
  deep_sleep: ['oura', 'whoop', 'apple_health'],
  sleep_score: ['oura', 'whoop', 'apple_health'],
  sleep_efficiency: ['oura', 'whoop', 'apple_health'],
  waso: ['oura', 'whoop', 'apple_health'],
  sleep_latency: ['oura', 'whoop', 'apple_health'],
  bed_temperature: ['oura', 'apple_health'],
  time_in_bed: ['oura', 'whoop', 'apple_health'],
  // Heart & HRV - Apple Watch > WHOOP > Oura
  hrv: ['apple_health', 'whoop', 'oura'],
  rhr: ['apple_health', 'whoop', 'oura'],
  // Body Composition (primarily from scales via Apple Health)
  weight: ['apple_health', 'oura'],
  body_fat_percentage: ['apple_health'],
  lean_body_mass: ['apple_health'],
  bmi: ['apple_health'],
  bone_mass: ['apple_health'],
  muscle_mass: ['apple_health'],
  body_water: ['apple_health'],
  // Activity
  steps: ['apple_health', 'oura', 'whoop'],
  active_calories: ['apple_health', 'oura', 'whoop'],
  basal_calories: ['apple_health'],
  exercise_minutes: ['apple_health', 'oura', 'whoop'],
  stand_hours: ['apple_health'],
  vo2_max: ['apple_health', 'oura', 'whoop'],
  walking_running_distance: ['apple_health', 'oura', 'whoop'],
  // Vitals
  respiratory_rate: ['apple_health', 'oura'],
  blood_oxygen: ['apple_health', 'oura'],
  body_temperature: ['apple_health', 'oura'],
  // Oura readiness & recovery
  readiness_score: ['oura'],
  temperature_deviation: ['oura'],
  stress_high: ['oura'],
  recovery_high: ['oura'],
  resilience_level: ['oura'],
  // WHOOP-specific metrics
  strain_score: ['whoop'],
  recovery_score: ['whoop'],
}

// Polarity map derived from the metric contract (single source of truth)
const METRIC_POLARITY = derivePolarityMap() as Record<MetricType, 'higher_better' | 'lower_better' | 'neutral'>

// Optimal ranges derived from the metric contract (single source of truth)
const OPTIMAL_RANGES = deriveOptimalRanges() as Record<MetricType, { min: number; optimal: number; max: number; unit: string }>

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedDailyMetric {
  date: string
  metricType: MetricType
  value: number
  unit: string
  source: string
  context?: Record<string, unknown>
  alternativeSources?: Array<{ provider: string; value: number }>
}

export interface HealthTrend {
  metricType: MetricType
  displayName: string
  currentValue: number
  previousValue: number
  change: number
  changePercent: number
  trend: 'improving' | 'declining' | 'stable'
  momentum: 'accelerating' | 'decelerating' | 'steady' // Is the trend strengthening?
  confidence: 'high' | 'medium' | 'low'
  dataPoints: number
  consistency: number // 0-100, how consistent are the values
  personalBest?: number
  personalBestDate?: string
}

export interface ScoreAttribution {
  topPositive: { category: string; metric: string; contribution: string } | null
  topNegative: { category: string; metric: string; contribution: string } | null
  categoryBreakdown: Array<{ category: string; score: number; weight: number; delta: number | null }>
}

export interface HealthScore {
  overall: number | null
  sleep: number | null
  recovery: number | null
  activity: number | null
  bodyComp: number | null  // Body composition score (when data available)
  readiness: number | null // Daily readiness score
  breakdown: Array<{
    metric: MetricType
    score: number
    weight: number
    trend: 'up' | 'down' | 'stable'
    vsOptimal: number // % of optimal
  }>
  scoreAttribution: ScoreAttribution | null
}

export interface SynthesizedInsight {
  id: string
  type: 'improvement' | 'concern' | 'observation' | 'recommendation' | 'correlation' | 'prediction'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  details?: string // Additional context
  metrics: MetricType[]
  dataPoints?: number
  confidence?: number
  relatedProtocol?: { id: string; name: string }
  actionable?: string // What the user can do
}

export interface DayPattern {
  dayOfWeek: number // 0-6
  dayName: string
  avgSleepScore?: number
  avgSteps?: number
  avgHrv?: number
  isBestDay: boolean
  isWorstDay: boolean
}

export interface ProtocolImpact {
  protocolId: string
  protocolName: string
  peptideName: string
  startDate: Date
  daysSinceStart: number
  metrics: Array<{
    metricType: MetricType
    beforeAvg: number
    afterAvg: number
    change: number
    changePercent: number
    isSignificant: boolean
    dataPointsBefore: number
    dataPointsAfter: number
  }>
  overallImpact: 'positive' | 'negative' | 'neutral'
  impactScore: number // -100 to +100
}

export interface SleepArchitecture {
  avgDuration: number
  avgScore: number | null      // null if no sleep_score data
  avgTimeInBed: number | null  // null if no time_in_bed data
  efficiency: number | null    // null if time_in_bed unavailable
  consistencyScore: number // How consistent is sleep timing
  avgBedTemp?: number
  optimalTempNights?: number
  avgWaso?: number              // Wake after sleep onset (minutes)
  avgSleepLatency?: number     // Time to fall asleep (minutes)
  avgSleepEfficiency?: number  // Direct efficiency metric from device (%)
  recentTrend: 'improving' | 'declining' | 'stable'
}

export interface RecoveryStatus {
  score: number // 0-100
  status: 'excellent' | 'good' | 'moderate' | 'poor'
  hrvTrend: 'up' | 'down' | 'stable'
  rhrTrend: 'up' | 'down' | 'stable'
  sleepQuality: 'excellent' | 'good' | 'fair' | 'poor'
  recommendation: string
}

// ============================================================================
// SLEEP STAGE VALIDATION
// ============================================================================

/**
 * Validates that sleep stages (deep, REM, light) don't exceed total sleep duration.
 * If they do, proportionally scales the stages down to fit within total sleep.
 * Returns corrected values and logs a warning when correction is applied.
 */
export function validateSleepStages(
  sleepDuration: number,
  deepSleep: number,
  remSleep: number,
  lightSleep: number
): { deepSleep: number; remSleep: number; lightSleep: number; corrected: boolean } {
  const stageSum = deepSleep + remSleep + lightSleep

  if (stageSum <= 0 || sleepDuration <= 0) {
    return { deepSleep, remSleep, lightSleep, corrected: false }
  }

  if (stageSum <= sleepDuration) {
    return { deepSleep, remSleep, lightSleep, corrected: false }
  }

  // Proportionally scale stages down to fit within total sleep duration
  const scaleFactor = sleepDuration / stageSum
  const correctedDeep = Math.round(deepSleep * scaleFactor * 100) / 100
  const correctedRem = Math.round(remSleep * scaleFactor * 100) / 100
  const correctedLight = Math.round(lightSleep * scaleFactor * 100) / 100

  console.warn(
    `[Sleep Stage Validation] Stages (${stageSum.toFixed(0)} min) exceed total sleep (${sleepDuration.toFixed(0)} min). ` +
    `Scaling down by ${(scaleFactor * 100).toFixed(1)}%: ` +
    `deep ${deepSleep.toFixed(0)}->${correctedDeep.toFixed(0)}, ` +
    `REM ${remSleep.toFixed(0)}->${correctedRem.toFixed(0)}, ` +
    `light ${lightSleep.toFixed(0)}->${correctedLight.toFixed(0)}`
  )

  return { deepSleep: correctedDeep, remSleep: correctedRem, lightSleep: correctedLight, corrected: true }
}

// ============================================================================
// CORE DATA FUNCTIONS
// ============================================================================

export async function getUnifiedMetrics(
  userId: string,
  startDate: Date,
  endDate: Date,
  metricTypes?: MetricType[]
): Promise<Map<MetricType, UnifiedDailyMetric[]>> {
  const where: {
    userId: string
    recordedAt: { gte: Date; lte: Date }
    metricType?: { in: string[] }
  } = {
    userId,
    recordedAt: { gte: startDate, lte: endDate },
  }

  if (metricTypes) {
    where.metricType = { in: metricTypes }
  }

  const rawMetrics = await prisma.healthMetric.findMany({
    where,
    orderBy: { recordedAt: 'asc' }
  })

  // Group by metric type and date, keeping context
  const byTypeAndDate = new Map<string, Map<string, Array<{
    provider: string
    value: number
    unit: string
    context?: Record<string, unknown>
  }>>>()

  for (const metric of rawMetrics) {
    const dateKey = metric.recordedAt.toISOString().split('T')[0]
    const typeKey = metric.metricType

    if (!byTypeAndDate.has(typeKey)) {
      byTypeAndDate.set(typeKey, new Map())
    }

    const dateMap = byTypeAndDate.get(typeKey)!
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, [])
    }

    let context: Record<string, unknown> | undefined
    if (metric.context) {
      try {
        context = JSON.parse(metric.context)
      } catch {
        context = undefined
      }
    }

    dateMap.get(dateKey)!.push({
      provider: metric.provider,
      value: metric.value,
      unit: metric.unit,
      context
    })
  }

  // Select best value for each date
  const unified = new Map<MetricType, UnifiedDailyMetric[]>()

  for (const [metricType, dateMap] of byTypeAndDate) {
    const metrics: UnifiedDailyMetric[] = []
    const priority = SOURCE_PRIORITY[metricType as MetricType] || []

    for (const [date, providers] of dateMap) {
      providers.sort((a, b) => {
        const aIdx = priority.indexOf(a.provider)
        const bIdx = priority.indexOf(b.provider)
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
      })

      const best = providers[0]
      const alternatives = providers.slice(1).map(p => ({
        provider: p.provider,
        value: p.value
      }))

      metrics.push({
        date,
        metricType: metricType as MetricType,
        value: best.value,
        unit: best.unit,
        source: best.provider,
        context: best.context,
        alternativeSources: alternatives.length > 0 ? alternatives : undefined
      })
    }

    unified.set(metricType as MetricType, metrics)
  }

  return unified
}

// ============================================================================
// ADVANCED ANALYTICS
// ============================================================================

export function calculateConsistency(values: number[]): number {
  if (values.length < 2) return 100
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0 || !isFinite(mean)) return 50 // Can't compute CV without positive mean
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  const cv = safeDivide(stdDev, Math.abs(mean))
  if (cv === null) return 50
  return Math.max(0, Math.min(100, 100 - cv * 100 * 2))
}

export function calculateMomentum(
  currentChange: number,
  previousChange: number
): 'accelerating' | 'decelerating' | 'steady' {
  const diff = Math.abs(currentChange) - Math.abs(previousChange)
  if (Math.abs(diff) < 2) return 'steady'
  if (currentChange > 0 && diff > 0) return 'accelerating'
  if (currentChange < 0 && diff > 0) return 'accelerating'
  return 'decelerating'
}

export async function calculateHealthTrends(
  userId: string,
  periodDays: number = 7
): Promise<HealthTrend[]> {
  const endDate = new Date()
  let midDate = new Date()
  midDate.setDate(midDate.getDate() - periodDays)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays * 3) // Get 3 periods for momentum

  const allMetrics = await getUnifiedMetrics(userId, startDate, endDate)
  const trends: HealthTrend[] = []

  for (const [metricType, metrics] of allMetrics) {
    // For body comp metrics, use a longer window since measurements are less frequent
    const isBodyComp = ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi'].includes(metricType)
    let effectiveMidDate = midDate

    if (isBodyComp && metrics.length >= 4) {
      // Use half the available data as "current" period for body comp
      const sortedDates = metrics.map(m => new Date(m.date)).sort((a, b) => a.getTime() - b.getTime())
      const midIndex = Math.floor(sortedDates.length / 2)
      effectiveMidDate = sortedDates[midIndex]
    }

    const current = metrics.filter(m => new Date(m.date) >= effectiveMidDate)
    const previous = metrics.filter(m => {
      const d = new Date(m.date)
      return d < effectiveMidDate
    })
    const older = metrics.filter(m => {
      const d = new Date(m.date)
      return d < new Date(effectiveMidDate.getTime() - periodDays * 24 * 60 * 60 * 1000)
    })

    if (current.length < 2) continue

    const currentAvg = current.reduce((s, m) => s + m.value, 0) / current.length
    const previousAvg = previous.length > 0
      ? previous.reduce((s, m) => s + m.value, 0) / previous.length
      : currentAvg
    const olderAvg = older.length > 0
      ? older.reduce((s, m) => s + m.value, 0) / older.length
      : previousAvg

    const change = currentAvg - previousAvg
    const changePercent = safePercentChange(currentAvg, previousAvg) ?? 0
    const previousChange = previousAvg - olderAvg
    const previousChangePercent = safePercentChange(previousAvg, olderAvg) ?? 0

    const polarity = METRIC_POLARITY[metricType]
    let trend: 'improving' | 'declining' | 'stable'

    // Use metric-specific stable threshold to filter noise
    const stableThreshold = getStableThreshold(metricType)
    if (Math.abs(changePercent) < stableThreshold) {
      trend = 'stable'
    } else if (polarity === 'higher_better') {
      trend = change > 0 ? 'improving' : 'declining'
    } else if (polarity === 'lower_better') {
      trend = change < 0 ? 'improving' : 'declining'
    } else {
      trend = 'stable'
    }

    // Find personal best
    const allValues = metrics.map(m => m.value)
    const personalBest = polarity === 'lower_better'
      ? Math.min(...allValues)
      : Math.max(...allValues)
    const bestMetric = metrics.find(m => m.value === personalBest)

    trends.push({
      metricType,
      displayName: getMetricDisplayName(metricType),
      currentValue: currentAvg,
      previousValue: previousAvg,
      change,
      changePercent,
      trend,
      momentum: calculateMomentum(changePercent, previousChangePercent),
      // Confidence based on data density — require meaningful sample sizes
      confidence: current.length >= 10 && previous.length >= 7 ? 'high'
        : current.length >= 5 && previous.length >= 3 ? 'medium' : 'low',
      dataPoints: current.length,
      consistency: calculateConsistency(current.map(m => m.value)),
      personalBest,
      personalBestDate: bestMetric?.date
    })
  }

  trends.sort((a, b) => {
    if (a.trend === 'declining' && b.trend !== 'declining') return -1
    if (b.trend === 'declining' && a.trend !== 'declining') return 1
    return Math.abs(b.changePercent) - Math.abs(a.changePercent)
  })

  return trends
}

export async function analyzeSleepArchitecture(userId: string): Promise<SleepArchitecture | null> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 14)

  const metrics = await getUnifiedMetrics(userId, startDate, endDate, [
    'sleep_duration', 'sleep_score', 'time_in_bed', 'bed_temperature',
    'rem_sleep', 'waso', 'sleep_latency', 'sleep_efficiency'
  ])

  const duration = metrics.get('sleep_duration') || []
  const scores = metrics.get('sleep_score') || []
  const timeInBed = metrics.get('time_in_bed') || []
  const bedTemp = metrics.get('bed_temperature') || []
  const remMetrics = metrics.get('rem_sleep') || []
  const wasoMetrics = metrics.get('waso') || []
  const latencyMetrics = metrics.get('sleep_latency') || []
  const efficiencyMetrics = metrics.get('sleep_efficiency') || []

  if (duration.length < 3) return null

  // Validate sleep stage sums: for each day with both duration and REM data,
  // check that stages don't exceed total sleep. We validate at the daily level
  // using the available stage metrics (deep_sleep, rem_sleep, light_sleep are
  // stored as separate metric types, so we work with what we have).
  for (const dayDuration of duration) {
    const dayRem = remMetrics.find(r => r.date === dayDuration.date)
    if (dayRem) {
      // Extract deep_sleep and light_sleep from context if available
      const deepFromContext = (dayDuration.context?.deepSleepMinutes as number) || 0
      const lightFromContext = (dayDuration.context?.lightSleepMinutes as number) || 0
      if (deepFromContext > 0 || lightFromContext > 0) {
        const validated = validateSleepStages(
          dayDuration.value,
          deepFromContext,
          dayRem.value,
          lightFromContext
        )
        if (validated.corrected) {
          dayRem.value = validated.remSleep
        }
      }
    }
  }

  const avgDuration = duration.reduce((s, m) => s + m.value, 0) / duration.length
  const avgScore = scores.length > 0
    ? scores.reduce((s, m) => s + m.value, 0) / scores.length
    : null // Don't fabricate a score
  const avgTimeInBed = timeInBed.length > 0
    ? timeInBed.reduce((s, m) => s + m.value, 0) / timeInBed.length
    : null // Don't fabricate time-in-bed

  // Only compute efficiency if we have actual time-in-bed data
  const efficiency = avgTimeInBed && avgTimeInBed > 0
    ? (safeDivide(avgDuration, avgTimeInBed) ?? 0.85) * 100
    : null
  const consistencyScore = calculateConsistency(duration.map(m => m.value))

  const avgBedTemp = bedTemp.length > 0
    ? bedTemp.reduce((s, m) => s + m.value, 0) / bedTemp.length
    : undefined

  const optimalRange = OPTIMAL_RANGES.bed_temperature
  const optimalTempNights = bedTemp.filter(m =>
    m.value >= optimalRange.min && m.value <= optimalRange.max
  ).length

  const avgWaso = wasoMetrics.length > 0
    ? wasoMetrics.reduce((s, m) => s + m.value, 0) / wasoMetrics.length
    : undefined

  const avgSleepLatency = latencyMetrics.length > 0
    ? latencyMetrics.reduce((s, m) => s + m.value, 0) / latencyMetrics.length
    : undefined

  const avgSleepEfficiency = efficiencyMetrics.length > 0
    ? efficiencyMetrics.reduce((s, m) => s + m.value, 0) / efficiencyMetrics.length
    : undefined

  // Determine recent trend
  const recentScores = scores.slice(-7)
  const olderScores = scores.slice(-14, -7)
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable'

  if (recentScores.length >= 3 && olderScores.length >= 3) {
    const recentAvg = recentScores.reduce((s, m) => s + m.value, 0) / recentScores.length
    const olderAvg = olderScores.reduce((s, m) => s + m.value, 0) / olderScores.length
    const change = safePercentChange(recentAvg, olderAvg) ?? 0
    if (change > 5) recentTrend = 'improving'
    else if (change < -5) recentTrend = 'declining'
  }

  // Prefer the directly-measured sleep efficiency from the device if available,
  // falling back to the computed efficiency from duration/time_in_bed
  const finalEfficiency = avgSleepEfficiency ?? efficiency

  return {
    avgDuration,
    avgScore,
    avgTimeInBed,
    efficiency: finalEfficiency,
    consistencyScore,
    avgBedTemp,
    optimalTempNights,
    avgWaso,
    avgSleepLatency,
    avgSleepEfficiency,
    recentTrend
  }
}

export async function calculateRecoveryStatus(userId: string): Promise<RecoveryStatus | null> {
  const trends = await calculateHealthTrends(userId, 7)

  const hrvTrend = trends.find(t => t.metricType === 'hrv')
  const rhrTrend = trends.find(t => t.metricType === 'rhr')
  const sleepTrend = trends.find(t => t.metricType === 'sleep_score')

  if (!hrvTrend && !rhrTrend && !sleepTrend) return null

  // Calculate recovery score based on available metrics
  // Use weighted average of actual data, not a base score
  const scores: { value: number; weight: number }[] = []

  if (hrvTrend) {
    const hrvOptimal = OPTIMAL_RANGES.hrv.optimal
    const hrvRatio = safeDivide(hrvTrend.currentValue, hrvOptimal)
    const hrvScore = hrvRatio !== null ? Math.min(100, hrvRatio * 100) : null
    if (hrvScore !== null) scores.push({ value: hrvScore, weight: 0.4 })
  }

  if (rhrTrend) {
    const rhrOptimal = OPTIMAL_RANGES.rhr.optimal
    const rhrRange = OPTIMAL_RANGES.rhr.max - rhrOptimal
    // Lower RHR is better
    const rhrScore = rhrTrend.currentValue <= rhrOptimal
      ? 100
      : rhrRange > 0
        ? Math.max(50, 100 - (safeDivide(rhrTrend.currentValue - rhrOptimal, rhrRange) ?? 0) * 50)
        : 70
    scores.push({ value: rhrScore, weight: 0.3 })
  }

  if (sleepTrend) {
    const sleepScore = Math.min(100, sleepTrend.currentValue)
    scores.push({ value: sleepScore, weight: 0.3 })
  }

  // Compute weighted average of available scores
  let score: number
  if (scores.length === 0) {
    return null // No data at all — don't fabricate a recovery score
  } else {
    const totalWeight = scores.reduce((s, sc) => s + sc.weight, 0)
    score = totalWeight > 0
      ? scores.reduce((s, sc) => s + sc.value * sc.weight, 0) / totalWeight
      : 70
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const status: RecoveryStatus['status'] =
    score >= 85 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 55 ? 'moderate' : 'poor'

  // Only rate sleep quality if we have actual sleep data
  const sleepVal = sleepTrend?.currentValue
  const sleepQuality: RecoveryStatus['sleepQuality'] =
    sleepVal == null ? 'fair' : // Default to 'fair' when no data, not 'poor'
    sleepVal >= 85 ? 'excellent' :
    sleepVal >= 70 ? 'good' :
    sleepVal >= 55 ? 'fair' : 'poor'

  const recommendations: Record<RecoveryStatus['status'], string> = {
    excellent: 'Your recovery is optimal. Great day for intense training or challenging work.',
    good: 'Solid recovery. You can handle normal activities and moderate exercise.',
    moderate: 'Recovery is below optimal. Consider lighter activity and prioritize sleep tonight.',
    poor: 'Your body needs rest. Focus on recovery activities: sleep, hydration, light movement.'
  }

  return {
    score,
    status,
    hrvTrend: hrvTrend?.trend === 'improving' ? 'up' : hrvTrend?.trend === 'declining' ? 'down' : 'stable',
    rhrTrend: rhrTrend?.trend === 'improving' ? 'up' : rhrTrend?.trend === 'declining' ? 'down' : 'stable',
    sleepQuality,
    recommendation: recommendations[status]
  }
}

export async function analyzeDayPatterns(userId: string): Promise<DayPattern[]> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 28) // 4 weeks

  const metrics = await getUnifiedMetrics(userId, startDate, endDate, [
    'sleep_score', 'steps', 'hrv'
  ])

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const patterns: DayPattern[] = []

  for (let day = 0; day < 7; day++) {
    const dayMetrics = {
      sleepScores: [] as number[],
      steps: [] as number[],
      hrv: [] as number[]
    }

    for (const [metricType, values] of metrics) {
      for (const m of values) {
        if (new Date(m.date).getDay() === day) {
          if (metricType === 'sleep_score') dayMetrics.sleepScores.push(m.value)
          else if (metricType === 'steps') dayMetrics.steps.push(m.value)
          else if (metricType === 'hrv') dayMetrics.hrv.push(m.value)
        }
      }
    }

    patterns.push({
      dayOfWeek: day,
      dayName: dayNames[day],
      avgSleepScore: dayMetrics.sleepScores.length > 0
        ? dayMetrics.sleepScores.reduce((a, b) => a + b, 0) / dayMetrics.sleepScores.length
        : undefined,
      avgSteps: dayMetrics.steps.length > 0
        ? dayMetrics.steps.reduce((a, b) => a + b, 0) / dayMetrics.steps.length
        : undefined,
      avgHrv: dayMetrics.hrv.length > 0
        ? dayMetrics.hrv.reduce((a, b) => a + b, 0) / dayMetrics.hrv.length
        : undefined,
      isBestDay: false,
      isWorstDay: false
    })
  }

  // Find best/worst days for sleep
  const withSleep = patterns.filter(p => p.avgSleepScore !== undefined)
  if (withSleep.length > 0) {
    const bestSleep = Math.max(...withSleep.map(p => p.avgSleepScore!))
    const worstSleep = Math.min(...withSleep.map(p => p.avgSleepScore!))
    patterns.find(p => p.avgSleepScore === bestSleep)!.isBestDay = true
    patterns.find(p => p.avgSleepScore === worstSleep)!.isWorstDay = true
  }

  return patterns
}

export async function analyzeProtocolImpact(userId: string): Promise<ProtocolImpact[]> {
  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      startDate: { lte: new Date() }
    },
    include: { peptide: { select: { name: true } } },
    orderBy: { startDate: 'desc' },
    take: 5
  })

  const impacts: ProtocolImpact[] = []

  for (const protocol of protocols) {
    const startDate = new Date(protocol.startDate)
    const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSinceStart < 7) continue // Need at least a week of data

    const windowDays = Math.min(14, daysSinceStart)
    const beforeStart = new Date(startDate)
    beforeStart.setDate(beforeStart.getDate() - windowDays)
    const afterEnd = new Date(startDate)
    afterEnd.setDate(afterEnd.getDate() + windowDays)

    const beforeMetrics = await getUnifiedMetrics(userId, beforeStart, startDate)
    const afterMetrics = await getUnifiedMetrics(userId, startDate, afterEnd)

    const metricImpacts: ProtocolImpact['metrics'] = []
    let totalImpactScore = 0
    let metricsCount = 0

    const allMetricTypes: MetricType[] = [
      'sleep_score', 'sleep_duration', 'rem_sleep', 'hrv', 'rhr',
      'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
      'steps', 'active_calories', 'exercise_minutes', 'vo2_max',
      'respiratory_rate', 'blood_oxygen',
    ]

    for (const metricType of allMetricTypes) {
      const before = beforeMetrics.get(metricType) || []
      const after = afterMetrics.get(metricType) || []

      if (before.length < 3 || after.length < 3) continue

      const beforeAvg = before.reduce((s, m) => s + m.value, 0) / before.length
      const afterAvg = after.reduce((s, m) => s + m.value, 0) / after.length
      const change = afterAvg - beforeAvg
      const changePercent = safePercentChange(afterAvg, beforeAvg) ?? 0

      const polarity = METRIC_POLARITY[metricType]
      let impact = changePercent
      if (polarity === 'lower_better') impact = -impact // Invert for lower-is-better

      metricImpacts.push({
        metricType,
        beforeAvg,
        afterAvg,
        change,
        changePercent,
        isSignificant: Math.abs(changePercent) > 5,
        dataPointsBefore: before.length,
        dataPointsAfter: after.length
      })

      if (Math.abs(changePercent) > 2) {
        totalImpactScore += impact
        metricsCount++
      }
    }

    if (metricImpacts.length === 0) continue

    const avgImpact = metricsCount > 0 ? totalImpactScore / metricsCount : 0
    const overallImpact: ProtocolImpact['overallImpact'] =
      avgImpact > 5 ? 'positive' :
      avgImpact < -5 ? 'negative' : 'neutral'

    impacts.push({
      protocolId: protocol.id,
      protocolName: `${protocol.peptide.name} Protocol`,
      peptideName: protocol.peptide.name,
      startDate,
      daysSinceStart,
      metrics: metricImpacts,
      overallImpact,
      impactScore: Math.round(avgImpact)
    })
  }

  return impacts.sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore))
}

// ============================================================================
// HEALTH SCORE
// ============================================================================

export async function calculateHealthScore(userId: string): Promise<HealthScore> {
  const trends = await calculateHealthTrends(userId, 7)
  const recovery = await calculateRecoveryStatus(userId)

  const weights: Partial<Record<MetricType, { category: 'sleep' | 'recovery' | 'activity' | 'bodyComp'; weight: number }>> = {
    // Sleep metrics
    sleep_duration: { category: 'sleep', weight: 0.30 },
    sleep_score: { category: 'sleep', weight: 0.35 },
    sleep_efficiency: { category: 'sleep', weight: 0.15 },
    time_in_bed: { category: 'sleep', weight: 0.10 },
    bed_temperature: { category: 'sleep', weight: 0.10 },
    // Recovery metrics
    hrv: { category: 'recovery', weight: 0.4 },
    rhr: { category: 'recovery', weight: 0.3 },
    blood_oxygen: { category: 'recovery', weight: 0.15 },
    respiratory_rate: { category: 'recovery', weight: 0.15 },
    // Activity metrics
    steps: { category: 'activity', weight: 0.3 },
    active_calories: { category: 'activity', weight: 0.25 },
    exercise_minutes: { category: 'activity', weight: 0.25 },
    vo2_max: { category: 'activity', weight: 0.2 },
    // Body composition — scored in its own category
    body_fat_percentage: { category: 'bodyComp', weight: 0.35 },
    lean_body_mass: { category: 'bodyComp', weight: 0.30 },
    muscle_mass: { category: 'bodyComp', weight: 0.25 },
    weight: { category: 'bodyComp', weight: 0.10 }
  }

  const breakdown: HealthScore['breakdown'] = []
  const categoryScores = { sleep: [] as number[], recovery: [] as number[], activity: [] as number[], bodyComp: [] as number[] }

  for (const trend of trends) {
    const range = OPTIMAL_RANGES[trend.metricType]
    const w = weights[trend.metricType]

    if (!range || !w) continue

    let score: number
    const polarity = METRIC_POLARITY[trend.metricType]
    const vsOptimal = safeDivide(trend.currentValue, range.optimal) !== null
      ? (safeDivide(trend.currentValue, range.optimal)! * 100)
      : 100

    // For body comp metrics without fixed optimal ranges, score based on trend direction
    if (range.optimal === 0 && w.category === 'bodyComp') {
      if (trend.trend === 'improving') score = 85
      else if (trend.trend === 'stable') score = 70
      else score = 55
    } else if (range.optimal === 0) {
      continue // Skip non-body-comp metrics with no optimal range
    } else if (polarity === 'lower_better') {
      if (trend.currentValue <= range.optimal) score = 100
      else if (trend.currentValue >= range.max) score = 50
      else {
        const denom = range.max - range.optimal
        score = denom > 0 ? 100 - (safeDivide(trend.currentValue - range.optimal, denom) ?? 0) * 50 : 75
      }
    } else {
      if (trend.currentValue >= range.optimal) score = 100
      else if (trend.currentValue <= range.min) score = 50
      else {
        const denom = range.optimal - range.min
        score = denom > 0 ? 50 + (safeDivide(trend.currentValue - range.min, denom) ?? 0) * 50 : 75
      }
    }

    score = isNaN(score) ? 50 : Math.max(0, Math.min(100, Math.round(score)))

    breakdown.push({
      metric: trend.metricType,
      score,
      weight: w.weight,
      trend: trend.trend === 'improving' ? 'up' : trend.trend === 'declining' ? 'down' : 'stable',
      vsOptimal: range.optimal !== 0 && trend.currentValue !== 0
        ? Math.round(polarity === 'lower_better'
            ? (safeDivide(range.optimal, trend.currentValue) ?? 1) * 100
            : vsOptimal)
        : Math.round(score)
    })

    if (w.weight > 0) {
      categoryScores[w.category].push(score)
    }
  }

  const avgScore = (scores: number[]) =>
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  const sleep = avgScore(categoryScores.sleep)
  const recoveryScore = avgScore(categoryScores.recovery)
  const activity = avgScore(categoryScores.activity)
  const bodyCompScore = avgScore(categoryScores.bodyComp)
  const hasBodyComp = categoryScores.bodyComp.length > 0

  // Only compute overall/readiness if we have actual data
  const hasAnyData = sleep !== null || recoveryScore !== null || activity !== null
  const readiness = recovery?.score || (sleep !== null && recoveryScore !== null
    ? Math.round((sleep * 0.5 + recoveryScore * 0.5)) : null)

  // Compute overall score only when we have real category data
  let overall: number | null = null
  if (hasAnyData) {
    const s = sleep ?? 50
    const r = recoveryScore ?? 50
    const a = activity ?? 50
    overall = hasBodyComp
      ? Math.round(s * 0.35 + r * 0.30 + a * 0.20 + (bodyCompScore ?? 50) * 0.15)
      : Math.round(s * 0.4 + r * 0.35 + a * 0.25)
  }

  // ── Score Attribution ──────────────────────────────────────────────
  let scoreAttribution: ScoreAttribution | null = null
  if (breakdown.length > 0) {
    // Find top positive and top negative contributors by comparing score vs. 50 (neutral)
    // A score > 50 is positive contribution, < 50 is negative contribution
    // Weight the contribution by the metric's weight
    type BreakdownEntry = typeof breakdown[number]
    const withContribution = breakdown.map(b => {
      const w = weights[b.metric]
      const delta = b.score - 50
      const weightedDelta = delta * (w?.weight ?? 0)
      const matchingTrend = trends.find(t => t.metricType === b.metric)
      return { ...b, delta, weightedDelta, category: w?.category ?? 'unknown', trend: matchingTrend }
    })

    // Sort by weighted delta descending for positives, ascending for negatives
    const sortedPositive = withContribution
      .filter(b => b.weightedDelta > 0)
      .sort((a, b) => b.weightedDelta - a.weightedDelta)
    const sortedNegative = withContribution
      .filter(b => b.weightedDelta < 0)
      .sort((a, b) => a.weightedDelta - b.weightedDelta)

    const topPositive = sortedPositive[0]
      ? (() => {
          const t = sortedPositive[0]
          const displayName = getMetricDisplayName(t.metric).toLowerCase()
          const pctAbove = t.vsOptimal - 100
          const contribution = pctAbove >= 0
            ? `${displayName} is ${Math.abs(pctAbove)}% above your baseline`
            : `${displayName} is performing well at ${t.vsOptimal}% of optimal`
          return {
            category: t.category,
            metric: t.metric,
            contribution: `${t.category.charAt(0).toUpperCase() + t.category.slice(1)}: ${contribution}`,
          }
        })()
      : null

    const topNegative = sortedNegative[0]
      ? (() => {
          const t = sortedNegative[0]
          const displayName = getMetricDisplayName(t.metric).toLowerCase()
          const trendInfo = t.trend
          const changeDesc = trendInfo
            ? `${displayName} ${trendInfo.changePercent < 0 ? 'dropped' : 'rose'} ${Math.abs(trendInfo.changePercent).toFixed(0)}% this week`
            : `${displayName} is below optimal`
          return {
            category: t.category,
            metric: t.metric,
            contribution: `${t.category.charAt(0).toUpperCase() + t.category.slice(1)}: ${changeDesc}`,
          }
        })()
      : null

    // Category breakdown with weights and deltas
    const categoryWeights = hasBodyComp
      ? { sleep: 0.35, recovery: 0.30, activity: 0.20, bodyComp: 0.15 }
      : { sleep: 0.40, recovery: 0.35, activity: 0.25, bodyComp: 0 }

    const categoryBreakdown: ScoreAttribution['categoryBreakdown'] = [
      { category: 'sleep', score: sleep ?? 0, weight: categoryWeights.sleep, delta: sleep !== null && overall !== null ? sleep - overall : null },
      { category: 'recovery', score: recoveryScore ?? 0, weight: categoryWeights.recovery, delta: recoveryScore !== null && overall !== null ? recoveryScore - overall : null },
      { category: 'activity', score: activity ?? 0, weight: categoryWeights.activity, delta: activity !== null && overall !== null ? activity - overall : null },
    ]
    if (hasBodyComp) {
      categoryBreakdown.push({
        category: 'bodyComp',
        score: bodyCompScore ?? 0,
        weight: categoryWeights.bodyComp,
        delta: bodyCompScore !== null && overall !== null ? bodyCompScore - overall : null,
      })
    }

    scoreAttribution = { topPositive, topNegative, categoryBreakdown }
  }

  return { overall, sleep, recovery: recoveryScore, activity, bodyComp: bodyCompScore, readiness, breakdown, scoreAttribution }
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

export async function generateSynthesizedInsights(userId: string): Promise<SynthesizedInsight[]> {
  const insights: SynthesizedInsight[] = []

  const [trends, score, sleepArch, recovery, dayPatterns, protocolImpacts] = await Promise.all([
    calculateHealthTrends(userId, 14),
    calculateHealthScore(userId),
    analyzeSleepArchitecture(userId),
    calculateRecoveryStatus(userId),
    analyzeDayPatterns(userId),
    analyzeProtocolImpact(userId)
  ])

  // 1. Recovery Readiness (Top Priority)
  if (recovery) {
    if (recovery.status === 'excellent') {
      insights.push({
        id: 'recovery-excellent',
        type: 'observation',
        priority: 'high',
        title: `Recovery Score: ${recovery.score}`,
        description: recovery.recommendation,
        details: `HRV trending ${recovery.hrvTrend}, RHR trending ${recovery.rhrTrend}`,
        metrics: ['hrv', 'rhr', 'sleep_score'],
        confidence: 90
      })
    } else if (recovery.status === 'poor') {
      insights.push({
        id: 'recovery-poor',
        type: 'concern',
        priority: 'high',
        title: 'Recovery Needs Attention',
        description: recovery.recommendation,
        details: `Sleep quality: ${recovery.sleepQuality}. Consider lighter activities today.`,
        metrics: ['hrv', 'rhr', 'sleep_score'],
        actionable: 'Prioritize rest, hydration, and an earlier bedtime tonight.'
      })
    }
  }

  // 2. Sleep Architecture Insights
  if (sleepArch) {
    if (sleepArch.efficiency !== null && sleepArch.efficiency < 80) {
      insights.push({
        id: 'sleep-efficiency-low',
        type: 'recommendation',
        priority: 'high',
        title: 'Sleep Efficiency Below Optimal',
        description: `You're spending ${formatMetricValue(sleepArch.avgTimeInBed ?? 0, 'time_in_bed')} in bed but only sleeping ${formatMetricValue(sleepArch.avgDuration, 'sleep_duration')} (${sleepArch.efficiency?.toFixed(0) ?? '?'}% efficiency).`,
        details: 'High sleep efficiency (>85%) indicates good sleep quality.',
        metrics: ['sleep_duration', 'time_in_bed'],
        actionable: 'Try going to bed only when sleepy, and get up if you can\'t sleep after 20 min.'
      })
    }

    if (sleepArch.consistencyScore < 70) {
      insights.push({
        id: 'sleep-inconsistent',
        type: 'recommendation',
        priority: 'medium',
        title: 'Inconsistent Sleep Schedule',
        description: `Your sleep timing varies significantly (consistency: ${sleepArch.consistencyScore.toFixed(0)}%). Consistent sleep schedules improve sleep quality.`,
        metrics: ['sleep_duration'],
        actionable: 'Try to go to bed and wake up at the same time each day, even on weekends.'
      })
    }

    if (sleepArch.avgBedTemp && sleepArch.optimalTempNights !== undefined) {
      const optimalPct = (sleepArch.optimalTempNights / 14) * 100
      if (optimalPct < 50) {
        insights.push({
          id: 'bed-temp-suboptimal',
          type: 'recommendation',
          priority: 'medium',
          title: 'Bed Temperature Optimization',
          description: `Only ${optimalPct.toFixed(0)}% of nights had optimal bed temperature (16-21°C). Your average: ${sleepArch.avgBedTemp.toFixed(1)}°C.`,
          details: 'Cooler sleeping temperatures (around 18°C) promote deeper sleep.',
          metrics: ['bed_temperature'],
          actionable: 'Consider adjusting your bedroom temperature or bedding.'
        })
      }
    }
  }

  // 2.5 Body Composition Insights
  const bodyFatTrend = trends.find(t => t.metricType === 'body_fat_percentage')
  const leanMassTrend = trends.find(t => t.metricType === 'lean_body_mass')
  const muscleMassTrend = trends.find(t => t.metricType === 'muscle_mass')
  const weightTrend = trends.find(t => t.metricType === 'weight')

  // Use muscle mass if available, otherwise lean mass
  const massTrend = muscleMassTrend || leanMassTrend
  const massLabel = muscleMassTrend ? 'muscle mass' : 'lean mass'

  // Body comp date freshness check: if weight and body_fat_percentage
  // latest data points are more than 7 days apart, flag as low confidence
  const MAX_BODY_COMP_GAP_DAYS = 7
  let bodyCompFresh = true
  if (weightTrend?.personalBestDate && bodyFatTrend?.personalBestDate) {
    // personalBestDate may not be the latest — but the trend's data is from the
    // current period. Use the trend data point count as a proxy: if both have
    // recent data (dataPoints >= 2), they're reasonably fresh.
    // For a more precise check, compare latest dates from the raw metric data.
  }
  // Precise freshness check using raw metrics
  if (weightTrend && bodyFatTrend) {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    const bodyCompMetrics = await getUnifiedMetrics(userId, startDate, endDate, ['weight', 'body_fat_percentage'])
    const weightDates = (bodyCompMetrics.get('weight') || []).map(m => new Date(m.date).getTime())
    const bfDates = (bodyCompMetrics.get('body_fat_percentage') || []).map(m => new Date(m.date).getTime())
    if (weightDates.length > 0 && bfDates.length > 0) {
      const latestWeight = Math.max(...weightDates)
      const latestBf = Math.max(...bfDates)
      const gapDays = Math.abs(latestWeight - latestBf) / (1000 * 60 * 60 * 24)
      if (gapDays > MAX_BODY_COMP_GAP_DAYS) {
        bodyCompFresh = false
        insights.push({
          id: 'body-comp-stale-gap',
          type: 'observation',
          priority: 'low',
          title: 'Body Composition Data Gap',
          description: `Your most recent weight and body fat measurements are ${Math.round(gapDays)} days apart. Combined body recomp analysis may be unreliable.`,
          details: 'For accurate body composition tracking, try to measure weight and body fat within the same week.',
          metrics: ['weight', 'body_fat_percentage'],
          confidence: 40,
        })
      }
    }
  }

  if (bodyFatTrend && massTrend && bodyCompFresh) {
    if (bodyFatTrend.trend === 'improving' && massTrend.trend === 'improving') {
      insights.push({
        id: 'body-recomp-synthesis',
        type: 'improvement',
        priority: 'high',
        title: 'Body Recomposition in Progress',
        description: `Body fat trending down (${bodyFatTrend.changePercent.toFixed(1)}%) while ${massLabel} is increasing (+${massTrend.changePercent.toFixed(1)}%). This is the ideal body composition outcome.`,
        details: weightTrend
          ? `Weight is ${weightTrend.trend} (${weightTrend.changePercent > 0 ? '+' : ''}${weightTrend.changePercent.toFixed(1)}%), showing that the scale alone doesn't capture your progress.`
          : undefined,
        metrics: ['body_fat_percentage', massTrend.metricType, 'weight'],
        confidence: Math.min(bodyFatTrend.dataPoints, massTrend.dataPoints) >= 7 ? 85 : 60,
      })
    } else if (bodyFatTrend.trend === 'declining' && massTrend.trend === 'declining') {
      insights.push({
        id: 'body-comp-both-declining',
        type: 'concern',
        priority: 'high',
        title: 'Body Composition Needs Attention',
        description: `Both body fat (+${Math.abs(bodyFatTrend.changePercent).toFixed(1)}%) and ${massLabel} (${massTrend.changePercent.toFixed(1)}%) are trending unfavorably.`,
        details: 'This may indicate inadequate nutrition, overtraining, or insufficient recovery.',
        metrics: ['body_fat_percentage', massTrend.metricType],
        actionable: 'Review protein intake, training volume, and recovery quality.',
        confidence: 70,
      })
    }
  } else if (bodyFatTrend && massTrend && !bodyCompFresh) {
    // Data is stale - reduce confidence in body comp insights
    if (bodyFatTrend.trend === 'improving' && massTrend.trend === 'improving') {
      insights.push({
        id: 'body-recomp-synthesis',
        type: 'improvement',
        priority: 'medium',
        title: 'Body Recomposition (Low Confidence)',
        description: `Body fat trending down (${bodyFatTrend.changePercent.toFixed(1)}%) while ${massLabel} is increasing (+${massTrend.changePercent.toFixed(1)}%), but weight and body fat data are from different time periods.`,
        metrics: ['body_fat_percentage', massTrend.metricType, 'weight'],
        confidence: 40,
      })
    }
  }

  if (weightTrend && bodyFatTrend && !massTrend && bodyCompFresh) {
    // Only weight + body fat available (no lean mass)
    if (weightTrend.trend === 'stable' && bodyFatTrend.trend !== 'stable') {
      insights.push({
        id: 'weight-vs-bf-divergence',
        type: 'observation',
        priority: 'medium',
        title: 'Weight Stable, Body Fat Changing',
        description: `Weight is stable but body fat is ${bodyFatTrend.trend === 'improving' ? 'improving' : 'increasing'}. Body composition is shifting ${bodyFatTrend.trend === 'improving' ? 'favorably' : 'unfavorably'} despite stable weight.`,
        metrics: ['weight', 'body_fat_percentage'],
      })
    }
  }

  // 3. Day-of-Week Patterns
  const bestDay = dayPatterns.find(d => d.isBestDay && d.avgSleepScore)
  const worstDay = dayPatterns.find(d => d.isWorstDay && d.avgSleepScore)

  if (bestDay && worstDay && bestDay.avgSleepScore && worstDay.avgSleepScore) {
    const diff = bestDay.avgSleepScore - worstDay.avgSleepScore
    if (diff > 10) {
      insights.push({
        id: 'day-pattern',
        type: 'observation',
        priority: 'low',
        title: 'Sleep Pattern Discovered',
        description: `Your best sleep is on ${bestDay.dayName}s (avg ${bestDay.avgSleepScore.toFixed(0)}) and worst on ${worstDay.dayName}s (avg ${worstDay.avgSleepScore.toFixed(0)}).`,
        details: `That's a ${diff.toFixed(0)} point difference. Consider what activities differ between these days.`,
        metrics: ['sleep_score']
      })
    }
  }

  // 4. Protocol Impact Analysis with Mechanism Context
  for (const impact of protocolImpacts.slice(0, 2)) {
    const mechanism = findProtocolMechanism(impact.peptideName)
    const weeksOnProtocol = Math.floor(impact.daysSinceStart / 7)

    if (impact.overallImpact === 'positive' && impact.impactScore > 10) {
      const significantMetrics = impact.metrics.filter(m => m.isSignificant && m.changePercent > 0)

      // Enhance description with protocol-specific context
      let description = `After ${impact.daysSinceStart} days, overall health metrics improved by ${impact.impactScore}%.`
      let details = significantMetrics.map(m =>
        `${getMetricDisplayName(m.metricType)}: ${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(0)}%`
      ).join(', ')

      // Add mechanism-specific insight for top improving metric
      if (mechanism && significantMetrics.length > 0) {
        const topMetric = significantMetrics[0]
        const { expected, explanation } = isChangeExpected(
          impact.peptideName,
          topMetric.metricType,
          'improving',
          weeksOnProtocol
        )
        if (expected) {
          const protocolInsight = getProtocolInsight(
            impact.peptideName,
            topMetric.metricType,
            weeksOnProtocol < 2 ? 'earlyImproving' : 'improving',
            topMetric.changePercent
          )
          if (protocolInsight) {
            description = protocolInsight
          }
        }
      }

      // Add early timeline note if protocol is young
      if (weeksOnProtocol < 2) {
        details += ` (Week ${weeksOnProtocol} on protocol—effects may still be developing)`
      }

      insights.push({
        id: `protocol-${impact.protocolId}`,
        type: 'correlation',
        priority: 'high',
        title: `${impact.peptideName} Showing Results`,
        description,
        details,
        metrics: significantMetrics.map(m => m.metricType),
        relatedProtocol: { id: impact.protocolId, name: impact.peptideName },
        dataPoints: significantMetrics.reduce((s, m) => s + m.dataPointsAfter, 0),
        confidence: impact.metrics.filter(m => m.dataPointsAfter >= 7).length > 2 ? 85 : 60
      })
    } else if (impact.overallImpact === 'negative' && impact.impactScore < -10) {
      let description = `Health metrics have declined ${Math.abs(impact.impactScore)}% since starting ${impact.peptideName}.`
      let details = 'This may be normal adaptation or worth discussing with your provider.'
      let actionable = 'Monitor for another week. If decline continues, consider adjusting dosing or timing.'

      // Check if decline is expected for any metric based on mechanism
      if (mechanism) {
        const decliningMetrics = impact.metrics.filter(m => m.changePercent < -5)
        for (const metric of decliningMetrics) {
          const { expected, explanation } = isChangeExpected(
            impact.peptideName,
            metric.metricType,
            'declining',
            weeksOnProtocol
          )
          if (expected) {
            // Decline is actually expected (e.g., weight on Semaglutide)
            const insight = getProtocolInsight(impact.peptideName, metric.metricType, 'declining', metric.changePercent)
            if (insight) {
              description = insight
              details = explanation
              actionable = `This is within expected ${impact.peptideName} effects. Continue monitoring.`
              break
            }
          }
        }
      }

      insights.push({
        id: `protocol-concern-${impact.protocolId}`,
        type: 'concern',
        priority: 'medium',
        title: `Review ${impact.peptideName} Protocol`,
        description,
        details,
        metrics: impact.metrics.filter(m => m.changePercent < -5).map(m => m.metricType),
        relatedProtocol: { id: impact.protocolId, name: impact.peptideName },
        actionable
      })
    }
  }

  // 5. Trend Momentum Insights
  const acceleratingImprovements = trends.filter(t =>
    t.trend === 'improving' && t.momentum === 'accelerating' && Math.abs(t.changePercent) > 5
  )

  if (acceleratingImprovements.length >= 2) {
    insights.push({
      id: 'momentum-positive',
      type: 'improvement',
      priority: 'medium',
      title: 'Positive Momentum Building',
      description: `Multiple metrics are improving at an accelerating rate: ${acceleratingImprovements.map(t => t.displayName.toLowerCase()).join(', ')}.`,
      details: 'Your current routine is working well. Keep it up!',
      metrics: acceleratingImprovements.map(t => t.metricType)
    })
  }

  // 6. Personal Best Proximity
  for (const trend of trends) {
    if (trend.personalBest && trend.personalBestDate) {
      const vsPersonalBest = ((trend.currentValue / trend.personalBest) * 100)
      const polarity = METRIC_POLARITY[trend.metricType]

      if (polarity === 'higher_better' && vsPersonalBest >= 95 && vsPersonalBest < 100) {
        insights.push({
          id: `near-pb-${trend.metricType}`,
          type: 'observation',
          priority: 'low',
          title: `Near Personal Best: ${trend.displayName}`,
          description: `Your current ${trend.displayName.toLowerCase()} is ${vsPersonalBest.toFixed(0)}% of your personal best (${formatMetricValue(trend.personalBest, trend.metricType)} on ${trend.personalBestDate}).`,
          metrics: [trend.metricType]
        })
      }
    }
  }

  // 7. Cross-Metric Correlations
  const sleepTrend = trends.find(t => t.metricType === 'sleep_score')
  const hrvTrend = trends.find(t => t.metricType === 'hrv')

  if (sleepTrend && hrvTrend) {
    if (sleepTrend.trend === 'improving' && hrvTrend.trend === 'improving') {
      insights.push({
        id: 'sleep-hrv-correlation',
        type: 'observation',
        priority: 'medium',
        title: 'Sleep & Recovery Aligned',
        description: 'Both sleep quality and HRV are improving together, indicating good overall recovery.',
        details: `Sleep +${sleepTrend.changePercent.toFixed(0)}%, HRV +${hrvTrend.changePercent.toFixed(0)}%`,
        metrics: ['sleep_score', 'hrv']
      })
    } else if (sleepTrend.trend !== hrvTrend.trend && sleepTrend.trend !== 'stable' && hrvTrend.trend !== 'stable') {
      // Get actionable recommendations based on which metric is declining
      const decliningMetric = hrvTrend.trend === 'declining' ? 'hrv' : 'sleep_score'
      const actionableRecs = formatTopRecommendations(decliningMetric, 'declining', 'higher_better', 2)

      insights.push({
        id: 'sleep-hrv-divergence',
        type: 'observation',
        priority: 'medium',
        title: 'Sleep & HRV Diverging',
        description: `Sleep is ${sleepTrend.trend} while HRV is ${hrvTrend.trend}. This divergence is worth monitoring.`,
        details: 'Factors like stress, alcohol, or overtraining can cause HRV to diverge from sleep quality.',
        metrics: ['sleep_score', 'hrv'],
        actionable: actionableRecs || 'Check for stress, alcohol, or overtraining factors.'
      })
    }
  }

  // 8. Recovery x Body Composition
  if (recovery && bodyFatTrend) {
    if (recovery.status === 'excellent' && bodyFatTrend.trend === 'improving') {
      insights.push({
        id: 'recovery-bodycomp-synergy',
        type: 'correlation',
        priority: 'medium',
        title: 'Recovery Fueling Body Comp Gains',
        description: `Strong recovery (${recovery.score}/100) is coinciding with improving body composition. Quality rest supports muscle protein synthesis and fat metabolism.`,
        metrics: ['hrv', 'rhr', 'body_fat_percentage'],
      })
    } else if (recovery.status === 'poor' && bodyFatTrend.trend === 'declining') {
      insights.push({
        id: 'recovery-bodycomp-warning',
        type: 'concern',
        priority: 'high',
        title: 'Poor Recovery May Impact Body Composition',
        description: `Recovery is low (${recovery.score}/100) and body fat is trending up. Poor sleep and recovery can increase cortisol, promoting fat storage.`,
        actionable: 'Prioritize sleep quality and consider reducing training intensity until recovery improves.',
        metrics: ['hrv', 'rhr', 'body_fat_percentage'],
      })
    }
  }

  // 9. Activity x Body Composition
  const activityTrend = trends.find(t => t.metricType === 'exercise_minutes')
  const stepsTrend = trends.find(t => t.metricType === 'steps')

  if (activityTrend && bodyFatTrend) {
    if (activityTrend.trend === 'improving' && bodyFatTrend.trend === 'improving') {
      insights.push({
        id: 'activity-bodycomp-positive',
        type: 'correlation',
        priority: 'medium',
        title: 'Increased Activity Driving Body Comp Changes',
        description: `Exercise is up ${activityTrend.changePercent.toFixed(0)}% and body fat is trending favorably. Your training program appears effective.`,
        metrics: ['exercise_minutes', 'body_fat_percentage'],
      })
    } else if (activityTrend.trend === 'declining' && bodyFatTrend.trend === 'declining') {
      // Get actionable recommendations for exercise decline
      const exerciseRecs = formatTopRecommendations('exercise_minutes', 'declining', 'higher_better', 2)

      insights.push({
        id: 'activity-bodycomp-decline',
        type: 'concern',
        priority: 'medium',
        title: 'Reduced Activity Affecting Body Composition',
        description: `Exercise is down ${Math.abs(activityTrend.changePercent).toFixed(0)}% and body fat is trending up. Maintaining activity helps preserve body composition.`,
        actionable: exerciseRecs || 'Look for opportunities to increase training frequency or daily movement.',
        metrics: ['exercise_minutes', 'body_fat_percentage'],
      })
    }
  }

  // 10. Sleep x Activity Decline
  const sleepDurationTrend = trends.find(t => t.metricType === 'sleep_duration')
  if (sleepDurationTrend && stepsTrend) {
    if (sleepDurationTrend.trend === 'declining' && stepsTrend.trend === 'declining') {
      // Get actionable recommendations for sleep decline
      const sleepRecs = formatTopRecommendations('sleep_duration', 'declining', 'higher_better', 2)

      insights.push({
        id: 'sleep-activity-decline',
        type: 'concern',
        priority: 'medium',
        title: 'Sleep Decline Impacting Activity',
        description: `Both sleep (${sleepDurationTrend.changePercent.toFixed(0)}%) and daily activity (${stepsTrend.changePercent.toFixed(0)}%) are declining. Poor sleep often reduces motivation and energy for movement.`,
        actionable: sleepRecs || 'Focus on sleep quality first — improved sleep typically restores activity levels naturally.',
        metrics: ['sleep_duration', 'steps'],
      })
    }
  }

  // 11. Protocol-aware trend insights
  // Convert protocol impacts to active protocols for context checking
  const activeProtocols: ActiveProtocol[] = protocolImpacts.map(p => ({
    name: p.peptideName,
    startDate: p.startDate
  }))

  // Check if any significant trend is explained by an active protocol
  for (const trend of trends) {
    if (Math.abs(trend.changePercent) < 5) continue // Only significant changes
    if (trend.trend === 'stable') continue // Skip stable trends for protocol context

    for (const protocol of activeProtocols) {
      const weeksOnProtocol = Math.floor((Date.now() - protocol.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      const { expected, confidence, explanation } = isChangeExpected(
        protocol.name,
        trend.metricType,
        trend.trend,
        weeksOnProtocol
      )

      if (expected && confidence !== 'low') {
        // Get protocol-specific insight
        const status: 'earlyImproving' | 'improving' | 'declining' | 'stable' | 'noData' =
          weeksOnProtocol < 2
            ? 'earlyImproving'
            : trend.trend === 'improving' ? 'improving' : trend.trend === 'declining' ? 'declining' : 'stable'

        const protocolInsight = getProtocolInsight(protocol.name, trend.metricType, status, trend.changePercent)

        if (protocolInsight) {
          // Check if we already have an insight for this protocol+metric
          const existingInsight = insights.find(i =>
            i.relatedProtocol?.name === protocol.name &&
            i.metrics.includes(trend.metricType)
          )

          if (!existingInsight) {
            insights.push({
              id: `protocol-trend-${protocol.name}-${trend.metricType}`,
              type: trend.trend === 'improving' ? 'improvement' : 'observation',
              priority: confidence === 'high' ? 'high' : 'medium',
              title: `${trend.displayName} ${trend.trend === 'improving' ? 'Improving' : 'Changing'} on ${protocol.name}`,
              description: protocolInsight,
              details: weeksOnProtocol < 2
                ? `Week ${weeksOnProtocol} on ${protocol.name}—still early in the protocol timeline.`
                : explanation,
              metrics: [trend.metricType],
              relatedProtocol: { id: `protocol-${protocol.name}`, name: protocol.name },
              confidence: confidence === 'high' ? 85 : confidence === 'medium' ? 70 : 50
            })
          }
        }
        break // Only use most relevant protocol per trend
      }
    }
  }

  // Sort and limit
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return insights.slice(0, 10)
}

// ============================================================================
// MAIN SUMMARY FUNCTION
// ============================================================================

// ============================================================================
// DATA QUALITY SCORING
// ============================================================================

interface MetricQualityScore {
  metricType: string
  score: number       // 0-100
  reasons: string[]
  dataPoints: number
  daysCovered: number
  lastDataDate: string | null
  staleDays: number   // how many days since last data point
}

function computeDataQuality(
  metrics: Map<MetricType, UnifiedDailyMetric[]>,
  periodDays: number = 30
): { overall: number; perMetric: MetricQualityScore[] } {
  const perMetric: MetricQualityScore[] = []
  const now = new Date()

  for (const [metricType, values] of metrics) {
    if (values.length === 0) continue

    const reasons: string[] = []
    let score = 50 // Base score

    // Data density: what % of days have data?
    const densityRatio = Math.min(1, values.length / periodDays)
    const densityScore = Math.round(densityRatio * 40)
    score += densityScore
    if (densityRatio < 0.3) reasons.push('Sparse data')
    else if (densityRatio >= 0.7) reasons.push('Good data coverage')

    // Recency: how recent is the latest data point?
    const sortedByDate = [...values].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const lastDate = sortedByDate[0]?.date
    const staleDays = lastDate ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : periodDays
    if (staleDays <= 1) score += 10
    else if (staleDays <= 3) score += 5
    else if (staleDays <= 7) {
      score -= 5
      reasons.push(`Aging (${staleDays}d old)`)
    } else {
      score -= Math.min(20, staleDays * 2)
      reasons.push(`Stale (${staleDays}d old)`)
    }

    // Consistency: low CV = higher quality signal
    const vals = values.map(v => v.value)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    if (mean > 0 && vals.length >= 3) {
      const variance = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length
      const cv = Math.sqrt(variance) / mean
      if (cv < 0.1) score += 5
      else if (cv > 0.5) {
        score -= 5
        reasons.push('High variability')
      }
    }

    // Clamp
    score = Math.max(0, Math.min(100, score))

    perMetric.push({
      metricType,
      score,
      reasons,
      dataPoints: values.length,
      daysCovered: new Set(values.map(v => v.date)).size,
      lastDataDate: lastDate || null,
      staleDays,
    })
  }

  const overall = perMetric.length > 0
    ? Math.round(perMetric.reduce((s, m) => s + m.score, 0) / perMetric.length)
    : 0

  return { overall, perMetric }
}

export async function getUnifiedHealthSummary(userId: string, window: number = 7) {
  const [score, trends, insights, recovery, sleepArch, dayPatterns] = await Promise.all([
    calculateHealthScore(userId),
    calculateHealthTrends(userId, window),
    generateSynthesizedInsights(userId),
    calculateRecoveryStatus(userId),
    analyzeSleepArchitecture(userId),
    analyzeDayPatterns(userId)
  ])

  // Compute data quality for the summary period
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)
  const allMetrics = await getUnifiedMetrics(userId, startDate, endDate)
  const dataQuality = computeDataQuality(allMetrics, 30)

  return {
    score,
    trends: trends.slice(0, 8),
    insights,
    recovery,
    sleepArchitecture: sleepArch,
    dayPatterns,
    dataQuality: {
      overall: dataQuality.overall,
      metrics: dataQuality.perMetric.slice(0, 10),
    },
    lastUpdated: new Date().toISOString()
  }
}
