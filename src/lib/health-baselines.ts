// Baseline computation engine for health metrics
// Computes personal baselines with rolling windows and robust statistics

import { subDays, differenceInDays, parseISO, format } from 'date-fns'
import { clampPercent, validateChangePercent, safeDivide, safePercentChange, type MetricType } from './health-constants'
import { derivePolarityMap } from './health-metric-contract'

export interface MetricBaseline {
  metricType: string
  mean: number
  stdDev: number
  median: number
  p25: number  // 25th percentile
  p75: number  // 75th percentile
  min: number
  max: number
  dataPoints: number
  windowDays: number
  lastUpdated: Date
}

export interface BaselineDelta {
  current: number
  baseline: MetricBaseline
  absoluteDelta: number
  percentDelta: number
  zScore: number
  percentile: number
  direction: 'above' | 'below' | 'at'
  significance: 'high' | 'medium' | 'low' | 'none'
  description: string
}

export interface DailyMetricValue {
  date: string
  value: number
}

// Compute baseline statistics for a metric
export function computeBaseline(
  values: DailyMetricValue[],
  windowDays: number = 28,
  endDate: Date = new Date(),
  minDataPoints: number = 5
): MetricBaseline | null {
  // Filter to window
  const windowStart = subDays(endDate, windowDays)
  const windowValues = values
    .filter(v => {
      const date = parseISO(v.date)
      return date >= windowStart && date <= endDate
    })
    .map(v => v.value)
    .sort((a, b) => a - b)

  if (windowValues.length < minDataPoints) {
    return null // Not enough data
  }

  // Remove outliers (values beyond 3 IQR)
  const q1 = percentile(windowValues, 25)
  const q3 = percentile(windowValues, 75)
  const iqr = q3 - q1
  const lowerBound = q1 - 3 * iqr
  const upperBound = q3 + 3 * iqr

  const cleanValues = windowValues.filter(v => v >= lowerBound && v <= upperBound)

  if (cleanValues.length < minDataPoints) {
    return null
  }

  const mean = cleanValues.reduce((a, b) => a + b, 0) / cleanValues.length
  const variance = cleanValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / cleanValues.length
  const stdDev = Math.sqrt(variance)

  return {
    metricType: '', // Set by caller
    mean: round(mean, 2),
    stdDev: round(stdDev, 2),
    median: round(percentile(cleanValues, 50), 2),
    p25: round(percentile(cleanValues, 25), 2),
    p75: round(percentile(cleanValues, 75), 2),
    min: round(Math.min(...cleanValues), 2),
    max: round(Math.max(...cleanValues), 2),
    dataPoints: cleanValues.length,
    windowDays,
    lastUpdated: new Date()
  }
}

// Compare current value to baseline
export function compareToBaseline(
  current: number,
  baseline: MetricBaseline,
  polarity: 'higher_better' | 'lower_better' | 'neutral' = 'higher_better'
): BaselineDelta {
  const absoluteDelta = current - baseline.mean
  const percentDelta = safePercentChange(current, baseline.mean) ?? 0

  // Z-score (how many standard deviations from mean)
  const zScore = safeDivide(absoluteDelta, baseline.stdDev) ?? 0

  // Approximate percentile from z-score
  const percentileValue = normalCDF(zScore) * 100

  // Direction
  const direction: 'above' | 'below' | 'at' =
    Math.abs(zScore) < 0.1 ? 'at' :
    zScore > 0 ? 'above' : 'below'

  // Significance based on z-score
  const absZ = Math.abs(zScore)
  const significance: 'high' | 'medium' | 'low' | 'none' =
    absZ >= 2.0 ? 'high' :
    absZ >= 1.0 ? 'medium' :
    absZ >= 0.5 ? 'low' : 'none'

  // Generate description
  const description = generateDeltaDescription(zScore, percentDelta, polarity)

  return {
    current,
    baseline,
    absoluteDelta: round(absoluteDelta, 2),
    percentDelta: round(percentDelta, 1),
    zScore: round(zScore, 2),
    percentile: round(percentileValue, 0),
    direction,
    significance,
    description
  }
}

