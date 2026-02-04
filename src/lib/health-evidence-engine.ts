/**
 * Premium Protocol Evidence Engine
 *
 * Provides statistically rigorous protocol effectiveness analysis with:
 * - Enhanced effect sizes with confidence intervals
 * - Welch's t-test for p-values
 * - Severity-weighted confound scoring
 * - Mechanism detection (which metrics move together)
 * - Robustness analysis (sensitivity testing)
 *
 * This is the crown jewel of health analytics - giving users genuine
 * scientific insight into whether their protocols are working.
 */

import { differenceInDays, format, subDays, startOfDay } from 'date-fns'
import { prisma } from './prisma'
import { METRIC_POLARITY } from './health-baselines'
import { MetricType, getMetricDisplayName } from './health-providers'

// ─── Types ───────────────────────────────────────────────────────────────────

export type EvidenceVerdict =
  | 'too_early'              // < 7 days
  | 'accumulating'           // 7-14 days, signal emerging
  | 'weak_positive'          // Small effect or low confidence
  | 'likely_positive'        // Consistent, medium+ effect
  | 'strong_positive'        // Large effect, high confidence
  | 'no_detectable_effect'   // Sufficient data, no change
  | 'possible_negative'      // Unexpected direction
  | 'confounded'             // > 40% confound days

export type RampPhase = 'loading' | 'building' | 'peak' | 'plateau'

export type MetricCategory = 'sleep' | 'recovery' | 'activity' | 'body_comp'

export interface EffectSizeResult {
  cohensD: number
  percentChange: number
  absoluteChange: number
  standardError: number
  confidenceInterval: { lower: number; upper: number }
  tValue: number | null
  pValue: number | null
  degreesOfFreedom: number | null
  powerEstimate: number
}

export interface EnhancedSignal {
  metricType: string
  metricName: string
  category: MetricCategory

  before: { mean: number; stdDev: number; n: number }
  after: { mean: number; stdDev: number; n: number }

  change: {
    absolute: number
    percent: number
    direction: 'up' | 'down' | 'stable'
  }

  effect: {
    cohensD: number
    magnitude: 'large' | 'medium' | 'small' | 'negligible'
    confidenceInterval: { lower: number; upper: number }
    pValue: number | null
    isSignificant: boolean
  }

  interpretation: {
    polarity: 'higher_better' | 'lower_better'
    isImprovement: boolean
    explanation: string
  }
}

export interface Mechanism {
  name: string
  signals: string[]
  confidence: 'high' | 'medium' | 'low'
  explanation: string
}

export interface ConfoundBreakdown {
  type: string
  days: number
  weight: number
}

export interface RobustnessScenario {
  scenario: string
  verdict: EvidenceVerdict
  verdictScore: number
}

export interface PremiumProtocolEvidence {
  protocolId: string
  protocolName: string
  protocolType: 'peptide' | 'supplement'
  peptideCategory?: string

  // Temporal
  startDate: string
  daysOnProtocol: number
  rampPhase: RampPhase
  rampExplanation: string
  expectedEffectWindow?: { minDays: number; maxDays: number }

  // Primary Verdict
  verdict: EvidenceVerdict
  verdictExplanation: string
  verdictScore: number

  // Effects Summary
  effects: {
    primary: EnhancedSignal | null
    supporting: EnhancedSignal[]
    adverse: EnhancedSignal[]
    nullFindings: string[]
    overallDirection: 'positive' | 'negative' | 'mixed' | 'neutral'
    mechanisms: Mechanism[]
  }

  // Confidence & Data Quality
  confidence: {
    level: 'high' | 'medium' | 'low'
    score: number
    reasons: string[]
    dataQuality: {
      completeness: number
      beforePoints: number
      afterPoints: number
      totalMetricsTested: number
      outlierRate: number
    }
  }

  // Statistical Details (optional, included when details=true)
  statistics?: MetricStatistics[]

  // Confounds
  confounds: {
    present: boolean
    totalDays: number
    weightedScore: number
    breakdown: ConfoundBreakdown[]
    impact: 'high' | 'medium' | 'low' | 'none'
    recommendation?: string
  }

  // Robustness (optional, included when robustness=true)
  robustness?: {
    isStable: boolean
    sensitivityAnalysis: RobustnessScenario[]
  }
}

