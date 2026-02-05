// Health Trajectory Engine
// Computes trajectory direction, confidence, and body composition state
// Primary unit of analysis: recent trajectory, not today's score

import { subDays, parseISO, differenceInDays, format } from 'date-fns'
import { METRIC_POLARITY, computeBaseline, type MetricBaseline, type DailyMetricValue } from './health-baselines'
import { clampPercent, validateChangePercent, validateMetricValue, safeDivide, safePercentChange, type MetricType } from './health-constants'
import type { SeedMetric } from './demo-data/seed-metrics'

// ─── Types ───────────────────────────────────────────────────────────

export type TrajectoryDirection = 'improving' | 'stable' | 'declining'
export type TrajectoryConfidence = 'high' | 'moderate' | 'low' | 'insufficient'
export type TimeWindow = 7 | 30 | 90

export interface HealthTrajectory {
  direction: TrajectoryDirection
  confidence: TrajectoryConfidence
  confidenceScore: number           // 0-100
  window: 7 | 14 | 30 | 90         // days used
  headline: string                  // "Sleep and recovery driving steady improvement"
  signals: TrajectorySignal[]
  sleep: CategoryTrajectory
  recovery: CategoryTrajectory
  activity: CategoryTrajectory
  bodyComp: CategoryTrajectory | null
  dataState: 'rich' | 'adequate' | 'sparse' | 'insufficient'
  daysOfData: number
  timeWindow: TimeWindow            // user-selected window (7/30/90)
  windowLabel: string               // "Short-term signal" | "Balanced signal" | "Long-term trend"
}

export interface CategoryTrajectory {
  direction: TrajectoryDirection
  weight: number
  topMetric: string
  topMetricChange: number           // percent
  momentum: 'accelerating' | 'steady' | 'decelerating'
}

export interface TrajectorySignal {
  metricType: string
  direction: TrajectoryDirection
  strength: number                  // 0-1
  percentChange: number
  consistency: number               // 0-1
  category: 'sleep' | 'recovery' | 'activity' | 'bodyComp'
}

// ─── Body Composition ────────────────────────────────────────────────

export interface BodyCompState {
  weight?: { value: number; date: string }
  bodyFatPct?: { value: number; date: string }
  leanMass?: { value: number; date: string }
  muscleMass?: { value: number; date: string }
  trend: {
    weightDir: 'up' | 'down' | 'stable'
    fatDir: 'up' | 'down' | 'stable'
    massDir: 'up' | 'down' | 'stable'
  }
  recompStatus: 'recomposing' | 'fat_loss' | 'muscle_gain' | 'stable' | 'regressing' | 'insufficient_data'
  headline: string
  detail: string
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
}

// ─── Constants ───────────────────────────────────────────────────────

const METRIC_CATEGORIES: Record<string, 'sleep' | 'recovery' | 'activity' | 'bodyComp'> = {
  sleep_duration: 'sleep',
  deep_sleep: 'sleep',
  rem_sleep: 'sleep',
  sleep_efficiency: 'sleep',
  sleep_score: 'sleep',
  waso: 'sleep',
  sleep_latency: 'sleep',
  hrv: 'recovery',
  rhr: 'recovery',
  readiness_score: 'recovery',
  respiratory_rate: 'recovery',
  blood_oxygen: 'recovery',
  steps: 'activity',
  active_calories: 'activity',
  exercise_minutes: 'activity',
  walking_running_distance: 'activity',
  vo2_max: 'activity',
  stand_hours: 'activity',
  weight: 'bodyComp',
  body_fat_percentage: 'bodyComp',
  lean_body_mass: 'bodyComp',
  muscle_mass: 'bodyComp',
  bmi: 'bodyComp',
  bone_mass: 'bodyComp',
  body_water: 'bodyComp',
}

// Window-aware category weights — body composition is the primary signal,
// especially at longer windows where protocol effects manifest in composition.
// "Sleep & Recovery" is split evenly between the two sub-categories.
const WINDOW_CATEGORY_WEIGHTS: Record<TimeWindow, {
  sleep: number; recovery: number; activity: number; bodyComp: number
}> = {
  7:  { sleep: 0.175, recovery: 0.175, activity: 0.25,  bodyComp: 0.40 },
  30: { sleep: 0.15,  recovery: 0.15,  activity: 0.15,  bodyComp: 0.55 },
  90: { sleep: 0.10,  recovery: 0.10,  activity: 0.10,  bodyComp: 0.70 },
}