// Generate human-readable description
function generateDeltaDescription(
  zScore: number,
  percentDelta: number,
  polarity: 'higher_better' | 'lower_better' | 'neutral'
): string {
  const absZ = Math.abs(zScore)
  const absPercent = Math.abs(percentDelta)
  const isUp = zScore > 0
  const isGood = polarity === 'neutral' ? null : (polarity === 'higher_better' && isUp) || (polarity === 'lower_better' && !isUp)

  // Format z-score for display
  const zDisplay = `${isUp ? '+' : ''}${zScore.toFixed(1)}σ`

  if (absZ < 0.3) {
    return 'At baseline'
  } else if (isGood === null) {
    // Neutral polarity — describe direction without judgment
    const label = absZ < 1.0 ? 'slightly' : absZ < 2.0 ? 'notably' : 'significantly'
    return `${zDisplay} (${label} ${isUp ? 'above' : 'below'} baseline)`
  } else if (absZ < 1.0) {
    return `${zDisplay} ${isGood ? '(slightly better)' : '(slightly lower)'}`
  } else if (absZ < 2.0) {
    return `${zDisplay} ${isGood ? '(notably better)' : '(notably lower)'}`
  } else {
    return `${zDisplay} ${isGood ? '(significantly better)' : '(significantly different)'}`
  }
}

// Compute baselines for multiple metrics at once
export function computeAllBaselines(
  metricData: Map<string, DailyMetricValue[]>,
  windowDays: number = 28
): Map<string, MetricBaseline> {
  const baselines = new Map<string, MetricBaseline>()

  for (const [metricType, values] of metricData) {
    const baseline = computeBaseline(values, windowDays)
    if (baseline) {
      baseline.metricType = metricType
      baselines.set(metricType, baseline)
    }
  }

  return baselines
}

// Calculate trend momentum (is improvement accelerating or decelerating?)
export interface TrendMomentum {
  currentTrend: number      // Recent 7-day change
  previousTrend: number     // Prior 7-day change
  momentum: 'accelerating' | 'steady' | 'decelerating'
  description: string
}

export function calculateMomentum(
  values: DailyMetricValue[],
  polarity: 'higher_better' | 'lower_better' | 'neutral' = 'higher_better',
  metricType?: string
): TrendMomentum | null {
  if (values.length < 21) return null

  const sorted = [...values].sort((a, b) =>
    parseISO(a.date).getTime() - parseISO(b.date).getTime()
  )

  // Last 7 days
  const recent = sorted.slice(-7)
  const recentAvg = recent.reduce((s, v) => s + v.value, 0) / recent.length

  // Days 8-14
  const middle = sorted.slice(-14, -7)
  const middleAvg = middle.reduce((s, v) => s + v.value, 0) / middle.length

  // Days 15-21
  const older = sorted.slice(-21, -14)
  const olderAvg = older.reduce((s, v) => s + v.value, 0) / older.length

  let currentTrend = safePercentChange(recentAvg, middleAvg) ?? 0
  let previousTrend = safePercentChange(middleAvg, olderAvg) ?? 0

  // Validate change percents if metric type is provided
  if (metricType) {
    currentTrend = validateChangePercent(metricType as MetricType, currentTrend, 'weekly')
    previousTrend = validateChangePercent(metricType as MetricType, previousTrend, 'weekly')
  }

  const trendDiff = currentTrend - previousTrend

  // Determine momentum
  let momentum: 'accelerating' | 'steady' | 'decelerating'
  if (Math.abs(trendDiff) < 2) {
    momentum = 'steady'
  } else if (
    (polarity === 'higher_better' && trendDiff > 0) ||
    (polarity === 'lower_better' && trendDiff < 0)
  ) {
    momentum = 'accelerating'
  } else {
    momentum = 'decelerating'
  }

  const description = momentum === 'accelerating'
    ? 'Improvement is accelerating'
    : momentum === 'decelerating'
    ? 'Improvement is slowing'
    : 'Trend is steady'

  return {
    currentTrend: round(currentTrend, 1),
    previousTrend: round(previousTrend, 1),
    momentum,
    description
  }
}