export interface MetricStatistics {
  metricType: string
  metricName: string
  category: MetricCategory
  before: { mean: number; stdDev: number; n: number; values: number[] }
  after: { mean: number; stdDev: number; n: number; values: number[] }
  effectSize: EffectSizeResult
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Severity weights for confounding events */
const CONFOUND_WEIGHTS: Record<string, number> = {
  travel: 1.5,    // High - disrupts circadian rhythm
  illness: 2.0,   // Highest - systemic effects
  alcohol: 1.0,   // Medium - affects sleep/HRV
  stress: 0.5,    // Low - mental, delayed physical effect
}

/** Metric category mapping */
const METRIC_CATEGORIES: Record<string, MetricCategory> = {
  // Sleep
  sleep_duration: 'sleep',
  deep_sleep: 'sleep',
  rem_sleep: 'sleep',
  sleep_efficiency: 'sleep',
  sleep_score: 'sleep',
  waso: 'sleep',
  sleep_latency: 'sleep',
  readiness_score: 'sleep',
  // Recovery
  hrv: 'recovery',
  rhr: 'recovery',
  respiratory_rate: 'recovery',
  blood_oxygen: 'recovery',
  body_temperature: 'recovery',
  // Activity
  steps: 'activity',
  active_calories: 'activity',
  exercise_minutes: 'activity',
  walking_running_distance: 'activity',
  vo2_max: 'activity',
  stand_hours: 'activity',
  // Body Composition
  weight: 'body_comp',
  body_fat_percentage: 'body_comp',
  lean_body_mass: 'body_comp',
  muscle_mass: 'body_comp',
  bmi: 'body_comp',
  bone_mass: 'body_comp',
  body_water: 'body_comp',
}

/** Minimum data points required per metric type */
const MIN_DATA_POINTS: Record<string, number> = {
  // Body comp metrics update less frequently
  weight: 3,
  body_fat_percentage: 3,
  lean_body_mass: 3,
  muscle_mass: 3,
  bmi: 3,
  bone_mass: 3,
  body_water: 3,
  vo2_max: 3,
  // Daily metrics need more points for statistical power
  default: 5,
}

/** Mechanism detection patterns */
const MECHANISM_PATTERNS = [
  {
    name: 'Parasympathetic Recovery',
    requires: [{ metric: 'hrv', direction: 'up' as const }],
    supports: [
      { metric: 'rhr', direction: 'down' as const },
      { metric: 'sleep_duration', direction: 'up' as const },
      { metric: 'deep_sleep', direction: 'up' as const },
    ],
    explanation: 'Improved autonomic balance through enhanced vagal tone',
  },
  {
    name: 'Sleep Architecture Improvement',
    requires: [{ metric: 'sleep_score', direction: 'up' as const }],
    supports: [
      { metric: 'deep_sleep', direction: 'up' as const },
      { metric: 'rem_sleep', direction: 'up' as const },
      { metric: 'sleep_efficiency', direction: 'up' as const },
      { metric: 'waso', direction: 'down' as const },
    ],
    explanation: 'Enhanced sleep quality through improved sleep stage distribution',
  },
  {
    name: 'Body Recomposition',
    requires: [
      { metric: 'body_fat_percentage', direction: 'down' as const },
      { metric: 'lean_body_mass', direction: 'up' as const },
    ],
    supports: [{ metric: 'weight', direction: 'stable' as const }],
    explanation: 'Simultaneous fat loss and muscle gain',
  },
  {
    name: 'Fat Loss Phase',
    requires: [{ metric: 'body_fat_percentage', direction: 'down' as const }],
    supports: [
      { metric: 'weight', direction: 'down' as const },
      { metric: 'active_calories', direction: 'up' as const },
    ],
    explanation: 'Active fat reduction with maintained or increased activity',
  },
  {
    name: 'Recovery Enhancement',
    requires: [{ metric: 'readiness_score', direction: 'up' as const }],
    supports: [
      { metric: 'hrv', direction: 'up' as const },
      { metric: 'rhr', direction: 'down' as const },
      { metric: 'sleep_score', direction: 'up' as const },
    ],
    explanation: 'Improved overall recovery capacity',
  },
  {
    name: 'Cardiovascular Improvement',
    requires: [{ metric: 'vo2_max', direction: 'up' as const }],
    supports: [
      { metric: 'rhr', direction: 'down' as const },
      { metric: 'active_calories', direction: 'up' as const },
      { metric: 'exercise_minutes', direction: 'up' as const },
    ],
    explanation: 'Enhanced aerobic capacity and cardiovascular efficiency',
  },
  {
    name: 'Deep Sleep Enhancement',
    requires: [{ metric: 'deep_sleep', direction: 'up' as const }],
    supports: [
      { metric: 'hrv', direction: 'up' as const },
      { metric: 'sleep_score', direction: 'up' as const },
      { metric: 'readiness_score', direction: 'up' as const },
    ],
    explanation: 'Increased restorative deep sleep supporting physical recovery',
  },
  {
    name: 'Muscle Building Phase',
    requires: [{ metric: 'muscle_mass', direction: 'up' as const }],
    supports: [
      { metric: 'lean_body_mass', direction: 'up' as const },
      { metric: 'weight', direction: 'up' as const },
      { metric: 'exercise_minutes', direction: 'up' as const },
    ],
    explanation: 'Active muscle accretion with supporting training volume',
  },
]

/** Ramp phase explanations */
const RAMP_EXPLANATIONS: Record<RampPhase, string> = {
  loading: 'Early days - effects typically not measurable yet.',
  building: 'Building phase - signals may start to emerge.',
  peak: 'Peak response window - best time to evaluate effects.',
  plateau: 'Plateau phase - effects should be well-established if present.',
}

// ─── Statistical Helpers ─────────────────────────────────────────────────────

/**
 * Welch's t-test for two samples with unequal variances
 */
function welchTTest(before: number[], after: number[]): {
  tValue: number
  pValue: number
  df: number
} {
  const n1 = before.length
  const n2 = after.length

  if (n1 < 2 || n2 < 2) {
    return { tValue: 0, pValue: 1, df: 0 }
  }

  const mean1 = before.reduce((a, b) => a + b, 0) / n1
  const mean2 = after.reduce((a, b) => a + b, 0) / n2

  const var1 = before.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / (n1 - 1)
  const var2 = after.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / (n2 - 1)

  // Handle zero variance case
  if (var1 === 0 && var2 === 0) {
    return { tValue: 0, pValue: 1, df: n1 + n2 - 2 }
  }

  const se = Math.sqrt(var1 / n1 + var2 / n2)
  if (se === 0) {
    return { tValue: 0, pValue: 1, df: n1 + n2 - 2 }
  }

  const tValue = (mean2 - mean1) / se

  // Welch-Satterthwaite degrees of freedom
  const num = Math.pow(var1 / n1 + var2 / n2, 2)
  const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1)
  const df = denom > 0 ? num / denom : n1 + n2 - 2

  // Calculate p-value (two-tailed)
  const pValue = 2 * (1 - tCDF(Math.abs(tValue), df))

  return { tValue, pValue, df }
}

/**
 * T-distribution CDF approximation using the regularized incomplete beta function
 * For df > 30, we use normal approximation
 */
function tCDF(t: number, df: number): number {
  if (df <= 0) return 0.5

  // For large df, use normal approximation
  if (df > 30) {
    return normalCDF(t)
  }

  // Use the relationship between t-distribution and regularized incomplete beta
  const x = df / (df + t * t)
  const a = df / 2
  const b = 0.5

  // Regularized incomplete beta function approximation
  const beta = incompleteBeta(x, a, b)

  if (t >= 0) {
    return 1 - 0.5 * beta
  } else {
    return 0.5 * beta
  }
}