function getCategoryWeights(timeWindow: TimeWindow) {
  return WINDOW_CATEGORY_WEIGHTS[timeWindow]
}

// ─── Window semantics ───────────────────────────────────────────────

const WINDOW_SEMANTICS: Record<TimeWindow, { label: string; confidenceBonus: number }> = {
  7:  { label: 'Short-term signal',  confidenceBonus: 10 },
  30: { label: 'Balanced signal',    confidenceBonus: 30 },
  90: { label: 'Long-term trend',    confidenceBonus: 40 },
}

// ─── Main Functions ──────────────────────────────────────────────────

export function computeTrajectory(
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>,
  timeWindow: TimeWindow = 30
): HealthTrajectory {
  // Step 1: Check data sufficiency
  const { dataState, daysOfData } = selectWindow(metrics)

  if (dataState === 'insufficient') {
    return makeInsufficientTrajectory(daysOfData, timeWindow)
  }

  // Always use the user-selected window. The window controls which
  // date range computePerMetricSignals filters to — it doesn't require
  // that many days of data to exist. Even a 90-day window works fine
  // with 25 days of data: it just uses whatever falls within that range.
  const effectiveWindow = timeWindow

  // Step 2: Per-metric trend signals (with smoothing for 90d)
  const processedMetrics = effectiveWindow === 90
    ? smoothMetrics(metrics, 3)  // 3-day rolling average for 90d
    : metrics
  const signals = computePerMetricSignals(processedMetrics, effectiveWindow)

  // Step 3: Category aggregation (window-aware weights)
  const sleep = aggregateCategory(signals, 'sleep', timeWindow)
  const recovery = aggregateCategory(signals, 'recovery', timeWindow)
  const activity = aggregateCategory(signals, 'activity', timeWindow)
  const bodyCompSignals = signals.filter(s => s.category === 'bodyComp')
  const bodyComp = bodyCompSignals.length >= 1 ? aggregateCategory(signals, 'bodyComp', timeWindow) : null

  // Step 4: Overall direction (weighted vote, window-aware)
  const direction = computeOverallDirection(sleep, recovery, activity, bodyComp, timeWindow)

  // Step 5: Confidence score — uses window-specific contribution
  const confidenceScore = computeConfidenceScore(signals, effectiveWindow, sleep, recovery, activity, bodyComp)
  const confidence: TrajectoryConfidence =
    confidenceScore >= 70 ? 'high' :
    confidenceScore >= 45 ? 'moderate' :
    confidenceScore >= 25 ? 'low' : 'insufficient'

  // Step 6: Headline
  const headline = generateHeadline(direction, sleep, recovery, activity, bodyComp)

  const semantics = WINDOW_SEMANTICS[timeWindow]

  return {
    direction,
    confidence,
    confidenceScore,
    window: effectiveWindow,
    headline,
    signals,
    sleep,
    recovery,
    activity,
    bodyComp,
    dataState,
    daysOfData,
    timeWindow,
    windowLabel: semantics.label,
  }
}

