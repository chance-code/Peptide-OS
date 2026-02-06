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
import { normalizeProtocolName } from './supplement-normalization'
import { SOURCE_PRIORITY } from './health-synthesis'
import { getLabExpectationsForProtocol, type LabEffect } from './protocol-lab-expectations'

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
    polarity: 'higher_better' | 'lower_better' | 'neutral'
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

  // Lab biomarker effects (Phase 3A)
  labEffects?: LabBiomarkerEffect[]
  labVerdict?: LabEvidenceVerdict
  labWearableConcordance?: {
    concordant: string[]   // Biomarker keys where lab and wearable agree
    discordant: string[]   // Biomarker keys where lab and wearable disagree
    bonus: number          // Concordance confidence boost (0.0-0.3)
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

// ─── Lab Evidence Types (Phase 3A) ───────────────────────────────────────────

export type LabEvidenceVerdict =
  | 'lab_confirms_positive'    // Lab matches expected direction
  | 'lab_early_signal'         // Too few data points but trending right
  | 'lab_no_effect'            // No change detected
  | 'lab_contradicts_wearable' // Lab and wearable disagree
  | 'lab_insufficient_data'    // <2 draws since protocol start

export interface LabBiomarkerEffect {
  biomarkerKey: string
  displayName: string
  expectedDirection: 'increase' | 'decrease'
  actualDirection: 'increase' | 'decrease' | 'stable'
  baselineValue: number | null   // From PersonalBaseline.personalMean
  latestValue: number | null     // From latest LabBiomarker
  percentChange: number | null
  effectMatch: 'matched' | 'partial' | 'no_effect' | 'opposite'
  confidence: 'high' | 'medium' | 'low'
  dataPoints: number
  explanation: string
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
export function computeEffectSize(before: number[], after: number[]): EffectSizeResult {
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
    canonicalName: string | null
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
          canonicalName: true,
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
      provider: true,
    },
    orderBy: { recordedAt: 'asc' },
  })

  // Dedup by (metricType, day) keeping highest-priority provider
  const deduped = new Map<string, typeof metrics[0]>()
  for (const m of metrics) {
    const dateStr = m.recordedAt.toISOString().split('T')[0]
    const key = `${m.metricType}:${dateStr}`
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, m)
    } else {
      const priority = SOURCE_PRIORITY[m.metricType as keyof typeof SOURCE_PRIORITY] || ['apple_health', 'oura', 'whoop']
      const existingIdx = priority.indexOf(existing.provider)
      const newIdx = priority.indexOf(m.provider)
      if (newIdx !== -1 && (existingIdx === -1 || newIdx < existingIdx)) {
        deduped.set(key, m)
      }
    }
  }
  const dedupedMetrics = Array.from(deduped.values())

  const byType = new Map<string, MetricData[]>()
  for (const m of dedupedMetrics) {
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
// Keyword patterns for detecting confound events from dose log notes
const CONFOUND_KEYWORDS: Record<string, string[]> = {
  illness: ['sick', 'ill', 'cold', 'flu', 'fever', 'infection', 'covid', 'nausea', 'vomiting', 'food poisoning'],
  travel: ['travel', 'traveling', 'travelling', 'flight', 'jet lag', 'jetlag', 'trip', 'timezone'],
  alcohol: ['alcohol', 'drinking', 'drunk', 'hangover', 'wine', 'beer', 'cocktail'],
  stress: ['stressed', 'stress', 'anxiety', 'anxious', 'insomnia', 'couldn\'t sleep', 'poor sleep', 'bad sleep'],
}

async function fetchContextEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ContextEvent[]> {
  // Parse dose log notes for confound keywords
  const doseLogs = await prisma.doseLog.findMany({
    where: {
      userId,
      scheduledDate: { gte: startDate, lte: endDate },
      notes: { not: null },
    },
    select: {
      scheduledDate: true,
      notes: true,
    },
  })

  const events: ContextEvent[] = []

  for (const log of doseLogs) {
    if (!log.notes) continue
    const notesLower = log.notes.toLowerCase()

    for (const [confoundType, keywords] of Object.entries(CONFOUND_KEYWORDS)) {
      if (keywords.some(kw => notesLower.includes(kw))) {
        events.push({
          date: log.scheduledDate,
          type: confoundType,
        })
        break // One confound type per log entry to avoid double-counting
      }
    }
  }

  return events
}

// ─── Mechanism Detection ─────────────────────────────────────────────────────

/**
 * Detect mechanisms based on observed signals
 */
export function detectMechanisms(signals: EnhancedSignal[]): Mechanism[] {
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

// ─── Lab Biomarker Evidence (Phase 3A) ───────────────────────────────────────

/**
 * Compute lab biomarker effects for a protocol by comparing personal baselines
 * to latest lab values, matched against expected effects from the registry.
 */
async function computeLabEffects(
  userId: string,
  protocolName: string,
  protocolStartDate: Date
): Promise<LabBiomarkerEffect[]> {
  const expectations = getLabExpectationsForProtocol(protocolName)
  if (!expectations || expectations.expectedLabEffects.length === 0) return []

  // Get biomarker keys we care about
  const expectedKeys = expectations.expectedLabEffects.map(e => e.biomarkerKey)

  // Fetch personal baselines for these biomarkers
  const baselines = await prisma.personalBaseline.findMany({
    where: { userId, biomarkerKey: { in: expectedKeys } },
  })
  const baselineMap = new Map(baselines.map(b => [b.biomarkerKey, b]))

  // Fetch latest lab upload biomarkers (only those after protocol start)
  const latestUpload = await prisma.labUpload.findFirst({
    where: { userId, testDate: { gte: protocolStartDate } },
    orderBy: { testDate: 'desc' },
    include: {
      biomarkers: {
        where: { biomarkerKey: { in: expectedKeys } },
      },
    },
  })

  const latestBiomarkers = new Map(
    (latestUpload?.biomarkers ?? []).map(b => [b.biomarkerKey, b])
  )

  // Count total lab draws since protocol start
  const drawCount = await prisma.labUpload.count({
    where: { userId, testDate: { gte: protocolStartDate } },
  })

  const effects: LabBiomarkerEffect[] = []

  for (const expected of expectations.expectedLabEffects) {
    const baseline = baselineMap.get(expected.biomarkerKey)
    const latest = latestBiomarkers.get(expected.biomarkerKey)

    // No data at all
    if (!baseline && !latest) {
      effects.push({
        biomarkerKey: expected.biomarkerKey,
        displayName: expected.displayName,
        expectedDirection: expected.expectedDirection,
        actualDirection: 'stable',
        baselineValue: null,
        latestValue: null,
        percentChange: null,
        effectMatch: 'no_effect',
        confidence: 'low',
        dataPoints: 0,
        explanation: `No ${expected.displayName} data available. Consider testing to track this biomarker.`,
      })
      continue
    }

    const baselineValue = baseline?.personalMean ?? null
    const latestValue = latest?.value ?? baseline?.lastLabValue ?? null

    if (baselineValue === null || latestValue === null) {
      effects.push({
        biomarkerKey: expected.biomarkerKey,
        displayName: expected.displayName,
        expectedDirection: expected.expectedDirection,
        actualDirection: 'stable',
        baselineValue,
        latestValue,
        percentChange: null,
        effectMatch: 'no_effect',
        confidence: 'low',
        dataPoints: drawCount,
        explanation: `Insufficient ${expected.displayName} data to determine effect. ${baselineValue === null ? 'No pre-protocol baseline.' : 'No post-protocol measurement.'}`,
      })
      continue
    }

    // Compute percent change
    const percentChange = baselineValue !== 0
      ? ((latestValue - baselineValue) / Math.abs(baselineValue)) * 100
      : 0

    // Determine actual direction
    const changeThreshold = 3 // % change threshold to count as meaningful
    let actualDirection: 'increase' | 'decrease' | 'stable'
    if (percentChange > changeThreshold) actualDirection = 'increase'
    else if (percentChange < -changeThreshold) actualDirection = 'decrease'
    else actualDirection = 'stable'

    // Determine effect match
    let effectMatch: LabBiomarkerEffect['effectMatch']
    if (actualDirection === expected.expectedDirection) {
      // Check if magnitude is within expected range
      const absChange = Math.abs(percentChange)
      if (absChange >= expected.magnitudeRange.min) effectMatch = 'matched'
      else effectMatch = 'partial'
    } else if (actualDirection === 'stable') {
      effectMatch = 'no_effect'
    } else {
      effectMatch = 'opposite'
    }

    // Determine confidence based on data quality
    const personalSD = baseline?.personalSD ?? 0
    const zScore = personalSD > 0 ? Math.abs(latestValue - baselineValue) / personalSD : 0
    let confidence: 'high' | 'medium' | 'low'
    if (drawCount >= 3 && zScore > 2.0) confidence = 'high'
    else if (drawCount >= 2 && zScore > 1.0) confidence = 'medium'
    else confidence = 'low'

    // Build explanation
    const explanation = buildLabEffectExplanation(
      expected, actualDirection, percentChange, effectMatch, confidence, drawCount
    )

    effects.push({
      biomarkerKey: expected.biomarkerKey,
      displayName: expected.displayName,
      expectedDirection: expected.expectedDirection,
      actualDirection,
      baselineValue: Math.round(baselineValue * 100) / 100,
      latestValue: Math.round(latestValue * 100) / 100,
      percentChange: Math.round(percentChange * 10) / 10,
      effectMatch,
      confidence,
      dataPoints: drawCount,
      explanation,
    })
  }

  return effects
}

function buildLabEffectExplanation(
  expected: LabEffect,
  actual: 'increase' | 'decrease' | 'stable',
  percentChange: number,
  match: LabBiomarkerEffect['effectMatch'],
  confidence: 'high' | 'medium' | 'low',
  draws: number
): string {
  const dirWord = actual === 'increase' ? 'increased' : actual === 'decrease' ? 'decreased' : 'remained stable'
  const pctStr = `${Math.abs(percentChange).toFixed(1)}%`

  switch (match) {
    case 'matched':
      return `${expected.displayName} ${dirWord} ${pctStr}, consistent with the expected ${expected.expectedDirection} from ${expected.mechanism.split(',')[0]}. ${confidence === 'high' ? 'Strong signal.' : confidence === 'medium' ? 'Moderate signal — more data will strengthen this.' : 'Early signal — additional lab draws will improve confidence.'}`
    case 'partial':
      return `${expected.displayName} ${dirWord} ${pctStr}, trending in the expected direction but below the typical ${expected.magnitudeRange.min}-${expected.magnitudeRange.max}% range. May still be building — effects typically peak at ${expected.peakWeeks.min}-${expected.peakWeeks.max} weeks.`
    case 'no_effect':
      return `${expected.displayName} ${dirWord}. No significant change detected yet. ${draws < 2 ? 'More lab draws needed.' : `Effects typically appear at ${expected.onsetWeeks.min}-${expected.onsetWeeks.max} weeks.`}`
    case 'opposite':
      return `${expected.displayName} ${dirWord} ${pctStr}, which is opposite to the expected ${expected.expectedDirection}. This may reflect individual variation, confounding factors, or insufficient time on protocol.`
    default:
      return `${expected.displayName}: ${dirWord} ${pctStr}.`
  }
}

/**
 * Compute concordance bonus between wearable and lab evidence.
 * When both agree in direction, confidence is boosted.
 */
function computeConcordanceBonus(
  wearableSignals: EnhancedSignal[],
  labEffects: LabBiomarkerEffect[]
): { concordant: string[]; discordant: string[]; bonus: number } {
  // Map wearable metric categories to lab biomarker connections
  const WEARABLE_LAB_CONNECTIONS: Record<string, { biomarkerKeys: string[]; wearableImproving: 'decrease' | 'increase' }> = {
    hrv: { biomarkerKeys: ['hs_crp', 'fasting_insulin'], wearableImproving: 'decrease' },
    resting_heart_rate: { biomarkerKeys: ['ferritin', 'hemoglobin'], wearableImproving: 'increase' },
    deep_sleep: { biomarkerKeys: ['tsh', 'free_t3'], wearableImproving: 'increase' },
    body_fat_percentage: { biomarkerKeys: ['fasting_insulin', 'triglycerides'], wearableImproving: 'decrease' },
    sleep_efficiency: { biomarkerKeys: ['hs_crp', 'cortisol'], wearableImproving: 'decrease' },
  }

  const concordant: string[] = []
  const discordant: string[] = []

  for (const signal of wearableSignals) {
    const connection = WEARABLE_LAB_CONNECTIONS[signal.metricType]
    if (!connection) continue

    for (const labKey of connection.biomarkerKeys) {
      const labEffect = labEffects.find(e => e.biomarkerKey === labKey)
      if (!labEffect || labEffect.effectMatch === 'no_effect') continue

      // Check if wearable improvement direction aligns with lab effect
      const wearableIsPositive = signal.interpretation.isImprovement
      const labIsPositive = labEffect.effectMatch === 'matched' || labEffect.effectMatch === 'partial'

      if (wearableIsPositive === labIsPositive) {
        concordant.push(labKey)
      } else {
        discordant.push(labKey)
      }
    }
  }

  // Deduplicate
  const uniqueConcordant = [...new Set(concordant)]
  const uniqueDiscordant = [...new Set(discordant)]

  // Bonus: 0.1 per concordant marker, max 0.3
  const bonus = Math.min(0.3, uniqueConcordant.length * 0.1)

  return { concordant: uniqueConcordant, discordant: uniqueDiscordant, bonus }
}

/**
 * Determine overall lab evidence verdict from individual effects.
 */
function determineLabVerdict(
  labEffects: LabBiomarkerEffect[],
  wearableSignals: EnhancedSignal[]
): LabEvidenceVerdict {
  if (labEffects.length === 0) return 'lab_insufficient_data'

  const withData = labEffects.filter(e => e.dataPoints > 0 && e.latestValue !== null)
  if (withData.length === 0) return 'lab_insufficient_data'

  const matched = withData.filter(e => e.effectMatch === 'matched')
  const partial = withData.filter(e => e.effectMatch === 'partial')
  const opposite = withData.filter(e => e.effectMatch === 'opposite')
  const noEffect = withData.filter(e => e.effectMatch === 'no_effect')

  // Check for contradiction with wearable evidence
  if (opposite.length > 0 && wearableSignals.some(s => s.interpretation.isImprovement)) {
    return 'lab_contradicts_wearable'
  }

  if (matched.length > 0) return 'lab_confirms_positive'
  if (partial.length > 0) return 'lab_early_signal'
  if (noEffect.length === withData.length) return 'lab_no_effect'

  return 'lab_insufficient_data'
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
  },
  userId?: string
): Promise<PremiumProtocolEvidence> {
  const today = new Date()
  const startDate = protocol.startDate
  const daysOnProtocol = differenceInDays(today, startDate)

  // Use AI-classified canonical name if available, otherwise fall back to normalization
  const normalizedName = protocol.peptide.canonicalName || normalizeProtocolName(protocol.peptide.name).canonical

  // Determine ramp phase
  const rampPhase: RampPhase =
    daysOnProtocol <= 7 ? 'loading' :
    daysOnProtocol <= 21 ? 'building' :
    daysOnProtocol <= 60 ? 'peak' : 'plateau'

  // Calculate confound impact
  const confoundAnalysis = analyzeConfounds(contextEvents, startDate, daysOnProtocol)

  // Early return for too_early
  if (daysOnProtocol < 7) {
    return createEarlyEvidence(protocol, normalizedName, daysOnProtocol, rampPhase, confoundAnalysis)
  }

  // Early return for confounded
  if (confoundAnalysis.impact === 'high') {
    return createConfoundedEvidence(protocol, normalizedName, daysOnProtocol, rampPhase, confoundAnalysis)
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

  // Determine verdict (use normalized name for consistent display in explanations)
  const { verdict, verdictScore, verdictExplanation } = determineVerdict(
    daysOnProtocol,
    rampPhase,
    positiveSignals,
    adverseSignals,
    confidence,
    normalizedName
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

  // Lab biomarker effects (Phase 3A)
  let labEffects: LabBiomarkerEffect[] | undefined
  let labVerdict: LabEvidenceVerdict | undefined
  let labWearableConcordance: PremiumProtocolEvidence['labWearableConcordance'] | undefined

  if (userId && daysOnProtocol >= 7) {
    try {
      labEffects = await computeLabEffects(userId, normalizedName, startDate)
      if (labEffects.length > 0) {
        labVerdict = determineLabVerdict(labEffects, signals)
        labWearableConcordance = computeConcordanceBonus(signals, labEffects)

        // Apply concordance bonus to confidence score
        if (labWearableConcordance.bonus > 0) {
          confidence.score = Math.min(100, confidence.score + labWearableConcordance.bonus * 100)
          confidence.reasons.push(
            `Lab-wearable concordance: ${labWearableConcordance.concordant.length} biomarker(s) agree with wearable signals (+${Math.round(labWearableConcordance.bonus * 100)}% confidence)`
          )
        }
      }
    } catch {
      // Lab analysis is optional — don't fail the whole evidence computation
    }
  }

  return {
    protocolId: protocol.id,
    protocolName: normalizedName,
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

    // Lab biomarker effects (Phase 3A)
    labEffects: labEffects && labEffects.length > 0 ? labEffects : undefined,
    labVerdict,
    labWearableConcordance,
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
    recommendation = 'Too many confounding events to reliably attribute changes. A cleaner period of data collection may help clarify the picture.'
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

    const polarity = METRIC_POLARITY[metricType] || 'higher_better'
    const isImprovement = polarity === 'neutral'
      ? false // Neutral metrics have no inherent improvement direction
      : (polarity === 'higher_better' && direction === 'up') ||
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
      verdictExplanation: `Some metrics moved unfavorably since starting ${protocolName}. ${topAdverse.metricName} ${topAdverse.change.direction === 'up' ? 'increased' : 'decreased'} ${Math.abs(topAdverse.change.percent).toFixed(0)}%. Discussing dosing or timing with your provider may help.`,
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
  normalizedName: string,
  daysOnProtocol: number,
  rampPhase: RampPhase,
  confounds: PremiumProtocolEvidence['confounds']
): PremiumProtocolEvidence {
  return {
    protocolId: protocol.id,
    protocolName: normalizedName,
    protocolType: protocol.peptide.type as 'peptide' | 'supplement',
    peptideCategory: protocol.peptide.category || undefined,

    startDate: format(protocol.startDate, 'yyyy-MM-dd'),
    daysOnProtocol,
    rampPhase,
    rampExplanation: RAMP_EXPLANATIONS[rampPhase],

    verdict: 'too_early',
    verdictExplanation: `Only ${daysOnProtocol} day${daysOnProtocol === 1 ? '' : 's'} on ${normalizedName}. Need at least 7 days before evaluating.`,
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
  normalizedName: string,
  daysOnProtocol: number,
  rampPhase: RampPhase,
  confounds: PremiumProtocolEvidence['confounds']
): PremiumProtocolEvidence {
  return {
    protocolId: protocol.id,
    protocolName: normalizedName,
    protocolType: protocol.peptide.type as 'peptide' | 'supplement',
    peptideCategory: protocol.peptide.category || undefined,

    startDate: format(protocol.startDate, 'yyyy-MM-dd'),
    daysOnProtocol,
    rampPhase,
    rampExplanation: RAMP_EXPLANATIONS[rampPhase],

    verdict: 'confounded',
    verdictExplanation: `${confounds.totalDays} of ${daysOnProtocol} days had confounding events (${confounds.breakdown.map(b => b.type).join(', ')}). Cannot reliably attribute changes to ${normalizedName}.`,
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
    }, userId)
  )

  const results = await Promise.all(evidencePromises)

  // Sort by verdict score (best evidence first)
  results.sort((a, b) => b.verdictScore - a.verdictScore)

  return results
}