/**
 * Regularized incomplete beta function approximation
 * Uses continued fraction expansion
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0
  if (x === 1) return 1

  // Use the continued fraction expansion for better convergence
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  )

  // Use continued fraction
  const eps = 1e-10
  const maxIter = 100

  let am = 1
  let bm = 1
  let az = 1

  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let bz = 1 - qab * x / qap

  for (let m = 1; m <= maxIter; m++) {
    const em = m
    const tem = em + em
    let d = em * (b - em) * x / ((qam + tem) * (a + tem))
    const ap = az + d * am
    const bp = bz + d * bm
    d = -(a + em) * (qab + em) * x / ((a + tem) * (qap + tem))
    const app = ap + d * az
    const bpp = bp + d * bz
    const aold = az
    am = ap / bpp
    bm = bp / bpp
    az = app / bpp
    bz = 1
    if (Math.abs(az - aold) < eps * Math.abs(az)) {
      return bt * az / a
    }
  }

  return bt * az / a
}

/**
 * Log gamma function approximation (Stirling's approximation with correction terms)
 */
function lgamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ]

  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015

  for (let j = 0; j < 6; j++) {
    ser += cof[j] / ++y
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x)
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = z < 0 ? -1 : 1
  const absZ = Math.abs(z) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * absZ)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ)

  return 0.5 * (1.0 + sign * y)
}

/**
 * Compute enhanced effect size with confidence intervals and significance testing
 */
function computeEffectSize(before: number[], after: number[]): EffectSizeResult {
  const n1 = before.length
  const n2 = after.length

  if (n1 === 0 || n2 === 0) {
    return {
      cohensD: 0,
      percentChange: 0,
      absoluteChange: 0,
      standardError: 0,
      confidenceInterval: { lower: 0, upper: 0 },
      tValue: null,
      pValue: null,
      degreesOfFreedom: null,
      powerEstimate: 0,
    }
  }

  const mean1 = before.reduce((a, b) => a + b, 0) / n1
  const mean2 = after.reduce((a, b) => a + b, 0) / n2

  const var1 = n1 > 1 ? before.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / (n1 - 1) : 0
  const var2 = n2 > 1 ? after.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / (n2 - 1) : 0

  // Pooled standard deviation for Cohen's d
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
  const pooledStd = Math.sqrt(pooledVar)

  const absoluteChange = mean2 - mean1
  const cohensD = pooledStd > 0 ? absoluteChange / pooledStd : 0
  const percentChange = mean1 !== 0 ? (absoluteChange / Math.abs(mean1)) * 100 : 0

  // Standard error of Cohen's d
  const seCohensD = Math.sqrt((n1 + n2) / (n1 * n2) + (cohensD * cohensD) / (2 * (n1 + n2)))

  // 95% confidence interval for Cohen's d
  const z95 = 1.96
  const ciLower = cohensD - z95 * seCohensD
  const ciUpper = cohensD + z95 * seCohensD

  // T-test (only if sufficient sample sizes)
  let tValue: number | null = null
  let pValue: number | null = null
  let df: number | null = null

  if (n1 >= 5 && n2 >= 5) {
    const tTest = welchTTest(before, after)
    tValue = round(tTest.tValue, 3)
    pValue = round(tTest.pValue, 4)
    df = round(tTest.df, 1)
  }

  // Post-hoc power estimate (simplified)
  // Using approximation: power = P(Z > z_alpha - d*sqrt(n/2))
  // where d is Cohen's d and n is harmonic mean of sample sizes
  const harmonicN = (2 * n1 * n2) / (n1 + n2)
  const nonCentrality = Math.abs(cohensD) * Math.sqrt(harmonicN / 2)
  const zAlpha = 1.96 // two-tailed alpha = 0.05
  const powerEstimate = 1 - normalCDF(zAlpha - nonCentrality)

  return {
    cohensD: round(cohensD, 3),
    percentChange: round(percentChange, 2),
    absoluteChange: round(absoluteChange, 3),
    standardError: round(seCohensD, 3),
    confidenceInterval: { lower: round(ciLower, 3), upper: round(ciUpper, 3) },
    tValue,
    pValue,
    degreesOfFreedom: df,
    powerEstimate: round(Math.max(0, Math.min(1, powerEstimate)), 2),
  }
}

/**
 * Calculate the effect magnitude category
 */
function getEffectMagnitude(cohensD: number): 'large' | 'medium' | 'small' | 'negligible' {
  const absD = Math.abs(cohensD)
  if (absD >= 0.8) return 'large'
  if (absD >= 0.5) return 'medium'
  if (absD >= 0.2) return 'small'
  return 'negligible'
}

/**
 * Detect outliers using IQR method
 */