export function computeBodyCompState(metrics: SeedMetric[]): BodyCompState {
  const today = new Date()

  // Find the earliest body comp data to determine available window
  const bodyCompTypes = ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass']
  const bodyCompMetrics = metrics.filter(m => bodyCompTypes.includes(m.metricType))

  // Default to 30 days, but expand to include all available data if needed
  let windowStart = subDays(today, 30)
  const pointsIn30Days = bodyCompMetrics.filter(m => parseISO(m.date) >= windowStart).length

  if (pointsIn30Days < 4 && bodyCompMetrics.length >= 4) {
    // Not enough data in 30-day window, but we have data — use all available
    const earliestDate = bodyCompMetrics
      .map(m => parseISO(m.date))
      .reduce((min, d) => d < min ? d : min, today)
    windowStart = earliestDate
  }

  // Get latest values
  const getLatest = (type: string) => {
    const vals = metrics
      .filter(m => m.metricType === type)
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
    return vals[0] ? { value: vals[0].value, date: vals[0].date } : undefined
  }

  const weight = getLatest('weight')
  const bodyFatPct = getLatest('body_fat_percentage')
  const leanMass = getLatest('lean_body_mass')
  const muscleMass = getLatest('muscle_mass')

  // Compute trends using available window
  const computeDir = (type: string): 'up' | 'down' | 'stable' => {
    const vals = metrics
      .filter(m => m.metricType === type && parseISO(m.date) >= windowStart)
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
    if (vals.length < 4) return 'stable'
    const half = Math.floor(vals.length / 2)
    const firstHalf = vals.slice(0, half)
    const secondHalf = vals.slice(half)
    const firstAvg = firstHalf.reduce((s, v) => s + v.value, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, v) => s + v.value, 0) / secondHalf.length
    const pctChange = safePercentChange(secondAvg, firstAvg) ?? 0
    if (Math.abs(pctChange) < 1) return 'stable'
    return pctChange > 0 ? 'up' : 'down'
  }

  const weightDir = computeDir('weight')
  const fatDir = computeDir('body_fat_percentage')
  const massDir = computeDir(muscleMass ? 'muscle_mass' : 'lean_body_mass')

  // Count data points in window (reuse bodyCompTypes from above)
  const totalPoints = metrics.filter(m =>
    bodyCompTypes.includes(m.metricType) && parseISO(m.date) >= windowStart
  ).length

  if (totalPoints < 4) {
    return {
      weight, bodyFatPct, leanMass, muscleMass,
      trend: { weightDir: 'stable', fatDir: 'stable', massDir: 'stable' },
      recompStatus: 'insufficient_data',
      headline: 'Not enough body composition data yet',
      detail: `Need at least 4 measurements. Have ${totalPoints} so far.`,
      confidence: 'insufficient',
    }
  }

  // Determine recomp status
  let recompStatus: BodyCompState['recompStatus'] = 'stable'
  let headline = ''
  let detail = ''

  if (fatDir === 'down' && massDir === 'up') {
    recompStatus = 'recomposing'
    headline = 'Body recomposition in progress'
    detail = 'Body fat decreasing while muscle mass increasing. Optimal composition changes.'
  } else if (fatDir === 'down' && (massDir === 'stable' || massDir === 'down')) {
    recompStatus = 'fat_loss'
    headline = 'Fat loss phase'
    detail = fatDir === 'down' && massDir === 'stable'
      ? 'Body fat decreasing with lean mass preserved.'
      : 'Body fat decreasing. Monitor lean mass retention.'
  } else if (massDir === 'up' && (fatDir === 'stable' || fatDir === 'up')) {
    recompStatus = 'muscle_gain'
    headline = 'Muscle building phase'
    detail = fatDir === 'stable'
      ? 'Gaining muscle with stable body fat.'
      : 'Gaining muscle with some fat gain. Normal for a building phase.'
  } else if (fatDir === 'up' && massDir === 'down') {
    recompStatus = 'regressing'
    headline = 'Composition shifting unfavorably'
    detail = 'Body fat increasing while muscle mass decreasing. Review training and nutrition.'
  } else {
    recompStatus = 'stable'
    headline = 'Body composition stable'
    detail = 'No significant changes in body fat or muscle mass.'
  }

  const confidence: BodyCompState['confidence'] =
    totalPoints >= 10 ? 'high' :
    totalPoints >= 6 ? 'medium' : 'low'

  return {
    weight, bodyFatPct, leanMass, muscleMass,
    trend: { weightDir, fatDir, massDir },
    recompStatus,
    headline,
    detail,
    confidence,
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

function selectWindow(metrics: SeedMetric[]): {
  window: 7 | 14 | 30
  dataState: HealthTrajectory['dataState']
  daysOfData: number
} {
  // Count unique dates
  const uniqueDates = new Set(metrics.map(m => m.date))
  const daysOfData = uniqueDates.size

  if (daysOfData >= 21) return { window: 30, dataState: 'rich', daysOfData }
  if (daysOfData >= 10) return { window: 14, dataState: 'adequate', daysOfData }
  if (daysOfData >= 5) return { window: 7, dataState: 'sparse', daysOfData }
  return { window: 7, dataState: 'insufficient', daysOfData }
}

function computePerMetricSignals(metrics: SeedMetric[], window: 7 | 14 | 30 | 90): TrajectorySignal[] {
  const signals: TrajectorySignal[] = []
  const today = new Date()
  const windowStart = subDays(today, window)

  // Group by metric type, filter to window
  const byType = new Map<string, SeedMetric[]>()
  for (const m of metrics) {
    if (parseISO(m.date) < windowStart) continue
    const category = METRIC_CATEGORIES[m.metricType]
    if (!category) continue
    if (!byType.has(m.metricType)) byType.set(m.metricType, [])
    byType.get(m.metricType)!.push(m)
  }

  for (const [metricType, values] of byType) {
    if (values.length < 3) continue

    // Filter out invalid values based on metric bounds
    const validValues = values.filter(v => validateMetricValue(metricType as MetricType, v.value))
    if (validValues.length < 3) continue

    const sorted = [...validValues].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

    // Split into halves
    const half = Math.floor(sorted.length / 2)
    const firstHalf = sorted.slice(0, half)
    const secondHalf = sorted.slice(half)

    if (firstHalf.length === 0 || secondHalf.length === 0) continue

    const firstAvg = firstHalf.reduce((s, v) => s + v.value, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, v) => s + v.value, 0) / secondHalf.length

    // Calculate and validate percent change (safe division)
    let percentChange = safePercentChange(secondAvg, firstAvg) ?? 0
    percentChange = validateChangePercent(metricType as MetricType, percentChange, window >= 7 ? 'weekly' : 'daily')

    // Consistency: fraction of day-over-day changes in same direction
    let sameDir = 0
    let totalChanges = 0
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i].value - sorted[i - 1].value
      if (diff !== 0) {
        totalChanges++
        if ((percentChange > 0 && diff > 0) || (percentChange < 0 && diff < 0)) {
          sameDir++
        }
      }
    }
    const consistency = totalChanges > 0 ? sameDir / totalChanges : 0.5

    // Data point weight
    const dataPointWeight = Math.min(1, values.length / (window * 0.7))

    // Signal strength
    const strength = Math.min(1, Math.abs(percentChange) / 10) * consistency * dataPointWeight

    // Direction (polarity-aware)
    const polarity = METRIC_POLARITY[metricType] || 'higher_better'
    const rawDirection = percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'neutral'
    const isImproving =
      (polarity === 'higher_better' && rawDirection === 'up') ||
      (polarity === 'lower_better' && rawDirection === 'down')
    const isDeclining =
      (polarity === 'higher_better' && rawDirection === 'down') ||
      (polarity === 'lower_better' && rawDirection === 'up')

    const direction: TrajectoryDirection =
      Math.abs(percentChange) < 2 ? 'stable' :
      isImproving ? 'improving' : isDeclining ? 'declining' : 'stable'

    const category = METRIC_CATEGORIES[metricType]!
    signals.push({ metricType, direction, strength, percentChange, consistency, category })
  }

  return signals
}

