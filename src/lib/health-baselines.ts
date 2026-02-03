// Baseline computation engine for health metrics
// Computes personal baselines with rolling windows and robust statistics

import { subDays, differenceInDays, parseISO, format } from 'date-fns'

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
  polarity: 'higher_better' | 'lower_better' = 'higher_better'
): BaselineDelta {
  const absoluteDelta = current - baseline.mean
  const percentDelta = baseline.mean !== 0
    ? (absoluteDelta / baseline.mean) * 100
    : 0

  // Z-score (how many standard deviations from mean)
  const zScore = baseline.stdDev !== 0
    ? absoluteDelta / baseline.stdDev
    : 0

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
  polarity: 'higher_better' | 'lower_better'
): string {
  const absZ = Math.abs(zScore)
  const absPercent = Math.abs(percentDelta)
  const isUp = zScore > 0
  const isGood = (polarity === 'higher_better' && isUp) || (polarity === 'lower_better' && !isUp)

  // Format z-score for display
  const zDisplay = `${isUp ? '+' : ''}${zScore.toFixed(1)}σ`

  if (absZ < 0.3) {
    return 'At baseline'
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
  polarity: 'higher_better' | 'lower_better' = 'higher_better'
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

  const currentTrend = ((recentAvg - middleAvg) / middleAvg) * 100
  const previousTrend = ((middleAvg - olderAvg) / olderAvg) * 100

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
  const cv = baseline.mean !== 0
    ? (baseline.stdDev / Math.abs(baseline.mean)) * 100
    : 0

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
  polarity: 'higher_better' | 'lower_better' = 'higher_better'
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

// Export metric polarity map
export const METRIC_POLARITY: Record<string, 'higher_better' | 'lower_better'> = {
  // Heart & Recovery
  hrv: 'higher_better',
  rhr: 'lower_better',
  // Sleep
  sleep_duration: 'higher_better',
  deep_sleep: 'higher_better',
  rem_sleep: 'higher_better',
  sleep_efficiency: 'higher_better',
  sleep_score: 'higher_better',
  readiness_score: 'higher_better',
  waso: 'lower_better',
  sleep_latency: 'lower_better',
  temp_deviation: 'lower_better',
  // Vitals
  respiratory_rate: 'lower_better',
  blood_oxygen: 'higher_better',
  body_temperature: 'lower_better',
  // Activity
  steps: 'higher_better',
  active_calories: 'higher_better',
  basal_calories: 'higher_better',
  exercise_minutes: 'higher_better',
  stand_hours: 'higher_better',
  walking_running_distance: 'higher_better',
  // Fitness
  vo2_max: 'higher_better',
  // Body Composition
  weight: 'lower_better',
  body_fat_percentage: 'lower_better',
  bmi: 'lower_better',
  lean_body_mass: 'higher_better',
  muscle_mass: 'higher_better',
  bone_mass: 'higher_better',
  body_water: 'higher_better',
}