// Calculate volatility (coefficient of variation)
export interface MetricVolatility {
  cv: number  // Coefficient of variation (stdDev / mean)
  level: 'very_stable' | 'stable' | 'moderate' | 'volatile' | 'very_volatile'
  description: string
}

export function calculateVolatility(baseline: MetricBaseline): MetricVolatility {
  const cvRaw = safeDivide(baseline.stdDev, Math.abs(baseline.mean))
  const cv = cvRaw !== null ? cvRaw * 100 : 0

  let level: MetricVolatility['level']
  let description: string

  if (cv < 5) {
    level = 'very_stable'
    description = 'Very consistent'
  } else if (cv < 10) {
    level = 'stable'
    description = 'Stable'
  } else if (cv < 20) {
    level = 'moderate'
    description = 'Moderate variation'
  } else if (cv < 35) {
    level = 'volatile'
    description = 'Variable'
  } else {
    level = 'very_volatile'
    description = 'Highly variable'
  }

  return { cv: round(cv, 1), level, description }
}

// Helper: Calculate percentile
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = (p / 100) * (sortedValues.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower)
}

// Helper: Standard normal CDF approximation
function normalCDF(z: number): number {
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911

  const sign = z < 0 ? -1 : 1
  z = Math.abs(z) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * z)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z)

  return 0.5 * (1.0 + sign * y)
}

// Helper: Round to decimal places
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// Note: clampPercent is imported from health-constants.ts

// ─── Signal Classification ────────────────────────────────────────────

export type SignalClass = 'noise' | 'blip' | 'short_term_change' | 'sustained_trend'

export interface ClassifiedSignal {
  metricType: string
  currentValue: number
  signalClass: SignalClass
  confidence: number
  timeframe: string               // "today", "3 days", "7+ days"
  narrative: string               // Human explanation
  baselineDelta: BaselineDelta
}

/**
 * Classify whether a metric's current deviation is noise, a blip,
 * a short-term change, or a sustained trend.
 */
export function classifySignal(
  metricType: string,
  recentValues: DailyMetricValue[],
  baseline: MetricBaseline,
  polarity: 'higher_better' | 'lower_better' | 'neutral' = 'higher_better'
): ClassifiedSignal | null {
  if (recentValues.length === 0) return null

  // Sort most recent first
  const sorted = [...recentValues].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const current = sorted[0]

  const delta = compareToBaseline(current.value, baseline, polarity)
  const absZ = Math.abs(delta.zScore)

  // Calculate volatility to determine noise threshold
  const volatility = calculateVolatility(baseline)
  const noiseThreshold = volatility.cv > 25 ? 0.8 : 0.5

  // Step 1: Check if within noise range
  if (absZ < noiseThreshold) {
    return {
      metricType,
      currentValue: current.value,
      signalClass: 'noise',
      confidence: 90,
      timeframe: 'today',
      narrative: 'Within your normal range.',
      baselineDelta: delta,
    }
  }

  // Step 2: Check consecutive days in same direction
  const direction = delta.zScore > 0 ? 'above' : 'below'
  let consecutiveDays = 0
  let sameDirIn7 = 0

  for (let i = 0; i < Math.min(sorted.length, 7); i++) {
    const dayDelta = compareToBaseline(sorted[i].value, baseline, polarity)
    const dayDir = dayDelta.zScore > 0 ? 'above' : 'below'
    const dayAbsZ = Math.abs(dayDelta.zScore)

    if (dayAbsZ >= noiseThreshold && dayDir === direction) {
      sameDirIn7++
      if (i === consecutiveDays) consecutiveDays++
    } else if (i === consecutiveDays) {
      // Break in consecutive streak
      break
    }
  }

  // Step 3: Classify
  if (sameDirIn7 >= 5) {
    const isGood = (polarity === 'higher_better' && direction === 'above') ||
                   (polarity === 'lower_better' && direction === 'below')
    return {
      metricType,
      currentValue: current.value,
      signalClass: 'sustained_trend',
      confidence: Math.min(95, 70 + sameDirIn7 * 3),
      timeframe: '7+ days',
      narrative: `Consistently ${isGood ? 'better' : 'worse'} than baseline for 7+ days. This looks like a real shift.`,
      baselineDelta: delta,
    }
  }

  if (consecutiveDays >= 2) {
    return {
      metricType,
      currentValue: current.value,
      signalClass: 'short_term_change',
      confidence: Math.min(80, 50 + consecutiveDays * 10),
      timeframe: `${consecutiveDays} days`,
      narrative: `Changed for ${consecutiveDays} consecutive days. Worth watching.`,
      baselineDelta: delta,
    }
  }

  // Only today deviates
  return {
    metricType,
    currentValue: current.value,
    signalClass: 'blip',
    confidence: 40,
    timeframe: 'today',
    narrative: 'One-day deviation. Likely normal variation.',
    baselineDelta: delta,
  }
}