function aggregateCategory(signals: TrajectorySignal[], category: 'sleep' | 'recovery' | 'activity' | 'bodyComp', timeWindow: TimeWindow = 30): CategoryTrajectory {
  const weights = getCategoryWeights(timeWindow)
  const catSignals = signals.filter(s => s.category === category)

  if (catSignals.length === 0) {
    // No signals = no data, not "stable". Set weight to 0 so this category
    // doesn't influence overall direction. topMetric='' signals "no data" to callers.
    return {
      direction: 'stable',
      weight: 0,  // Zero weight — this category has no data to contribute
      topMetric: '',
      topMetricChange: 0,
      momentum: 'steady',
    }
  }

  // Weighted vote
  let improvingWeight = 0
  let decliningWeight = 0
  for (const s of catSignals) {
    if (s.direction === 'improving') improvingWeight += s.strength
    if (s.direction === 'declining') decliningWeight += s.strength
  }

  const net = improvingWeight - decliningWeight
  const direction: TrajectoryDirection =
    net > 0.15 ? 'improving' :
    net < -0.15 ? 'declining' : 'stable'

  // Top metric by strength
  const sorted = [...catSignals].sort((a, b) => b.strength - a.strength)
  const topMetric = sorted[0]?.metricType || ''
  const topMetricChange = sorted[0]?.percentChange || 0

  // Simple momentum: compare strength of recent signals
  // Use consistency as a proxy for momentum
  const avgConsistency = catSignals.reduce((s, v) => s + v.consistency, 0) / catSignals.length
  const momentum: CategoryTrajectory['momentum'] =
    avgConsistency > 0.7 ? 'accelerating' :
    avgConsistency < 0.4 ? 'decelerating' : 'steady'

  return {
    direction,
    weight: weights[category],
    topMetric,
    topMetricChange: Math.round(topMetricChange * 10) / 10,
    momentum,
  }
}

