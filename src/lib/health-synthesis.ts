// Advanced Health Data Synthesis Engine
// Unifies multi-source data and generates intelligent, actionable insights

import { prisma } from './prisma'
import { MetricType, getMetricDisplayName, formatMetricValue } from './health-providers'

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOURCE_PRIORITY: Record<MetricType, string[]> = {
  // Sleep
  sleep_duration: ['apple_health', 'oura', 'eight_sleep'],
  rem_sleep: ['apple_health', 'oura'],
  sleep_score: ['oura', 'eight_sleep', 'apple_health'],
  bed_temperature: ['eight_sleep', 'oura', 'apple_health'],
  time_in_bed: ['eight_sleep', 'oura', 'apple_health'],
  // Heart & HRV
  hrv: ['apple_health', 'oura', 'eight_sleep'],
  rhr: ['apple_health', 'oura', 'eight_sleep'],
  // Body Composition (primarily from scales via Apple Health)
  weight: ['apple_health', 'eight_sleep', 'oura'],
  body_fat_percentage: ['apple_health'],
  lean_body_mass: ['apple_health'],
  bmi: ['apple_health'],
  bone_mass: ['apple_health'],
  muscle_mass: ['apple_health'],
  body_water: ['apple_health'],
  // Activity
  steps: ['apple_health', 'oura', 'eight_sleep'],
  active_calories: ['apple_health', 'oura'],
  basal_calories: ['apple_health'],
  exercise_minutes: ['apple_health', 'oura'],
  stand_hours: ['apple_health'],
  vo2_max: ['apple_health', 'oura'],
  walking_running_distance: ['apple_health', 'oura'],
  // Vitals
  respiratory_rate: ['apple_health', 'oura'],
  blood_oxygen: ['apple_health', 'oura'],
  body_temperature: ['apple_health', 'oura']
}

const METRIC_POLARITY: Record<MetricType, 'higher_better' | 'lower_better' | 'neutral'> = {
  // Sleep
  sleep_duration: 'higher_better',
  rem_sleep: 'higher_better',
  sleep_score: 'higher_better',
  bed_temperature: 'neutral',
  time_in_bed: 'higher_better',
  // Heart & HRV
  hrv: 'higher_better',
  rhr: 'lower_better',
  // Body Composition
  weight: 'neutral',
  body_fat_percentage: 'lower_better',
  lean_body_mass: 'higher_better',
  bmi: 'neutral', // Depends on context
  bone_mass: 'higher_better',
  muscle_mass: 'higher_better',
  body_water: 'neutral',
  // Activity
  steps: 'higher_better',
  active_calories: 'higher_better',
  basal_calories: 'neutral',
  exercise_minutes: 'higher_better',
  stand_hours: 'higher_better',
  vo2_max: 'higher_better',
  walking_running_distance: 'higher_better',
  // Vitals
  respiratory_rate: 'neutral', // Depends on context
  blood_oxygen: 'higher_better',
  body_temperature: 'neutral'
}

// Optimal ranges for health metrics
const OPTIMAL_RANGES: Record<MetricType, { min: number; optimal: number; max: number; unit: string }> = {
  // Sleep
  sleep_duration: { min: 360, optimal: 450, max: 540, unit: 'min' },
  rem_sleep: { min: 60, optimal: 90, max: 120, unit: 'min' },
  sleep_score: { min: 60, optimal: 85, max: 100, unit: 'score' },
  bed_temperature: { min: 16, optimal: 18.5, max: 21, unit: '°C' },
  time_in_bed: { min: 420, optimal: 480, max: 540, unit: 'min' },
  // Heart & HRV
  hrv: { min: 20, optimal: 50, max: 120, unit: 'ms' },
  rhr: { min: 40, optimal: 55, max: 75, unit: 'bpm' },
  // Body Composition (ranges are person-dependent, using general guides)
  weight: { min: 0, optimal: 0, max: 0, unit: 'kg' }, // Very individual
  body_fat_percentage: { min: 6, optimal: 15, max: 25, unit: '%' },
  lean_body_mass: { min: 0, optimal: 0, max: 0, unit: 'kg' }, // Individual
  bmi: { min: 18.5, optimal: 22, max: 25, unit: '' },
  bone_mass: { min: 0, optimal: 0, max: 0, unit: 'kg' }, // Individual
  muscle_mass: { min: 0, optimal: 0, max: 0, unit: 'kg' }, // Individual
  body_water: { min: 45, optimal: 55, max: 65, unit: '%' },
  // Activity
  steps: { min: 5000, optimal: 10000, max: 20000, unit: 'steps' },
  active_calories: { min: 200, optimal: 500, max: 1000, unit: 'kcal' },
  basal_calories: { min: 1200, optimal: 1800, max: 2500, unit: 'kcal' },
  exercise_minutes: { min: 15, optimal: 30, max: 90, unit: 'min' },
  stand_hours: { min: 6, optimal: 12, max: 16, unit: 'hr' },
  vo2_max: { min: 30, optimal: 45, max: 60, unit: 'mL/kg/min' },
  walking_running_distance: { min: 2, optimal: 5, max: 15, unit: 'km' },
  // Vitals
  respiratory_rate: { min: 12, optimal: 14, max: 20, unit: 'br/min' },
  blood_oxygen: { min: 95, optimal: 98, max: 100, unit: '%' },
  body_temperature: { min: 36, optimal: 36.8, max: 37.5, unit: '°C' }
}

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