// ─── Multi-Window Baselines ──────────────────────────────────────────

export interface MultiWindowBaseline {
  w7?: MetricBaseline
  w28?: MetricBaseline
  w90?: MetricBaseline
}

export function computeMultiWindowBaseline(
  values: DailyMetricValue[],
  endDate: Date = new Date()
): MultiWindowBaseline {
  return {
    w7: computeBaseline(values, 7, endDate, 3) ?? undefined,
    w28: computeBaseline(values, 28, endDate, 5) ?? undefined,
    w90: computeBaseline(values, 90, endDate, 10) ?? undefined,
  }
}

// ─── Weekly Pattern Detection ────────────────────────────────────────

export interface WeeklyPattern {
  metricType: string
  dayAverages: { day: number; dayName: string; avg: number; count: number }[]
  bestDay: { day: number; dayName: string; avg: number }
  worstDay: { day: number; dayName: string; avg: number }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function computeWeeklyPattern(
  values: DailyMetricValue[],
  minWeeks: number = 3
): WeeklyPattern | null {
  if (values.length < minWeeks * 7) return null

  // Group by day of week
  const buckets: { sum: number; count: number }[] = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }))

  for (const v of values) {
    const dow = parseISO(v.date).getDay()
    buckets[dow].sum += v.value
    buckets[dow].count++
  }

  const dayAverages = buckets
    .map((b, i) => ({
      day: i,
      dayName: DAY_NAMES[i],
      avg: b.count > 0 ? round(b.sum / b.count, 2) : 0,
      count: b.count,
    }))
    .filter(d => d.count >= minWeeks)

  if (dayAverages.length < 5) return null // Need most days represented

  const sorted = [...dayAverages].sort((a, b) => b.avg - a.avg)

  return {
    metricType: '', // Set by caller
    dayAverages,
    bestDay: { day: sorted[0].day, dayName: sorted[0].dayName, avg: sorted[0].avg },
    worstDay: { day: sorted[sorted.length - 1].day, dayName: sorted[sorted.length - 1].dayName, avg: sorted[sorted.length - 1].avg },
  }
}

// ─── Personal Zones (Percentile Bands) ───────────────────────────────

export interface PersonalZones {
  veryLow: number   // p10
  low: number        // p25
  normal: number     // p50 (median)
  high: number       // p75
  veryHigh: number   // p90
}

export function computePersonalZones(
  values: DailyMetricValue[],
  minDataPoints: number = 14
): PersonalZones | null {
  if (values.length < minDataPoints) return null

  const sorted = values.map(v => v.value).sort((a, b) => a - b)

  // Remove extreme outliers (beyond 3 IQR)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const clean = sorted.filter(v => v >= q1 - 3 * iqr && v <= q3 + 3 * iqr)

  if (clean.length < minDataPoints) return null

  return {
    veryLow: round(percentile(clean, 10), 2),
    low: round(percentile(clean, 25), 2),
    normal: round(percentile(clean, 50), 2),
    high: round(percentile(clean, 75), 2),
    veryHigh: round(percentile(clean, 90), 2),
  }
}

// Polarity map derived from the metric contract (single source of truth)
export const METRIC_POLARITY: Record<string, 'higher_better' | 'lower_better' | 'neutral'> = derivePolarityMap()