function computeOverallDirection(
  sleep: CategoryTrajectory,
  recovery: CategoryTrajectory,
  activity: CategoryTrajectory,
  bodyComp: CategoryTrajectory | null,
  timeWindow: TimeWindow = 30
): TrajectoryDirection {
  const weights = getCategoryWeights(timeWindow)
  const dirScore = (d: TrajectoryDirection) =>
    d === 'improving' ? 1 : d === 'declining' ? -1 : 0

  let totalWeight: number
  let weightedScore: number

  if (bodyComp) {
    totalWeight = weights.sleep + weights.recovery + weights.activity + weights.bodyComp
    weightedScore =
      dirScore(sleep.direction) * weights.sleep +
      dirScore(recovery.direction) * weights.recovery +
      dirScore(activity.direction) * weights.activity +
      dirScore(bodyComp.direction) * weights.bodyComp
  } else {
    // Reweight without bodyComp — redistribute proportionally among remaining categories
    const factor = 1 / (weights.sleep + weights.recovery + weights.activity)
    totalWeight = 1
    weightedScore =
      dirScore(sleep.direction) * weights.sleep * factor +
      dirScore(recovery.direction) * weights.recovery * factor +
      dirScore(activity.direction) * weights.activity * factor
  }

  const normalized = weightedScore / totalWeight
  let direction: TrajectoryDirection
  if (normalized > 0.15) direction = 'improving'
  else if (normalized < -0.15) direction = 'declining'
  else direction = 'stable'

  // 90d override: can't be "declining" if body comp is improving.
  // Body comp is the dominant long-term signal — improving composition
  // means the protocol is working even if sleep/activity dip.
  if (timeWindow === 90 && direction === 'declining' && bodyComp?.direction === 'improving') {
    direction = 'stable'
  }

  return direction
}

function computeConfidenceScore(
  signals: TrajectorySignal[],
  window: 7 | 14 | 30 | 90,
  sleep: CategoryTrajectory,
  recovery: CategoryTrajectory,
  activity: CategoryTrajectory,
  bodyComp: CategoryTrajectory | null
): number {
  let score = 0

  // Data density: how many signals do we actually have?
  // This is more important than raw window size
  const signalCount = signals.length
  if (signalCount >= 8) score += 25
  else if (signalCount >= 5) score += 15
  else if (signalCount >= 3) score += 10
  else score += 5

  // Window contribution — but scaled by actual data density
  // A 90-day window with 3 signals is NOT as confident as 30 days with 10 signals
  const densityRatio = window > 0 ? Math.min(1, signalCount / (window * 0.1)) : 0
  if (window >= 90) score += Math.round(25 * densityRatio)
  else if (window >= 30) score += Math.round(20 * densityRatio)
  else if (window >= 14) score += Math.round(15 * densityRatio)
  else score += Math.round(10 * densityRatio)

  // Agreement bonus — do categories agree?
  const directions = [sleep.direction, recovery.direction, activity.direction]
  if (bodyComp) directions.push(bodyComp.direction)
  const allSame = directions.every(d => d === directions[0])
  if (allSame) score += 15

  // Category diversity: how many categories have actual signals?
  const categoriesWithData = new Set(signals.map(s => s.category)).size
  score += Math.min(15, categoriesWithData * 5)

  // Consistency bonus
  const avgConsistency = signals.length > 0
    ? signals.reduce((s, v) => s + v.consistency, 0) / signals.length
    : 0
  if (avgConsistency > 0.7) score += 10

  // Body comp presence bonus — body comp data improves trajectory reliability
  if (bodyComp && bodyComp.topMetric !== '') {
    score += 5
  }

  // Volatility penalty — check coefficient of variation of signal strengths
  if (signals.length > 2) {
    const strengths = signals.map(s => s.strength)
    const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length
    const cv = mean > 0 ? safeDivide(
      Math.sqrt(strengths.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / strengths.length),
      mean
    ) : null
    if (cv !== null && cv * 100 > 25) score -= 10
  }

  return Math.max(20, Math.min(95, score))
}