function detectOutliers(values: number[]): { clean: number[]; outlierCount: number } {
  if (values.length < 4) return { clean: values, outlierCount: 0 }

  const sorted = [...values].sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr

  const clean = values.filter(v => v >= lowerBound && v <= upperBound)
  return { clean, outlierCount: values.length - clean.length }
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/**
 * Round to specified decimal places
 */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

interface MetricData {
  date: Date
  value: number
}

interface ProtocolWithDetails {
  id: string
  startDate: Date
  endDate: Date | null
  status: string
  peptide: {
    name: string
    type: string
    category: string | null
  }
}

interface ContextEvent {
  date: Date
  type: string
}

/**
 * Fetch protocols for a user
 */
async function fetchProtocols(
  userId: string,
  protocolId?: string
): Promise<ProtocolWithDetails[]> {
  const where: { userId: string; id?: string; status?: string } = { userId }

  if (protocolId) {
    where.id = protocolId
  } else {
    where.status = 'active'
  }

  const protocols = await prisma.protocol.findMany({
    where,
    include: {
      peptide: {
        select: {
          name: true,
          type: true,
          category: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  return protocols
}

/**
 * Fetch health metrics for a user within a date range
 */
async function fetchMetrics(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Map<string, MetricData[]>> {
  const metrics = await prisma.healthMetric.findMany({
    where: {
      userId,
      recordedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      metricType: true,
      value: true,
      recordedAt: true,
    },
    orderBy: { recordedAt: 'asc' },
  })

  const byType = new Map<string, MetricData[]>()
  for (const m of metrics) {
    if (!byType.has(m.metricType)) {
      byType.set(m.metricType, [])
    }
    byType.get(m.metricType)!.push({
      date: m.recordedAt,
      value: m.value,
    })
  }

  return byType
}

/**
 * Fetch context events (confounds) from dose logs
 * We'll simulate confounds based on notes containing keywords
 * In a real app, these would be stored in a dedicated table
 */
async function fetchContextEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ContextEvent[]> {
  // For now, we don't have a dedicated context events table
  // Return empty array - this could be expanded to parse dose log notes
  // or add a ContextEvent model in the future
  return []
}

// ─── Mechanism Detection ─────────────────────────────────────────────────────

/**
 * Detect mechanisms based on observed signals
 */
function detectMechanisms(signals: EnhancedSignal[]): Mechanism[] {
  const detected: Mechanism[] = []
  const signalMap = new Map<string, 'up' | 'down' | 'stable'>()

  // Build signal direction map
  for (const signal of signals) {
    if (signal.effect.magnitude !== 'negligible') {
      signalMap.set(signal.metricType, signal.change.direction)
    }
  }

  // Check each mechanism pattern
  for (const pattern of MECHANISM_PATTERNS) {
    // Check required signals
    const requiredMet = pattern.requires.every(req => {
      const actual = signalMap.get(req.metric)
      return actual === req.direction
    })

    if (!requiredMet) continue

    // Count supporting signals
    let supportCount = 0
    const matchedSignals: string[] = pattern.requires.map(r => r.metric)

    for (const support of pattern.supports) {
      const actual = signalMap.get(support.metric)
      if (actual === support.direction) {
        supportCount++
        matchedSignals.push(support.metric)
      }
    }

    // Determine confidence based on support count
    let confidence: 'high' | 'medium' | 'low'
    if (supportCount >= 2) {
      confidence = 'high'
    } else if (supportCount >= 1) {
      confidence = 'medium'
    } else {
      confidence = 'low'
    }

    detected.push({
      name: pattern.name,
      signals: matchedSignals,
      confidence,
      explanation: pattern.explanation,
    })
  }

  return detected
}

// ─── Evidence Computation ────────────────────────────────────────────────────

/**
 * Compute evidence for a single protocol
 */
async function computeSingleProtocolEvidence(
  protocol: ProtocolWithDetails,
  metrics: Map<string, MetricData[]>,
  contextEvents: ContextEvent[],
  options: {
    includeNullFindings: boolean
    includeRobustness: boolean
  }
): Promise<PremiumProtocolEvidence> {
  const today = new Date()
  const startDate = protocol.startDate
  const daysOnProtocol = differenceInDays(today, startDate)

  // Determine ramp phase
  const rampPhase: RampPhase =
    daysOnProtocol <= 7 ? 'loading' :
    daysOnProtocol <= 21 ? 'building' :
    daysOnProtocol <= 60 ? 'peak' : 'plateau'

  // Calculate confound impact
  const confoundAnalysis = analyzeConfounds(contextEvents, startDate, daysOnProtocol)

  // Early return for too_early
  if (daysOnProtocol < 7) {
    return createEarlyEvidence(protocol, daysOnProtocol, rampPhase, confoundAnalysis)
  }

  // Early return for confounded
  if (confoundAnalysis.impact === 'high') {
    return createConfoundedEvidence(protocol, daysOnProtocol, rampPhase, confoundAnalysis)
  }

  // Compute signals for all metrics
  const { signals, statistics, nullFindings, dataQuality } = computeAllSignals(
    metrics,
    startDate,
    options.includeNullFindings
  )

  // Categorize signals
  const positiveSignals = signals.filter(s => s.interpretation.isImprovement && s.effect.magnitude !== 'negligible')
  const adverseSignals = signals.filter(s => !s.interpretation.isImprovement && s.effect.magnitude !== 'negligible')

  // Primary signal is the strongest positive effect
  const primarySignal = positiveSignals.length > 0
    ? positiveSignals.reduce((best, s) =>
        Math.abs(s.effect.cohensD) > Math.abs(best.effect.cohensD) ? s : best
      )
    : null

  // Detect mechanisms
  const mechanisms = detectMechanisms(signals)

  // Compute confidence
  const confidence = computeConfidence(
    daysOnProtocol,
    confoundAnalysis,
    signals,
    dataQuality
  )

  // Determine verdict
  const { verdict, verdictScore, verdictExplanation } = determineVerdict(
    daysOnProtocol,
    rampPhase,
    positiveSignals,
    adverseSignals,
    confidence,
    protocol.peptide.name
  )

  // Determine overall direction
  const overallDirection = determineOverallDirection(positiveSignals, adverseSignals)

  // Robustness analysis
  let robustness: PremiumProtocolEvidence['robustness'] | undefined
  if (options.includeRobustness) {
    robustness = analyzeRobustness(
      metrics,
      startDate,
      daysOnProtocol,
      confoundAnalysis,
      signals
    )
  }

  return {
    protocolId: protocol.id,
    protocolName: protocol.peptide.name,
    protocolType: protocol.peptide.type as 'peptide' | 'supplement',
    peptideCategory: protocol.peptide.category || undefined,

    startDate: format(startDate, 'yyyy-MM-dd'),
    daysOnProtocol,
    rampPhase,
    rampExplanation: RAMP_EXPLANATIONS[rampPhase],

    verdict,
    verdictExplanation,
    verdictScore,

    effects: {
      primary: primarySignal,
      supporting: positiveSignals.filter(s => s !== primarySignal),
      adverse: adverseSignals,
      nullFindings: options.includeNullFindings ? nullFindings : [],
      overallDirection,
      mechanisms,
    },

    confidence: {
      level: confidence.level,
      score: confidence.score,
      reasons: confidence.reasons,
      dataQuality,
    },

    statistics: options.includeNullFindings ? statistics : undefined,

    confounds: confoundAnalysis,

    robustness,
  }
}

/**
 * Analyze confounding events
 */
function analyzeConfounds(
  events: ContextEvent[],
  protocolStart: Date,
  daysOnProtocol: number
): PremiumProtocolEvidence['confounds'] {
  const breakdown: ConfoundBreakdown[] = []
  const eventDates = new Set<string>()

  for (const event of events) {
    if (event.date >= protocolStart) {
      const dateKey = format(event.date, 'yyyy-MM-dd')
      if (!eventDates.has(dateKey)) {
        eventDates.add(dateKey)
        const weight = CONFOUND_WEIGHTS[event.type] || 0.5

        const existing = breakdown.find(b => b.type === event.type)
        if (existing) {
          existing.days++
        } else {
          breakdown.push({ type: event.type, days: 1, weight })
        }
      }
    }
  }

  const totalDays = eventDates.size
  const weightedScore = breakdown.reduce((sum, b) => sum + b.days * b.weight, 0)

  // Normalize weighted score to 0-100 scale
  const maxPossibleScore = daysOnProtocol * 2 // illness every day
  const normalizedScore = maxPossibleScore > 0
    ? (weightedScore / maxPossibleScore) * 100
    : 0

  // Determine impact level
  let impact: 'high' | 'medium' | 'low' | 'none'
  let recommendation: string | undefined

  const confoundRatio = daysOnProtocol > 0 ? totalDays / daysOnProtocol : 0

  if (confoundRatio > 0.4 || normalizedScore > 50) {
    impact = 'high'
    recommendation = 'Too many confounding events to reliably attribute changes. Consider restarting analysis after a cleaner period.'
  } else if (confoundRatio > 0.2 || normalizedScore > 25) {
    impact = 'medium'
    recommendation = 'Some confounding events present. Results should be interpreted with caution.'
  } else if (totalDays > 0) {
    impact = 'low'
  } else {
    impact = 'none'
  }

  return {
    present: totalDays > 0,
    totalDays,
    weightedScore: round(normalizedScore, 1),
    breakdown,
    impact,
    recommendation,
  }
}

/**
 * Compute signals for all tracked metrics
 */
function computeAllSignals(
  metrics: Map<string, MetricData[]>,
  protocolStart: Date,
  includeNullFindings: boolean
): {
  signals: EnhancedSignal[]
  statistics: MetricStatistics[]
  nullFindings: string[]
  dataQuality: PremiumProtocolEvidence['confidence']['dataQuality']
} {
  const signals: EnhancedSignal[] = []
  const statistics: MetricStatistics[] = []
  const nullFindings: string[] = []

  let totalMetricsTested = 0
  let beforePointsTotal = 0
  let afterPointsTotal = 0
  let totalOutliers = 0
  let totalPoints = 0

  const keyMetrics = [
    'hrv', 'rhr', 'deep_sleep', 'rem_sleep', 'sleep_duration', 'sleep_efficiency',
    'sleep_score', 'readiness_score', 'waso', 'sleep_latency',
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi',
    'vo2_max', 'steps', 'active_calories', 'exercise_minutes',
    'respiratory_rate', 'blood_oxygen',
  ]

  for (const metricType of keyMetrics) {
    const data = metrics.get(metricType) || []
    const minPoints = MIN_DATA_POINTS[metricType] || MIN_DATA_POINTS.default

    const beforeData = data.filter(d => d.date < protocolStart)
    const afterData = data.filter(d => d.date >= protocolStart)

    if (beforeData.length < minPoints || afterData.length < minPoints) {
      continue
    }

    totalMetricsTested++

    const beforeValues = beforeData.map(d => d.value)
    const afterValues = afterData.map(d => d.value)

    // Detect outliers
    const beforeClean = detectOutliers(beforeValues)
    const afterClean = detectOutliers(afterValues)

    totalOutliers += beforeClean.outlierCount + afterClean.outlierCount
    totalPoints += beforeValues.length + afterValues.length
    beforePointsTotal += beforeValues.length
    afterPointsTotal += afterValues.length

    // Use cleaned values for effect calculation
    const effectSize = computeEffectSize(beforeClean.clean, afterClean.clean)
    const magnitude = getEffectMagnitude(effectSize.cohensD)

    // Calculate basic stats
    const beforeMean = beforeClean.clean.reduce((a, b) => a + b, 0) / beforeClean.clean.length
    const afterMean = afterClean.clean.reduce((a, b) => a + b, 0) / afterClean.clean.length
    const beforeStdDev = Math.sqrt(
      beforeClean.clean.reduce((sum, v) => sum + Math.pow(v - beforeMean, 2), 0) / beforeClean.clean.length
    )
    const afterStdDev = Math.sqrt(
      afterClean.clean.reduce((sum, v) => sum + Math.pow(v - afterMean, 2), 0) / afterClean.clean.length
    )

    // Store statistics
    statistics.push({
      metricType,
      metricName: getMetricDisplayName(metricType as MetricType),
      category: METRIC_CATEGORIES[metricType] || 'recovery',
      before: {
        mean: round(beforeMean, 2),
        stdDev: round(beforeStdDev, 2),
        n: beforeClean.clean.length,
        values: beforeValues,
      },
      after: {
        mean: round(afterMean, 2),
        stdDev: round(afterStdDev, 2),
        n: afterClean.clean.length,
        values: afterValues,
      },
      effectSize,
    })

    // Determine if this is a signal or null finding
    if (magnitude === 'negligible') {
      if (includeNullFindings) {
        nullFindings.push(getMetricDisplayName(metricType as MetricType))
      }
      continue
    }

    // Determine direction and interpretation
    const absoluteChange = afterMean - beforeMean
    const percentChange = beforeMean !== 0 ? (absoluteChange / Math.abs(beforeMean)) * 100 : 0
    const direction: 'up' | 'down' | 'stable' =
      Math.abs(percentChange) < 2 ? 'stable' :
      absoluteChange > 0 ? 'up' : 'down'

    const polarity = (METRIC_POLARITY[metricType] || 'higher_better') as 'higher_better' | 'lower_better'
    const isImprovement =
      (polarity === 'higher_better' && direction === 'up') ||
      (polarity === 'lower_better' && direction === 'down')

    const explanation = generateInterpretationExplanation(
      metricType,
      direction,
      magnitude,
      isImprovement,
      effectSize.percentChange
    )

    signals.push({
      metricType,
      metricName: getMetricDisplayName(metricType as MetricType),
      category: METRIC_CATEGORIES[metricType] || 'recovery',
      before: {
        mean: round(beforeMean, 2),
        stdDev: round(beforeStdDev, 2),
        n: beforeClean.clean.length,
      },
      after: {
        mean: round(afterMean, 2),
        stdDev: round(afterStdDev, 2),
        n: afterClean.clean.length,
      },
      change: {
        absolute: round(absoluteChange, 2),
        percent: round(percentChange, 1),
        direction,
      },
      effect: {
        cohensD: effectSize.cohensD,
        magnitude,
        confidenceInterval: effectSize.confidenceInterval,
        pValue: effectSize.pValue,
        isSignificant: effectSize.pValue !== null && effectSize.pValue < 0.05,
      },
      interpretation: {
        polarity,
        isImprovement,
        explanation,
      },
    })
  }

  // Sort signals by effect size magnitude
  signals.sort((a, b) => Math.abs(b.effect.cohensD) - Math.abs(a.effect.cohensD))

  const outlierRate = totalPoints > 0 ? totalOutliers / totalPoints : 0

  return {
    signals,
    statistics,
    nullFindings,
    dataQuality: {
      completeness: totalMetricsTested > 0 ? (totalMetricsTested / keyMetrics.length) * 100 : 0,
      beforePoints: beforePointsTotal,
      afterPoints: afterPointsTotal,
      totalMetricsTested,
      outlierRate: round(outlierRate * 100, 1),
    },
  }
}

/**
 * Generate interpretation explanation for a signal
 */
function generateInterpretationExplanation(
  metricType: string,
  direction: 'up' | 'down' | 'stable',
  magnitude: 'large' | 'medium' | 'small' | 'negligible',
  isImprovement: boolean,
  percentChange: number
): string {
  const metricName = getMetricDisplayName(metricType as MetricType)
  const dirWord = direction === 'up' ? 'increased' : direction === 'down' ? 'decreased' : 'stable'
  const magnitudeWord = magnitude === 'large' ? 'substantially' : magnitude === 'medium' ? 'moderately' : 'slightly'
  const changeStr = `${Math.abs(percentChange).toFixed(0)}%`

  if (isImprovement) {
    return `${metricName} ${magnitudeWord} improved (${dirWord} ${changeStr}), indicating a positive response.`
  } else {
    return `${metricName} ${magnitudeWord} ${dirWord} (${changeStr}), which may warrant attention.`
  }
}

/**
 * Compute confidence level
 */
function computeConfidence(
  daysOnProtocol: number,
  confounds: PremiumProtocolEvidence['confounds'],
  signals: EnhancedSignal[],
  dataQuality: PremiumProtocolEvidence['confidence']['dataQuality']
): { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 40 // Base score

  // Time contribution (0-25 points)
  if (daysOnProtocol >= 30) {
    score += 25
    reasons.push(`Strong time window (${daysOnProtocol} days)`)
  } else if (daysOnProtocol >= 21) {
    score += 20
    reasons.push(`Good time window (${daysOnProtocol} days)`)
  } else if (daysOnProtocol >= 14) {
    score += 15
    reasons.push(`Adequate time window (${daysOnProtocol} days)`)
  } else {
    score += 5
    reasons.push(`Limited time window (${daysOnProtocol} days)`)
  }

  // Confound penalty (-15 to +15 points)
  if (confounds.impact === 'none') {
    score += 15
    reasons.push('No confounding events')
  } else if (confounds.impact === 'low') {
    score += 5
    reasons.push(`Minor confounds (${confounds.totalDays} days)`)
  } else if (confounds.impact === 'medium') {
    score -= 5
    reasons.push(`Notable confounds (${confounds.totalDays} days)`)
  } else {
    score -= 15
    reasons.push(`High confound impact (${confounds.totalDays} days)`)
  }

  // Signal strength (0-15 points)
  const significantSignals = signals.filter(s => s.effect.isSignificant)
  const strongSignals = signals.filter(s => s.effect.magnitude === 'large' || s.effect.magnitude === 'medium')

  if (significantSignals.length >= 2) {
    score += 15
    reasons.push(`${significantSignals.length} statistically significant effects`)
  } else if (strongSignals.length >= 2) {
    score += 10
    reasons.push(`${strongSignals.length} metrics with medium+ effect size`)
  } else if (strongSignals.length === 1) {
    score += 5
    reasons.push('1 metric with medium+ effect size')
  }

  // Data quality (0-10 points)
  if (dataQuality.completeness >= 80) {
    score += 10
    reasons.push('High data completeness')
  } else if (dataQuality.completeness >= 50) {
    score += 5
    reasons.push('Moderate data completeness')
  }

  // Outlier penalty
  if (dataQuality.outlierRate > 10) {
    score -= 5
    reasons.push(`High outlier rate (${dataQuality.outlierRate}%)`)
  }

  score = Math.max(20, Math.min(95, score))

  const level: 'high' | 'medium' | 'low' =
    score >= 70 ? 'high' :
    score >= 45 ? 'medium' : 'low'

  return { level, score, reasons }
}

/**
 * Determine the evidence verdict
 */
function determineVerdict(
  daysOnProtocol: number,
  rampPhase: RampPhase,
  positiveSignals: EnhancedSignal[],
  adverseSignals: EnhancedSignal[],
  confidence: { level: 'high' | 'medium' | 'low'; score: number },
  protocolName: string
): { verdict: EvidenceVerdict; verdictScore: number; verdictExplanation: string } {
  // Accumulating: 7-14 days and not high confidence
  if (daysOnProtocol < 14 && confidence.level !== 'high') {
    if (positiveSignals.length > 0) {
      return {
        verdict: 'accumulating',
        verdictScore: 35,
        verdictExplanation: `Early signals emerging for ${protocolName}. ${positiveSignals[0].metricName} showing ${positiveSignals[0].change.percent > 0 ? '+' : ''}${positiveSignals[0].change.percent.toFixed(0)}% change. Need more time to confirm.`,
      }
    }
    return {
      verdict: 'accumulating',
      verdictScore: 25,
      verdictExplanation: `Data accumulating for ${protocolName}. No clear signal yet - check back in a week.`,
    }
  }

  // Possible negative: more adverse than positive with meaningful effects
  if (adverseSignals.length > positiveSignals.length &&
      adverseSignals.some(s => s.effect.magnitude === 'large' || s.effect.magnitude === 'medium')) {
    const topAdverse = adverseSignals[0]
    return {
      verdict: 'possible_negative',
      verdictScore: 30,
      verdictExplanation: `Some metrics moved unfavorably since starting ${protocolName}. ${topAdverse.metricName} ${topAdverse.change.direction === 'up' ? 'increased' : 'decreased'} ${Math.abs(topAdverse.change.percent).toFixed(0)}%. Consider reviewing dosing or timing.`,
    }
  }

  // No detectable effect
  if (positiveSignals.length === 0 && daysOnProtocol >= 14) {
    return {
      verdict: 'no_detectable_effect',
      verdictScore: 45,
      verdictExplanation: `No meaningful changes detected since starting ${protocolName}. Metrics are within normal variation.`,
    }
  }

  // Positive verdicts
  if (positiveSignals.length > 0) {
    const topSignal = positiveSignals[0]
    const hasLargeEffect = positiveSignals.some(s => s.effect.magnitude === 'large')
    const hasMediumEffect = positiveSignals.some(s => s.effect.magnitude === 'medium')
    const hasStatSig = positiveSignals.some(s => s.effect.isSignificant)

    if (hasLargeEffect && (confidence.level === 'high' || hasStatSig)) {
      return {
        verdict: 'strong_positive',
        verdictScore: 85,
        verdictExplanation: `Strong evidence of benefit from ${protocolName}. ${topSignal.metricName} improved ${Math.abs(topSignal.change.percent).toFixed(0)}% with ${topSignal.effect.magnitude} effect size (d=${topSignal.effect.cohensD.toFixed(2)}).${hasStatSig ? ' Statistically significant.' : ''}`,
      }
    }

    if (hasMediumEffect || (hasLargeEffect && confidence.level !== 'low')) {
      return {
        verdict: 'likely_positive',
        verdictScore: 65,
        verdictExplanation: `${topSignal.metricName} improved ${Math.abs(topSignal.change.percent).toFixed(0)}% with ${topSignal.effect.magnitude} effect size. ${positiveSignals.length > 1 ? `${positiveSignals.length} metrics responding positively.` : ''}`,
      }
    }

    return {
      verdict: 'weak_positive',
      verdictScore: 50,
      verdictExplanation: `Small positive effects detected: ${positiveSignals.slice(0, 2).map(s => `${s.metricName} ${s.change.percent > 0 ? '+' : ''}${s.change.percent.toFixed(0)}%`).join(', ')}. Effect sizes are small.`,
    }
  }

  // Default fallback
  if (daysOnProtocol < 21) {
    return {
      verdict: 'accumulating',
      verdictScore: 30,
      verdictExplanation: `Still gathering data for ${protocolName}. Check back after 21 days for more reliable results.`,
    }
  }

  return {
    verdict: 'no_detectable_effect',
    verdictScore: 45,
    verdictExplanation: `No clear effects detected from ${protocolName} after ${daysOnProtocol} days.`,
  }
}

/**
 * Determine overall direction
 */
function determineOverallDirection(
  positive: EnhancedSignal[],
  adverse: EnhancedSignal[]
): 'positive' | 'negative' | 'mixed' | 'neutral' {
  if (positive.length === 0 && adverse.length === 0) return 'neutral'
  if (positive.length > 0 && adverse.length === 0) return 'positive'
  if (adverse.length > 0 && positive.length === 0) return 'negative'
  return 'mixed'
}

/**
 * Analyze robustness through sensitivity analysis
 */
function analyzeRobustness(
  metrics: Map<string, MetricData[]>,
  protocolStart: Date,
  daysOnProtocol: number,
  confounds: PremiumProtocolEvidence['confounds'],
  baseSignals: EnhancedSignal[]
): PremiumProtocolEvidence['robustness'] {
  const scenarios: RobustnessScenario[] = []

  // Base case
  const basePositive = baseSignals.filter(s => s.interpretation.isImprovement && s.effect.magnitude !== 'negligible')
  const baseAdverse = baseSignals.filter(s => !s.interpretation.isImprovement && s.effect.magnitude !== 'negligible')
  const baseVerdict = determineVerdictFromSignals(basePositive, baseAdverse, daysOnProtocol)

  scenarios.push({
    scenario: 'Base analysis',
    verdict: baseVerdict.verdict,
    verdictScore: baseVerdict.verdictScore,
  })

  // Conservative window (only recent 50% of data)
  const halfwayPoint = new Date(protocolStart.getTime() + (daysOnProtocol / 2) * 24 * 60 * 60 * 1000)
  const recentMetrics = filterMetricsByDate(metrics, halfwayPoint)
  const { signals: conservativeSignals } = computeAllSignals(recentMetrics, halfwayPoint, false)
  const conservativePositive = conservativeSignals.filter(s => s.interpretation.isImprovement && s.effect.magnitude !== 'negligible')
  const conservativeAdverse = conservativeSignals.filter(s => !s.interpretation.isImprovement && s.effect.magnitude !== 'negligible')
  const conservativeVerdict = determineVerdictFromSignals(conservativePositive, conservativeAdverse, daysOnProtocol / 2)

  scenarios.push({
    scenario: 'Recent data only (peak phase)',
    verdict: conservativeVerdict.verdict,
    verdictScore: conservativeVerdict.verdictScore,
  })

  // Stricter significance threshold
  const strictSignals = baseSignals.filter(s =>
    s.effect.pValue !== null && s.effect.pValue < 0.01
  )
  const strictPositive = strictSignals.filter(s => s.interpretation.isImprovement)
  const strictAdverse = strictSignals.filter(s => !s.interpretation.isImprovement)
  const strictVerdict = determineVerdictFromSignals(strictPositive, strictAdverse, daysOnProtocol)

  scenarios.push({
    scenario: 'p < 0.01 significance threshold',
    verdict: strictVerdict.verdict,
    verdictScore: strictVerdict.verdictScore,
  })

  // Check stability
  const verdicts = scenarios.map(s => s.verdict)
  const isStable = verdicts.every(v => {
    // Group verdicts into positive/negative/neutral categories
    const positiveVerdicts: EvidenceVerdict[] = ['strong_positive', 'likely_positive', 'weak_positive']
    const negativeVerdicts: EvidenceVerdict[] = ['possible_negative']
    const neutralVerdicts: EvidenceVerdict[] = ['no_detectable_effect', 'accumulating', 'too_early', 'confounded']

    const baseCategory =
      positiveVerdicts.includes(baseVerdict.verdict) ? 'positive' :
      negativeVerdicts.includes(baseVerdict.verdict) ? 'negative' : 'neutral'

    const currentCategory =
      positiveVerdicts.includes(v) ? 'positive' :
      negativeVerdicts.includes(v) ? 'negative' : 'neutral'

    return baseCategory === currentCategory
  })

  return {
    isStable,
    sensitivityAnalysis: scenarios,
  }
}

/**
 * Helper to filter metrics by date
 */
function filterMetricsByDate(
  metrics: Map<string, MetricData[]>,
  afterDate: Date
): Map<string, MetricData[]> {
  const filtered = new Map<string, MetricData[]>()
  for (const [type, data] of metrics) {
    filtered.set(type, data.filter(d => d.date >= afterDate))
  }
  return filtered
}

/**
 * Determine verdict from signals (simplified for robustness analysis)
 */
function determineVerdictFromSignals(
  positive: EnhancedSignal[],
  adverse: EnhancedSignal[],
  days: number
): { verdict: EvidenceVerdict; verdictScore: number } {
  if (days < 7) return { verdict: 'too_early', verdictScore: 20 }
  if (days < 14 && positive.length === 0) return { verdict: 'accumulating', verdictScore: 30 }

  if (adverse.length > positive.length && adverse.some(s => s.effect.magnitude !== 'small')) {
    return { verdict: 'possible_negative', verdictScore: 35 }
  }

  if (positive.length === 0) {
    return { verdict: 'no_detectable_effect', verdictScore: 45 }
  }

  const hasLarge = positive.some(s => s.effect.magnitude === 'large')
  const hasMedium = positive.some(s => s.effect.magnitude === 'medium')

  if (hasLarge) return { verdict: 'strong_positive', verdictScore: 85 }
  if (hasMedium) return { verdict: 'likely_positive', verdictScore: 65 }
  return { verdict: 'weak_positive', verdictScore: 50 }
}

/**
 * Create evidence for too_early case
 */
function createEarlyEvidence(
  protocol: ProtocolWithDetails,
  daysOnProtocol: number,
  rampPhase: RampPhase,
  confounds: PremiumProtocolEvidence['confounds']
): PremiumProtocolEvidence {
  return {
    protocolId: protocol.id,
    protocolName: protocol.peptide.name,
    protocolType: protocol.peptide.type as 'peptide' | 'supplement',
    peptideCategory: protocol.peptide.category || undefined,

    startDate: format(protocol.startDate, 'yyyy-MM-dd'),
    daysOnProtocol,
    rampPhase,
    rampExplanation: RAMP_EXPLANATIONS[rampPhase],

    verdict: 'too_early',
    verdictExplanation: `Only ${daysOnProtocol} day${daysOnProtocol === 1 ? '' : 's'} on ${protocol.peptide.name}. Need at least 7 days before evaluating.`,
    verdictScore: 20,

    effects: {
      primary: null,
      supporting: [],
      adverse: [],
      nullFindings: [],
      overallDirection: 'neutral',
      mechanisms: [],
    },

    confidence: {
      level: 'low',
      score: 20,
      reasons: ['Insufficient time on protocol'],
      dataQuality: {
        completeness: 0,
        beforePoints: 0,
        afterPoints: 0,
        totalMetricsTested: 0,
        outlierRate: 0,
      },
    },

    confounds,
  }
}

/**
 * Create evidence for confounded case
 */
function createConfoundedEvidence(
  protocol: ProtocolWithDetails,
  daysOnProtocol: number,
  rampPhase: RampPhase,
  confounds: PremiumProtocolEvidence['confounds']
): PremiumProtocolEvidence {
  return {
    protocolId: protocol.id,
    protocolName: protocol.peptide.name,
    protocolType: protocol.peptide.type as 'peptide' | 'supplement',
    peptideCategory: protocol.peptide.category || undefined,

    startDate: format(protocol.startDate, 'yyyy-MM-dd'),
    daysOnProtocol,
    rampPhase,
    rampExplanation: RAMP_EXPLANATIONS[rampPhase],

    verdict: 'confounded',
    verdictExplanation: `${confounds.totalDays} of ${daysOnProtocol} days had confounding events (${confounds.breakdown.map(b => b.type).join(', ')}). Cannot reliably attribute changes to ${protocol.peptide.name}.`,
    verdictScore: 25,

    effects: {
      primary: null,
      supporting: [],
      adverse: [],
      nullFindings: [],
      overallDirection: 'neutral',
      mechanisms: [],
    },

    confidence: {
      level: 'low',
      score: 25,
      reasons: [`${confounds.totalDays}/${daysOnProtocol} days confounded`],
      dataQuality: {
        completeness: 0,
        beforePoints: 0,
        afterPoints: 0,
        totalMetricsTested: 0,
        outlierRate: 0,
      },
    },

    confounds,
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export interface ComputeEvidenceOptions {
  windowDays?: number
  includeNullFindings?: boolean
  includeRobustness?: boolean
}

/**
 * Compute premium evidence for user protocols
 *
 * @param userId - The user's ID
 * @param protocolId - Specific protocol ID (optional, defaults to all active)
 * @param options - Computation options
 * @returns Array of PremiumProtocolEvidence
 */
export async function computePremiumEvidence(
  userId: string,
  protocolId?: string,
  options: ComputeEvidenceOptions = {}
): Promise<PremiumProtocolEvidence[]> {
  const {
    windowDays,
    includeNullFindings = false,
    includeRobustness = false,
  } = options

  // Fetch protocols
  const protocols = await fetchProtocols(userId, protocolId)

  if (protocols.length === 0) {
    return []
  }

  // Determine date range for metrics
  // Go back 90 days before the earliest protocol start for baseline data
  const earliestStart = protocols.reduce(
    (earliest, p) => p.startDate < earliest ? p.startDate : earliest,
    protocols[0].startDate
  )
  const metricStartDate = subDays(earliestStart, 90)
  const metricEndDate = new Date()

  // Fetch all metrics
  const metrics = await fetchMetrics(userId, metricStartDate, metricEndDate)

  // Fetch context events
  const contextEvents = await fetchContextEvents(userId, metricStartDate, metricEndDate)

  // Compute evidence for each protocol
  const evidencePromises = protocols.map(protocol =>
    computeSingleProtocolEvidence(protocol, metrics, contextEvents, {
      includeNullFindings,
      includeRobustness,
    })
  )

  const results = await Promise.all(evidencePromises)

  // Sort by verdict score (best evidence first)
  results.sort((a, b) => b.verdictScore - a.verdictScore)

  return results
}