export interface HealthScore {
  overall: number
  sleep: number
  recovery: number
  activity: number
  bodyComp: number  // Body composition score (when data available)
  readiness: number // New: daily readiness score
  breakdown: Array<{
    metric: MetricType
    score: number
    weight: number
    trend: 'up' | 'down' | 'stable'
    vsOptimal: number // % of optimal
  }>
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
  avgScore: number
  avgTimeInBed: number
  efficiency: number // duration / time_in_bed
  consistencyScore: number // How consistent is sleep timing
  avgBedTemp?: number
  optimalTempNights?: number
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
    recordedAt: { gte: startDate, lte: endDate }
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

function calculateConsistency(values: number[]): number {
  if (values.length < 2) return 100
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  const cv = (stdDev / mean) * 100 // Coefficient of variation
  return Math.max(0, Math.min(100, 100 - cv * 2))
}

function calculateMomentum(
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
  const midDate = new Date()
  midDate.setDate(midDate.getDate() - periodDays)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays * 3) // Get 3 periods for momentum

  const allMetrics = await getUnifiedMetrics(userId, startDate, endDate)
  const trends: HealthTrend[] = []

  for (const [metricType, metrics] of allMetrics) {
    const current = metrics.filter(m => new Date(m.date) >= midDate)
    const previous = metrics.filter(m => {
      const d = new Date(m.date)
      return d >= new Date(midDate.getTime() - periodDays * 24 * 60 * 60 * 1000) && d < midDate
    })
    const older = metrics.filter(m => {
      const d = new Date(m.date)
      return d < new Date(midDate.getTime() - periodDays * 24 * 60 * 60 * 1000)
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
    const changePercent = previousAvg !== 0 ? (change / previousAvg) * 100 : 0
    const previousChange = previousAvg - olderAvg
    const previousChangePercent = olderAvg !== 0 ? (previousChange / olderAvg) * 100 : 0

    const polarity = METRIC_POLARITY[metricType]
    let trend: 'improving' | 'declining' | 'stable'

    if (Math.abs(changePercent) < 3) {
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
      confidence: current.length >= 5 ? 'high' : current.length >= 3 ? 'medium' : 'low',
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
    'sleep_duration', 'sleep_score', 'time_in_bed', 'bed_temperature'
  ])

  const duration = metrics.get('sleep_duration') || []
  const scores = metrics.get('sleep_score') || []
  const timeInBed = metrics.get('time_in_bed') || []
  const bedTemp = metrics.get('bed_temperature') || []

  if (duration.length < 3) return null

  const avgDuration = duration.reduce((s, m) => s + m.value, 0) / duration.length
  const avgScore = scores.length > 0
    ? scores.reduce((s, m) => s + m.value, 0) / scores.length
    : 0
  const avgTimeInBed = timeInBed.length > 0
    ? timeInBed.reduce((s, m) => s + m.value, 0) / timeInBed.length
    : avgDuration * 1.1

  const efficiency = avgTimeInBed > 0 ? (avgDuration / avgTimeInBed) * 100 : 85
  const consistencyScore = calculateConsistency(duration.map(m => m.value))

  const avgBedTemp = bedTemp.length > 0
    ? bedTemp.reduce((s, m) => s + m.value, 0) / bedTemp.length
    : undefined

  const optimalRange = OPTIMAL_RANGES.bed_temperature
  const optimalTempNights = bedTemp.filter(m =>
    m.value >= optimalRange.min && m.value <= optimalRange.max
  ).length

  // Determine recent trend
  const recentScores = scores.slice(-7)
  const olderScores = scores.slice(-14, -7)
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable'

  if (recentScores.length >= 3 && olderScores.length >= 3) {
    const recentAvg = recentScores.reduce((s, m) => s + m.value, 0) / recentScores.length
    const olderAvg = olderScores.reduce((s, m) => s + m.value, 0) / olderScores.length
    const change = ((recentAvg - olderAvg) / olderAvg) * 100
    if (change > 5) recentTrend = 'improving'
    else if (change < -5) recentTrend = 'declining'
  }

  return {
    avgDuration,
    avgScore,
    avgTimeInBed,
    efficiency,
    consistencyScore,
    avgBedTemp,
    optimalTempNights,
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
  let score = 70 // Base score
  let factors = 0

  if (hrvTrend) {
    const hrvOptimal = OPTIMAL_RANGES.hrv.optimal
    const hrvScore = Math.min(100, (hrvTrend.currentValue / hrvOptimal) * 100)
    score += (hrvScore - 70) * 0.4
    factors++
  }

  if (rhrTrend) {
    const rhrOptimal = OPTIMAL_RANGES.rhr.optimal
    // Lower RHR is better
    const rhrScore = rhrTrend.currentValue <= rhrOptimal
      ? 100
      : Math.max(50, 100 - ((rhrTrend.currentValue - rhrOptimal) / 20) * 50)
    score += (rhrScore - 70) * 0.3
    factors++
  }

  if (sleepTrend) {
    const sleepScore = Math.min(100, sleepTrend.currentValue)
    score += (sleepScore - 70) * 0.3
    factors++
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const status: RecoveryStatus['status'] =
    score >= 85 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 55 ? 'moderate' : 'poor'

  const sleepQuality: RecoveryStatus['sleepQuality'] =
    (sleepTrend?.currentValue || 0) >= 85 ? 'excellent' :
    (sleepTrend?.currentValue || 0) >= 70 ? 'good' :
    (sleepTrend?.currentValue || 0) >= 55 ? 'fair' : 'poor'

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
      const changePercent = beforeAvg !== 0 ? (change / beforeAvg) * 100 : 0

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
    sleep_duration: { category: 'sleep', weight: 0.35 },
    sleep_score: { category: 'sleep', weight: 0.45 },
    time_in_bed: { category: 'sleep', weight: 0.1 },
    bed_temperature: { category: 'sleep', weight: 0.1 },
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
    const vsOptimal = range.optimal !== 0 ? (trend.currentValue / range.optimal) * 100 : 100

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
      else score = 100 - ((trend.currentValue - range.optimal) / (range.max - range.optimal)) * 50
    } else {
      if (trend.currentValue >= range.optimal) score = 100
      else if (trend.currentValue <= range.min) score = 50
      else score = 50 + ((trend.currentValue - range.min) / (range.optimal - range.min)) * 50
    }

    score = Math.max(0, Math.min(100, Math.round(score)))

    breakdown.push({
      metric: trend.metricType,
      score,
      weight: w.weight,
      trend: trend.trend === 'improving' ? 'up' : trend.trend === 'declining' ? 'down' : 'stable',
      vsOptimal: range.optimal !== 0
        ? Math.round(polarity === 'lower_better' ? (range.optimal / trend.currentValue) * 100 : vsOptimal)
        : Math.round(score)
    })

    if (w.weight > 0) {
      categoryScores[w.category].push(score)
    }
  }

  const avgScore = (scores: number[]) =>
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 70

  const sleep = avgScore(categoryScores.sleep)
  const recoveryScore = avgScore(categoryScores.recovery)
  const activity = avgScore(categoryScores.activity)
  const bodyCompScore = avgScore(categoryScores.bodyComp)
  const hasBodyComp = categoryScores.bodyComp.length > 0
  const readiness = recovery?.score || Math.round((sleep * 0.5 + recoveryScore * 0.5))

  // Adjust weights based on body comp data availability
  const overall = hasBodyComp
    ? Math.round(sleep * 0.35 + recoveryScore * 0.30 + activity * 0.20 + bodyCompScore * 0.15)
    : Math.round(sleep * 0.4 + recoveryScore * 0.35 + activity * 0.25)

  return { overall, sleep, recovery: recoveryScore, activity, bodyComp: bodyCompScore, readiness, breakdown }
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
    if (sleepArch.efficiency < 80) {
      insights.push({
        id: 'sleep-efficiency-low',
        type: 'recommendation',
        priority: 'high',
        title: 'Sleep Efficiency Below Optimal',
        description: `You're spending ${formatMetricValue(sleepArch.avgTimeInBed, 'time_in_bed')} in bed but only sleeping ${formatMetricValue(sleepArch.avgDuration, 'sleep_duration')} (${sleepArch.efficiency.toFixed(0)}% efficiency).`,
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
          actionable: 'Consider adjusting your Eight Sleep temperature settings.'
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

  if (bodyFatTrend && massTrend) {
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
  }

  if (weightTrend && bodyFatTrend && !massTrend) {
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

  // 4. Protocol Impact Analysis
  for (const impact of protocolImpacts.slice(0, 2)) {
    if (impact.overallImpact === 'positive' && impact.impactScore > 10) {
      const significantMetrics = impact.metrics.filter(m => m.isSignificant && m.changePercent > 0)
      insights.push({
        id: `protocol-${impact.protocolId}`,
        type: 'correlation',
        priority: 'high',
        title: `${impact.peptideName} Showing Results`,
        description: `After ${impact.daysSinceStart} days, overall health metrics improved by ${impact.impactScore}%.`,
        details: significantMetrics.map(m =>
          `${getMetricDisplayName(m.metricType)}: ${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(0)}%`
        ).join(', '),
        metrics: significantMetrics.map(m => m.metricType),
        relatedProtocol: { id: impact.protocolId, name: impact.peptideName },
        dataPoints: significantMetrics.reduce((s, m) => s + m.dataPointsAfter, 0),
        confidence: impact.metrics.filter(m => m.dataPointsAfter >= 7).length > 2 ? 85 : 60
      })
    } else if (impact.overallImpact === 'negative' && impact.impactScore < -10) {
      insights.push({
        id: `protocol-concern-${impact.protocolId}`,
        type: 'concern',
        priority: 'medium',
        title: `Review ${impact.peptideName} Protocol`,
        description: `Health metrics have declined ${Math.abs(impact.impactScore)}% since starting ${impact.peptideName}.`,
        details: 'This may be normal adaptation or worth discussing with your provider.',
        metrics: impact.metrics.filter(m => m.changePercent < -5).map(m => m.metricType),
        relatedProtocol: { id: impact.protocolId, name: impact.peptideName },
        actionable: 'Monitor for another week. If decline continues, consider adjusting dosing or timing.'
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
      insights.push({
        id: 'sleep-hrv-divergence',
        type: 'observation',
        priority: 'medium',
        title: 'Sleep & HRV Diverging',
        description: `Sleep is ${sleepTrend.trend} while HRV is ${hrvTrend.trend}. This divergence is worth monitoring.`,
        details: 'Factors like stress, alcohol, or overtraining can cause HRV to diverge from sleep quality.',
        metrics: ['sleep_score', 'hrv']
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
      insights.push({
        id: 'activity-bodycomp-decline',
        type: 'concern',
        priority: 'medium',
        title: 'Reduced Activity Affecting Body Composition',
        description: `Exercise is down ${Math.abs(activityTrend.changePercent).toFixed(0)}% and body fat is trending up. Maintaining activity helps preserve body composition.`,
        actionable: 'Look for opportunities to increase training frequency or daily movement.',
        metrics: ['exercise_minutes', 'body_fat_percentage'],
      })
    }
  }

  // 10. Sleep x Activity Decline
  const sleepDurationTrend = trends.find(t => t.metricType === 'sleep_duration')
  if (sleepDurationTrend && stepsTrend) {
    if (sleepDurationTrend.trend === 'declining' && stepsTrend.trend === 'declining') {
      insights.push({
        id: 'sleep-activity-decline',
        type: 'concern',
        priority: 'medium',
        title: 'Sleep Decline Impacting Activity',
        description: `Both sleep (${sleepDurationTrend.changePercent.toFixed(0)}%) and daily activity (${stepsTrend.changePercent.toFixed(0)}%) are declining. Poor sleep often reduces motivation and energy for movement.`,
        actionable: 'Focus on sleep quality first — improved sleep typically restores activity levels naturally.',
        metrics: ['sleep_duration', 'steps'],
      })
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

export async function getUnifiedHealthSummary(userId: string) {
  const [score, trends, insights, recovery, sleepArch, dayPatterns] = await Promise.all([
    calculateHealthScore(userId),
    calculateHealthTrends(userId, 7),
    generateSynthesizedInsights(userId),
    calculateRecoveryStatus(userId),
    analyzeSleepArchitecture(userId),
    analyzeDayPatterns(userId)
  ])

  return {
    score,
    trends: trends.slice(0, 8),
    insights,
    recovery,
    sleepArchitecture: sleepArch,
    dayPatterns,
    lastUpdated: new Date().toISOString()
  }
}