function generateHeadline(
  direction: TrajectoryDirection,
  sleep: CategoryTrajectory,
  recovery: CategoryTrajectory,
  activity: CategoryTrajectory,
  bodyComp: CategoryTrajectory | null
): string {
  // Find the strongest improving or declining categories
  // Body comp listed first — it's the primary signal
  const categories: { name: string; cat: CategoryTrajectory }[] = []
  if (bodyComp) categories.push({ name: 'Body comp', cat: bodyComp })
  categories.push(
    { name: 'Sleep', cat: sleep },
    { name: 'Recovery', cat: recovery },
    { name: 'Activity', cat: activity },
  )

  const improving = categories.filter(c => c.cat.direction === 'improving')
  const declining = categories.filter(c => c.cat.direction === 'declining')

  if (direction === 'improving') {
    if (improving.length > 0) {
      const names = improving.slice(0, 2).map(c => c.name.toLowerCase())
      return `${capitalizeFirst(names.join(' and '))} driving steady improvement`
    }
    return 'Health metrics trending upward'
  }

  if (direction === 'declining') {
    if (declining.length > 0) {
      const names = declining.slice(0, 2).map(c => c.name.toLowerCase())
      return `${capitalizeFirst(names.join(' and '))} showing decline — worth attention`
    }
    return 'Some health metrics trending down'
  }

  // Stable
  if (improving.length > 0 && declining.length > 0) {
    return `Mixed signals — ${improving[0].name.toLowerCase()} improving, ${declining[0].name.toLowerCase()} declining`
  }
  return 'Health metrics holding steady'
}

function makeInsufficientTrajectory(daysOfData: number, timeWindow: TimeWindow = 30): HealthTrajectory {
  const weights = getCategoryWeights(timeWindow)
  return {
    direction: 'stable',
    confidence: 'insufficient',
    confidenceScore: 0,
    window: 7,
    headline: `Need more data — ${daysOfData} day${daysOfData === 1 ? '' : 's'} tracked so far`,
    signals: [],
    sleep: { direction: 'stable', weight: weights.sleep, topMetric: '', topMetricChange: 0, momentum: 'steady' },
    recovery: { direction: 'stable', weight: weights.recovery, topMetric: '', topMetricChange: 0, momentum: 'steady' },
    activity: { direction: 'stable', weight: weights.activity, topMetric: '', topMetricChange: 0, momentum: 'steady' },
    bodyComp: null,
    dataState: 'insufficient',
    daysOfData,
    timeWindow,
    windowLabel: WINDOW_SEMANTICS[timeWindow].label,
  }
}

// Smooth metrics with a rolling average to dampen short-term noise (used for 90d)
function smoothMetrics(metrics: SeedMetric[], windowSize: number): SeedMetric[] {
  // Group by metric type
  const byType = new Map<string, SeedMetric[]>()
  for (const m of metrics) {
    if (!byType.has(m.metricType)) byType.set(m.metricType, [])
    byType.get(m.metricType)!.push(m)
  }

  const smoothed: SeedMetric[] = []
  for (const [, values] of byType) {
    const sorted = [...values].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
    for (let i = 0; i < sorted.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2))
      const end = Math.min(sorted.length, i + Math.ceil(windowSize / 2))
      const slice = sorted.slice(start, end)
      const avg = slice.reduce((s, v) => s + v.value, 0) / slice.length
      smoothed.push({ ...sorted[i], value: avg })
    }
  }
  return smoothed
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
