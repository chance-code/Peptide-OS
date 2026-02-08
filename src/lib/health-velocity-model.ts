/**
 * Health Velocity Model v3 — Capacity-First, Load-Conditioned
 *
 * Replaces the fatigue-dominant scoreToVelocity() path.
 *
 * Core principles:
 *   1. CAPACITY (slow state, 28-180 day trends) dominates velocity
 *   2. FATIGUE (fast state, 1-14 day deviations) only penalizes velocity
 *      when it EXCEEDS what's expected given training load and capacity
 *   3. Hard constraints: improving capacity → velocity MUST NOT exceed 1.00
 *   4. Bayesian shrinkage: less data → pull toward neutral (1.00)
 *
 * Pipeline: Signals → Capacity Velocity → Excess Fatigue Penalty →
 *           Lab Modulation → Hard Constraints → Shrinkage → Output
 */

import type { BiomarkerFlag } from './lab-biomarker-contract'

// ─── Phase 2: Target Redefinition — Types ──────────────────────────────────

export interface CapacitySignal {
  metric: string
  /** Polarity-corrected % change per 28 days. Positive = improving. */
  normalizedSlope: number
  /** 0-1 based on data density and regression fit (R²) */
  confidence: number
  /** Actual data window in days */
  windowDays: number
  /** Number of data points used */
  dataPoints: number
  trendDirection: 'improving' | 'declining' | 'stable'
}

export interface FatigueSignal {
  metric: string
  /** Short-term deviation from medium-term mean, polarity-corrected. Negative = more fatigued. */
  deviation: number
  /** Expected deviation given current load (negative = expected fatigue). */
  expectedDeviation: number
  /** deviation - expectedDeviation. Positive = unexplained fatigue. */
  excessFatigue: number
}

export interface LoadSignal {
  metric: string
  /** 7-day mean/sum of activity metric */
  recentValue: number
  /** 28-day mean/sum of activity metric */
  baselineValue: number
  /** recentValue / baselineValue. >1 = training harder than usual */
  loadRatio: number
}

export interface VelocityModelInput {
  capacitySignals: CapacitySignal[]
  fatigueSignals: FatigueSignal[]
  loadSignals: LoadSignal[]
  /** Per-system lab zone scores (0-100 per marker) */
  labScores: Array<{ biomarkerKey: string; score: number }> | null
  labRecencyDays: number
}

export interface SystemVelocityDetail {
  system: string
  velocity: number
  capacityComponent: number
  fatigueComponent: number
  labComponent: number
  confidence: number
  dominantSignal: string | null
  trendDirection: 'improving' | 'declining' | 'stable'
}

export interface VelocityExplanation {
  dominantFactor: 'capacity' | 'fatigue' | 'labs' | 'insufficient_data'
  capacityNarrative: string
  fatigueNarrative: string
  constraintNarrative: string | null
  topContributors: Array<{
    signal: string
    direction: 'helping' | 'hurting'
    magnitude: number
    explanation: string
  }>
}

export interface VelocityModelOutput {
  overallVelocity: number
  capacityVelocity: number
  excessFatiguePenalty: number
  labModulation: number
  hardConstraintApplied: boolean
  hardConstraintReason: string | null
  shrinkageFactor: number
  preShrinkageVelocity: number
  systemVelocities: Record<string, SystemVelocityDetail>
  explainability: VelocityExplanation
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * How aggressively capacity slopes map to velocity.
 * Each 1% per 28 days of improvement → 0.03 velocity reduction from 1.00.
 */
const SLOPE_TO_VELOCITY_FACTOR = 0.03

/** Minimum data window (days) for a capacity signal to contribute. */
const MIN_CAPACITY_WINDOW_DAYS = 14

/** Preferred window for reliable capacity signals. Signals with shorter windows get discounted. */
const PREFERRED_CAPACITY_WINDOW_DAYS = 56

/** Maximum excess fatigue penalty added to velocity. */
const MAX_FATIGUE_PENALTY = 0.05

/** Cap on capacity velocity deviation from neutral. */
const MAX_CAPACITY_DEVIATION = 0.20

/** Lab velocity modulation coefficient: (70 - avgScore) * this = velocity delta. */
const LAB_MODULATION_COEFFICIENT = 0.0015

/** Maximum lab modulation. */
const MAX_LAB_MODULATION = 0.08

/** Overall velocity bounds. */
export const VELOCITY_V3_MIN = 0.75
export const VELOCITY_V3_MAX = 1.35

// ─── Capacity Signal Configuration ────────────────────────────────────────

interface CapacityMetricConfig {
  weight: number
  minWindowDays: number
  preferredWindowDays: number
}

export const CAPACITY_METRIC_WEIGHTS: Record<string, CapacityMetricConfig> = {
  vo2_max:              { weight: 0.25, minWindowDays: 21, preferredWindowDays: 56 },
  body_fat_percentage:  { weight: 0.20, minWindowDays: 21, preferredWindowDays: 56 },
  lean_body_mass:       { weight: 0.15, minWindowDays: 21, preferredWindowDays: 56 },
  hrv:                  { weight: 0.20, minWindowDays: 14, preferredWindowDays: 28 },
  rhr:                  { weight: 0.10, minWindowDays: 14, preferredWindowDays: 28 },
  sleep_score:          { weight: 0.10, minWindowDays: 14, preferredWindowDays: 28 },
}

// ─── Per-System Configuration ─────────────────────────────────────────────

interface SystemConfig {
  capacityMetrics: Array<{ metric: string; weight: number }>
  labMarkers: string[]
  /** How much labs contribute to this system's velocity (0-1). */
  labWeight: number
}

export const SYSTEM_SIGNAL_MAP: Record<string, SystemConfig> = {
  cardiovascular: {
    capacityMetrics: [
      { metric: 'hrv', weight: 0.5 },
      { metric: 'rhr', weight: 0.5 },
    ],
    labMarkers: ['apolipoprotein_b', 'ldl_cholesterol', 'lipoprotein_a', 'hs_crp', 'homocysteine'],
    labWeight: 0.4,
  },
  metabolic: {
    capacityMetrics: [
      { metric: 'body_fat_percentage', weight: 1.0 },
    ],
    labMarkers: ['fasting_insulin', 'fasting_glucose', 'hba1c', 'homa_ir', 'triglycerides'],
    labWeight: 0.6,
  },
  inflammatory: {
    capacityMetrics: [
      { metric: 'hrv', weight: 1.0 },
    ],
    labMarkers: ['hs_crp', 'esr', 'homocysteine', 'ferritin'],
    labWeight: 0.6,
  },
  fitness: {
    capacityMetrics: [
      { metric: 'vo2_max', weight: 0.7 },
      { metric: 'lean_body_mass', weight: 0.3 },
    ],
    labMarkers: ['hemoglobin', 'ferritin', 'iron'],
    labWeight: 0.2,
  },
  bodyComp: {
    capacityMetrics: [
      { metric: 'body_fat_percentage', weight: 0.5 },
      { metric: 'lean_body_mass', weight: 0.3 },
    ],
    labMarkers: ['total_testosterone', 'free_testosterone', 'tsh', 'free_t3'],
    labWeight: 0.3,
  },
  hormonal: {
    capacityMetrics: [],
    labMarkers: ['total_testosterone', 'free_testosterone', 'estradiol', 'cortisol', 'dhea_s', 'tsh'],
    labWeight: 0.9,
  },
  neuro: {
    capacityMetrics: [
      { metric: 'sleep_score', weight: 1.0 },
    ],
    labMarkers: ['vitamin_b12', 'folate', 'omega_3_index', 'homocysteine', 'vitamin_d'],
    labWeight: 0.5,
  },
}

// ─── Phase 3: Model Redesign — Core Computation ───────────────────────────

/**
 * Ordinary least squares linear regression.
 * Returns slope and R² (coefficient of determination).
 */
export function linearRegression(
  points: Array<{ x: number; y: number }>
): { slope: number; intercept: number; r2: number } {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumX2 += p.x * p.x
  }

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return { slope: 0, intercept: sumY / n, r2: 0 }

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  const yMean = sumY / n
  let ssTotal = 0, ssResidual = 0
  for (const p of points) {
    ssTotal += (p.y - yMean) ** 2
    ssResidual += (p.y - (slope * p.x + intercept)) ** 2
  }
  const r2 = ssTotal === 0 ? 0 : Math.max(0, 1 - ssResidual / ssTotal)

  return { slope, intercept, r2 }
}

/**
 * Compute capacity signals from daily wearable values.
 * Uses linear regression over the full data window to detect structural trends.
 */
export function computeCapacitySignals(
  metricData: Map<string, Array<{ date: string; value: number }>>,
  polarityMap: Record<string, string>
): CapacitySignal[] {
  const signals: CapacitySignal[] = []

  for (const [metric, config] of Object.entries(CAPACITY_METRIC_WEIGHTS)) {
    const dailyValues = metricData.get(metric)
    if (!dailyValues || dailyValues.length < 5) continue

    // Sort by date ascending
    const sorted = [...dailyValues].sort((a, b) => a.date.localeCompare(b.date))

    // Compute window span in days
    const firstDate = new Date(sorted[0].date)
    const lastDate = new Date(sorted[sorted.length - 1].date)
    const windowDays = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))

    if (windowDays < config.minWindowDays) continue

    // Convert to (x=dayIndex, y=value) for regression
    const points = sorted.map((d, i) => {
      const daysSinceFirst = (new Date(d.date).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      return { x: daysSinceFirst, y: d.value }
    })

    const reg = linearRegression(points)

    // Compute baseline mean for normalization
    const mean = sorted.reduce((s, d) => s + d.value, 0) / sorted.length
    if (mean === 0) continue

    // Normalized slope: % change per 28 days
    const slopePerDay = reg.slope
    const normalizedSlope28d = (slopePerDay * 28 / Math.abs(mean)) * 100

    // Apply polarity: for lower_better metrics, flip sign so positive = improving
    const polarity = polarityMap[metric] ?? 'higher_better'
    const polarityCorrected = polarity === 'lower_better' ? -normalizedSlope28d : normalizedSlope28d

    // Confidence: based on R², data density, and window length
    const r2Factor = Math.min(1, reg.r2 * 2) // R² of 0.5+ → full confidence from fit
    const densityFactor = Math.min(1, sorted.length / (windowDays * 0.7)) // 70% daily coverage → full
    const windowFactor = Math.min(1, windowDays / config.preferredWindowDays)
    const confidence = Math.round(r2Factor * densityFactor * windowFactor * 100) / 100

    // Trend classification
    const STABLE_THRESHOLD = 0.5 // ±0.5% per 28 days is stable
    let trendDirection: CapacitySignal['trendDirection'] = 'stable'
    if (polarityCorrected > STABLE_THRESHOLD && confidence >= 0.2) trendDirection = 'improving'
    else if (polarityCorrected < -STABLE_THRESHOLD && confidence >= 0.2) trendDirection = 'declining'

    signals.push({
      metric,
      normalizedSlope: Math.round(polarityCorrected * 100) / 100,
      confidence,
      windowDays: Math.round(windowDays),
      dataPoints: sorted.length,
      trendDirection,
    })
  }

  return signals
}

/**
 * Compute training load signals from activity metrics.
 */
export function computeLoadSignals(
  metricData: Map<string, Array<{ date: string; value: number }>>
): LoadSignal[] {
  const loadMetrics = ['exercise_minutes', 'active_calories', 'steps']
  const signals: LoadSignal[] = []

  for (const metric of loadMetrics) {
    const dailyValues = metricData.get(metric)
    if (!dailyValues || dailyValues.length < 7) continue

    const sorted = [...dailyValues].sort((a, b) => a.date.localeCompare(b.date))

    // Recent 7 days mean
    const recent7 = sorted.slice(-7)
    const recentMean = recent7.reduce((s, d) => s + d.value, 0) / recent7.length

    // Baseline: full window mean (up to 28+ days back)
    const baselineSlice = sorted.length > 7 ? sorted.slice(0, -7) : sorted
    const baselineMean = baselineSlice.reduce((s, d) => s + d.value, 0) / baselineSlice.length

    if (baselineMean === 0) continue

    signals.push({
      metric,
      recentValue: Math.round(recentMean * 10) / 10,
      baselineValue: Math.round(baselineMean * 10) / 10,
      loadRatio: Math.round((recentMean / baselineMean) * 100) / 100,
    })
  }

  return signals
}

/**
 * Compute fatigue signals with load conditioning.
 *
 * Key innovation: expected fatigue depends on training load.
 * Only EXCESS fatigue (beyond what load explains) penalizes velocity.
 */
export function computeFatigueSignals(
  metricData: Map<string, Array<{ date: string; value: number }>>,
  loadSignals: LoadSignal[],
  capacitySignals: CapacitySignal[],
  polarityMap: Record<string, string>
): FatigueSignal[] {
  const fatigueMetrics = ['hrv', 'rhr', 'sleep_score', 'readiness_score', 'deep_sleep']
  const signals: FatigueSignal[] = []

  // Aggregate load ratio (mean across load metrics, default 1.0)
  const avgLoadRatio = loadSignals.length > 0
    ? loadSignals.reduce((s, l) => s + l.loadRatio, 0) / loadSignals.length
    : 1.0

  // Capacity level: mean of positive capacity slopes (higher = more adapted)
  const improvingCapacity = capacitySignals.filter(s => s.normalizedSlope > 0 && s.confidence >= 0.3)
  const capacityLevel = improvingCapacity.length > 0
    ? improvingCapacity.reduce((s, c) => s + c.normalizedSlope * c.confidence, 0) / improvingCapacity.length
    : 0

  for (const metric of fatigueMetrics) {
    const dailyValues = metricData.get(metric)
    if (!dailyValues || dailyValues.length < 7) continue

    const sorted = [...dailyValues].sort((a, b) => a.date.localeCompare(b.date))

    // Short-term: 3-day mean (most recent)
    const recent3 = sorted.slice(-3)
    const shortTermMean = recent3.reduce((s, d) => s + d.value, 0) / recent3.length

    // Medium-term: 14-day mean (or full window if less)
    const medTermSlice = sorted.length > 14 ? sorted.slice(-14) : sorted
    const medTermMean = medTermSlice.reduce((s, d) => s + d.value, 0) / medTermSlice.length

    if (medTermMean === 0) continue

    // Raw deviation as percent of medium-term mean
    const rawDeviation = ((shortTermMean - medTermMean) / Math.abs(medTermMean)) * 100

    // Apply polarity: negative = more fatigued (for all metrics)
    const polarity = polarityMap[metric] ?? 'higher_better'
    const deviation = polarity === 'lower_better' ? -rawDeviation : rawDeviation

    // Expected deviation given load:
    // Higher load → expect more negative deviation (more fatigue)
    // Higher capacity → more resilient (expect less fatigue per unit load)
    const excessLoadFactor = Math.max(0, avgLoadRatio - 1.0) // only excess load above baseline
    const capacityResilience = 1.0 + capacityLevel * 0.1 // higher capacity → more resilient
    const expectedDeviation = -(excessLoadFactor * 5.0) / capacityResilience

    // Excess fatigue: how much fatigue is NOT explained by load
    // If deviation is negative (fatigued) and less than expected: excess
    // If deviation is positive or within expected range: no excess
    const excessFatigue = Math.max(0, expectedDeviation - deviation)

    signals.push({
      metric,
      deviation: Math.round(deviation * 100) / 100,
      expectedDeviation: Math.round(expectedDeviation * 100) / 100,
      excessFatigue: Math.round(excessFatigue * 100) / 100,
    })
  }

  return signals
}

/**
 * Compute lab-based velocity modulation for a set of markers.
 * Returns a velocity delta: negative = labs push velocity down (good),
 * positive = labs push velocity up (bad).
 */
export function computeLabModulation(
  labScores: Array<{ biomarkerKey: string; score: number }> | null,
  labRecencyDays: number,
  filterMarkers?: string[]
): number {
  if (!labScores || labScores.length === 0) return 0

  // Filter to relevant markers if specified
  const relevant = filterMarkers
    ? labScores.filter(s => filterMarkers.includes(s.biomarkerKey))
    : labScores

  if (relevant.length === 0) return 0

  const avgScore = relevant.reduce((s, l) => s + l.score, 0) / relevant.length

  // Map: score 70 = neutral, >70 = good (negative delta), <70 = bad (positive delta)
  const rawDelta = (70 - avgScore) * LAB_MODULATION_COEFFICIENT
  const clampedDelta = Math.max(-MAX_LAB_MODULATION, Math.min(MAX_LAB_MODULATION, rawDelta))

  // Decay with recency
  let recencyFactor: number
  if (labRecencyDays <= 14) recencyFactor = 1.0
  else if (labRecencyDays <= 30) recencyFactor = 0.85
  else if (labRecencyDays <= 60) recencyFactor = 0.7
  else if (labRecencyDays <= 90) recencyFactor = 0.5
  else if (labRecencyDays <= 180) recencyFactor = 0.3
  else recencyFactor = 0.15

  return Math.round(clampedDelta * recencyFactor * 1000) / 1000
}

// ─── Phase 4: Hard Constraint Encoding ────────────────────────────────────

/**
 * Hard constraints: if capacity is improving, velocity MUST NOT exceed 1.00.
 *
 * Gates:
 *   1. VO2 max improving (≥21 days, confidence ≥ 0.3) → cap at 1.00
 *   2. Body fat declining AND lean mass not declining → cap at 1.00
 *   3. HRV 28-day trend improving (≥14 days, confidence ≥ 0.3) → cap at 1.00
 *
 * Sustained evidence requirement: signal must have minimum window and confidence.
 */
export function applyHardConstraints(
  velocity: number,
  capacitySignals: CapacitySignal[]
): { velocity: number; applied: boolean; reason: string | null } {
  if (velocity <= 1.00) return { velocity, applied: false, reason: null }

  const reasons: string[] = []

  // Gate 1: VO2 max improving
  const vo2 = capacitySignals.find(s => s.metric === 'vo2_max')
  if (vo2 && vo2.trendDirection === 'improving' && vo2.windowDays >= 21 && vo2.confidence >= 0.3) {
    reasons.push('VO2 max improving')
  }

  // Gate 2: Body fat declining + lean mass not declining
  const bf = capacitySignals.find(s => s.metric === 'body_fat_percentage')
  const lm = capacitySignals.find(s => s.metric === 'lean_body_mass')
  if (bf && bf.trendDirection === 'improving' && bf.confidence >= 0.3) {
    if (!lm || lm.trendDirection !== 'declining') {
      reasons.push('body fat declining')
    }
  }

  // Gate 3: HRV trend improving
  const hrv = capacitySignals.find(s => s.metric === 'hrv')
  if (hrv && hrv.trendDirection === 'improving' && hrv.windowDays >= 14 && hrv.confidence >= 0.3) {
    reasons.push('HRV trend improving')
  }

  // Gate 4: Sleep score improving
  const sleep = capacitySignals.find(s => s.metric === 'sleep_score')
  if (sleep && sleep.trendDirection === 'improving' && sleep.windowDays >= 14 && sleep.confidence >= 0.3) {
    reasons.push('sleep quality improving')
  }

  if (reasons.length > 0) {
    return {
      velocity: Math.min(velocity, 1.00),
      applied: true,
      reason: `Capacity improving: ${reasons.join(', ')}`,
    }
  }

  return { velocity, applied: false, reason: null }
}

// ─── Phase 5: Bayesian Shrinkage ──────────────────────────────────────────

/**
 * Pull velocity toward neutral (1.00) based on data completeness.
 * Less data → more shrinkage → closer to 1.00.
 *
 * shrinkageFactor: 1.0 = full data (no shrinkage), 0.0 = no data (full shrinkage)
 */
export function applyShrinkage(
  velocity: number,
  signalCompleteness: number
): { velocity: number; shrinkageFactor: number } {
  const factor = Math.max(0, Math.min(1, signalCompleteness))
  const shrunk = 1.00 + (velocity - 1.00) * factor
  return {
    velocity: Math.round(shrunk * 1000) / 1000,
    shrinkageFactor: Math.round(factor * 100) / 100,
  }
}

/**
 * Compute signal completeness: what fraction of expected signals are present and confident.
 */
export function computeSignalCompleteness(
  capacitySignals: CapacitySignal[],
  fatigueSignals: FatigueSignal[],
  labScores: Array<{ biomarkerKey: string; score: number }> | null
): number {
  const expectedCapacity = Object.keys(CAPACITY_METRIC_WEIGHTS).length // 6
  const expectedFatigue = 5 // hrv, rhr, sleep_score, readiness_score, deep_sleep
  const labBonus = 0.15

  // Capacity: weight by confidence
  const capacityScore = capacitySignals.reduce((s, c) => s + c.confidence, 0) / expectedCapacity
  // Fatigue: simple presence
  const fatigueScore = Math.min(1, fatigueSignals.length / expectedFatigue)
  // Lab bonus
  const labScore = (labScores && labScores.length >= 5) ? labBonus : 0

  // Weighted: capacity dominates
  const completeness = capacityScore * 0.6 + fatigueScore * 0.25 + labScore
  return Math.round(Math.min(1, completeness) * 100) / 100
}

// ─── Phase 3 (continued): Main Velocity Computation ───────────────────────

/**
 * Compute capacity-derived velocity from signal slopes.
 * Each signal's polarity-corrected slope maps to a velocity delta.
 */
export function computeCapacityVelocity(signals: CapacitySignal[]): number {
  if (signals.length === 0) return 1.00 // neutral if no data

  let weightedDelta = 0
  let totalWeight = 0

  for (const signal of signals) {
    const config = CAPACITY_METRIC_WEIGHTS[signal.metric]
    if (!config) continue

    const weight = config.weight * signal.confidence
    if (weight <= 0) continue

    // Map slope to velocity delta: positive slope (improving) → negative delta (slower aging)
    const delta = -signal.normalizedSlope * SLOPE_TO_VELOCITY_FACTOR
    const clampedDelta = Math.max(-MAX_CAPACITY_DEVIATION, Math.min(MAX_CAPACITY_DEVIATION, delta))

    weightedDelta += clampedDelta * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return 1.00
  const velocity = 1.00 + weightedDelta / totalWeight
  return Math.round(velocity * 1000) / 1000
}

/**
 * Compute excess fatigue penalty.
 * Only unexplained fatigue (after load conditioning) penalizes velocity.
 * Athletes with high load but high capacity get minimal penalty.
 */
export function computeExcessFatiguePenalty(
  fatigueSignals: FatigueSignal[],
  capacitySignals: CapacitySignal[]
): number {
  if (fatigueSignals.length === 0) return 0

  // Sum excess fatigue across signals
  const totalExcess = fatigueSignals.reduce((s, f) => s + f.excessFatigue, 0)
  const avgExcess = totalExcess / fatigueSignals.length

  if (avgExcess <= 0) return 0

  // High-capacity deadband: if capacity is improving, dampen fatigue penalty
  const improvingCount = capacitySignals.filter(s =>
    s.trendDirection === 'improving' && s.confidence >= 0.3
  ).length
  const deadbandFactor = improvingCount >= 2 ? 0.3 : improvingCount === 1 ? 0.6 : 1.0

  // Convert excess fatigue % to velocity penalty
  // 5% excess fatigue → 0.025 velocity penalty (halved by deadband if capacity improving)
  const rawPenalty = (avgExcess / 100) * 0.5 * deadbandFactor
  return Math.round(Math.min(rawPenalty, MAX_FATIGUE_PENALTY) * 1000) / 1000
}

/**
 * Compute per-system velocities.
 */
export function computeSystemVelocities(
  capacitySignals: CapacitySignal[],
  fatigueSignals: FatigueSignal[],
  labScores: Array<{ biomarkerKey: string; score: number }> | null,
  labRecencyDays: number
): Record<string, SystemVelocityDetail> {
  const result: Record<string, SystemVelocityDetail> = {}

  for (const [system, config] of Object.entries(SYSTEM_SIGNAL_MAP)) {
    // Capacity component from this system's metrics
    let capacityComponent = 0
    let capacityWeight = 0
    let dominantSignal: string | null = null
    let maxMagnitude = 0

    for (const { metric, weight } of config.capacityMetrics) {
      const signal = capacitySignals.find(s => s.metric === metric)
      if (!signal) continue

      const delta = -signal.normalizedSlope * SLOPE_TO_VELOCITY_FACTOR
      const clamped = Math.max(-MAX_CAPACITY_DEVIATION, Math.min(MAX_CAPACITY_DEVIATION, delta))
      capacityComponent += clamped * weight * signal.confidence
      capacityWeight += weight * signal.confidence

      if (Math.abs(clamped * weight * signal.confidence) > maxMagnitude) {
        maxMagnitude = Math.abs(clamped * weight * signal.confidence)
        dominantSignal = metric
      }
    }

    if (capacityWeight > 0) {
      capacityComponent = capacityComponent / capacityWeight
    }

    // Lab component
    const labModulation = computeLabModulation(labScores, labRecencyDays, config.labMarkers)

    // Fatigue component (shared across systems, not per-system)
    const fatigueComponent = computeExcessFatiguePenalty(fatigueSignals, capacitySignals)

    // Blend: capacity + lab, weighted by labWeight and data availability
    const hasCapacity = capacityWeight > 0
    const hasLab = labScores && config.labMarkers.some(m => labScores.find(l => l.biomarkerKey === m))

    let labFreshness = 0
    if (labRecencyDays <= 14) labFreshness = 1.0
    else if (labRecencyDays <= 30) labFreshness = 0.85
    else if (labRecencyDays <= 60) labFreshness = 0.7
    else if (labRecencyDays <= 90) labFreshness = 0.5
    else if (labRecencyDays <= 180) labFreshness = 0.3
    else labFreshness = 0.15

    let systemVelocity: number
    const effectiveLabWeight = hasLab ? config.labWeight * labFreshness : 0

    if (hasCapacity && hasLab) {
      const capVel = 1.00 + capacityComponent
      const labVel = 1.00 + labModulation
      systemVelocity = capVel * (1 - effectiveLabWeight) + labVel * effectiveLabWeight
    } else if (hasCapacity) {
      systemVelocity = 1.00 + capacityComponent
    } else if (hasLab) {
      systemVelocity = 1.00 + labModulation
    } else {
      systemVelocity = 1.00 // neutral
    }

    // Add fatigue penalty (small, shared)
    systemVelocity += fatigueComponent * 0.5 // per-system gets half the overall fatigue penalty

    // Confidence: from capacity signal confidence and lab availability
    const avgCapConf = capacityWeight > 0 ? capacityWeight / config.capacityMetrics.length : 0
    const labConf = hasLab ? 0.3 * labFreshness : 0
    const confidence = Math.min(1, avgCapConf + labConf)

    // Trend from dominant capacity signal
    const dominantCapacity = dominantSignal
      ? capacitySignals.find(s => s.metric === dominantSignal)
      : null
    const trendDirection = dominantCapacity?.trendDirection ?? 'stable'

    result[system] = {
      system,
      velocity: Math.round(Math.max(VELOCITY_V3_MIN, Math.min(VELOCITY_V3_MAX, systemVelocity)) * 100) / 100,
      capacityComponent: Math.round(capacityComponent * 1000) / 1000,
      fatigueComponent: Math.round(fatigueComponent * 1000) / 1000,
      labComponent: Math.round(labModulation * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      dominantSignal,
      trendDirection,
    }
  }

  return result
}

// ─── Phase 6: Explainability ──────────────────────────────────────────────

export function buildExplainability(
  capacitySignals: CapacitySignal[],
  fatigueSignals: FatigueSignal[],
  capacityVelocity: number,
  excessPenalty: number,
  labModulation: number,
  constraintApplied: boolean,
  constraintReason: string | null
): VelocityExplanation {
  // Determine dominant factor
  const capMagnitude = Math.abs(capacityVelocity - 1.00)
  const fatMagnitude = excessPenalty
  const labMagnitude = Math.abs(labModulation)

  let dominantFactor: VelocityExplanation['dominantFactor'] = 'insufficient_data'
  if (capMagnitude === 0 && fatMagnitude === 0 && labMagnitude === 0) {
    dominantFactor = 'insufficient_data'
  } else if (capMagnitude >= fatMagnitude && capMagnitude >= labMagnitude) {
    dominantFactor = 'capacity'
  } else if (fatMagnitude >= capMagnitude && fatMagnitude >= labMagnitude) {
    dominantFactor = 'fatigue'
  } else {
    dominantFactor = 'labs'
  }

  // Capacity narrative
  const improvingSignals = capacitySignals.filter(s => s.trendDirection === 'improving' && s.confidence >= 0.3)
  const decliningSignals = capacitySignals.filter(s => s.trendDirection === 'declining' && s.confidence >= 0.3)
  let capacityNarrative: string
  if (improvingSignals.length > 0 && decliningSignals.length === 0) {
    const names = improvingSignals.map(s => s.metric.replace(/_/g, ' ')).join(', ')
    capacityNarrative = `Structural health improving: ${names} trending up over ${improvingSignals[0].windowDays}+ days`
  } else if (decliningSignals.length > 0 && improvingSignals.length === 0) {
    const names = decliningSignals.map(s => s.metric.replace(/_/g, ' ')).join(', ')
    capacityNarrative = `Structural health declining: ${names} trending down`
  } else if (improvingSignals.length > 0 && decliningSignals.length > 0) {
    capacityNarrative = `Mixed capacity signals: ${improvingSignals.length} improving, ${decliningSignals.length} declining`
  } else {
    capacityNarrative = 'Insufficient capacity data for trend detection'
  }

  // Fatigue narrative
  const excessFatigueSignals = fatigueSignals.filter(f => f.excessFatigue > 0)
  let fatigueNarrative: string
  if (excessFatigueSignals.length === 0) {
    fatigueNarrative = 'All fatigue signals within expected range for current training load'
  } else {
    const names = excessFatigueSignals.map(f => f.metric.replace(/_/g, ' ')).join(', ')
    fatigueNarrative = `Unexplained fatigue in ${names} (beyond training load expectations)`
  }

  // Top contributors
  const contributors: VelocityExplanation['topContributors'] = []
  for (const signal of capacitySignals) {
    if (Math.abs(signal.normalizedSlope) < 0.5 || signal.confidence < 0.2) continue
    const name = signal.metric.replace(/_/g, ' ')
    contributors.push({
      signal: signal.metric,
      direction: signal.trendDirection === 'improving' ? 'helping' : 'hurting',
      magnitude: Math.abs(signal.normalizedSlope * SLOPE_TO_VELOCITY_FACTOR * signal.confidence),
      explanation: `${name} ${signal.trendDirection === 'improving' ? 'improving' : 'declining'} ${Math.abs(signal.normalizedSlope).toFixed(1)}%/28d`,
    })
  }
  contributors.sort((a, b) => b.magnitude - a.magnitude)

  return {
    dominantFactor,
    capacityNarrative,
    fatigueNarrative,
    constraintNarrative: constraintApplied ? constraintReason : null,
    topContributors: contributors.slice(0, 5),
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────

/**
 * Compute aging velocity v3: capacity-first, load-conditioned.
 *
 * Pipeline:
 *   1. Capacity velocity from signal slopes (DOMINANT)
 *   2. Excess fatigue penalty (load-conditioned, SMALL)
 *   3. Lab modulation
 *   4. Hard constraints (improving capacity → velocity ≤ 1.00)
 *   5. Bayesian shrinkage (less data → pull toward 1.00)
 *   6. Safety bounds [0.75, 1.35]
 */
export function computeVelocityV3(input: VelocityModelInput): VelocityModelOutput {
  const { capacitySignals, fatigueSignals, loadSignals, labScores, labRecencyDays } = input

  // Step 1: Capacity-derived velocity
  const capacityVelocity = computeCapacityVelocity(capacitySignals)

  // Step 2: Excess fatigue penalty
  const excessPenalty = computeExcessFatiguePenalty(fatigueSignals, capacitySignals)

  // Step 3: Lab modulation (overall, all markers)
  const labMod = computeLabModulation(labScores, labRecencyDays)

  // Step 4: Combine
  const rawVelocity = capacityVelocity + excessPenalty + labMod

  // Step 5: Hard constraints
  const constrained = applyHardConstraints(rawVelocity, capacitySignals)
  const preShrinkageVelocity = constrained.velocity

  // Step 6: Bayesian shrinkage
  const completeness = computeSignalCompleteness(capacitySignals, fatigueSignals, labScores)
  const shrunk = applyShrinkage(constrained.velocity, completeness)

  // Step 7: Safety bounds
  const overallVelocity = Math.round(
    Math.max(VELOCITY_V3_MIN, Math.min(VELOCITY_V3_MAX, shrunk.velocity)) * 100
  ) / 100

  // Per-system velocities
  const systemVelocities = computeSystemVelocities(
    capacitySignals, fatigueSignals, labScores, labRecencyDays
  )

  // Explainability
  const explainability = buildExplainability(
    capacitySignals, fatigueSignals,
    capacityVelocity, excessPenalty, labMod,
    constrained.applied, constrained.reason
  )

  return {
    overallVelocity,
    capacityVelocity: Math.round(capacityVelocity * 1000) / 1000,
    excessFatiguePenalty: excessPenalty,
    labModulation: Math.round(labMod * 1000) / 1000,
    hardConstraintApplied: constrained.applied,
    hardConstraintReason: constrained.reason,
    shrinkageFactor: shrunk.shrinkageFactor,
    preShrinkageVelocity: Math.round(preShrinkageVelocity * 1000) / 1000,
    systemVelocities,
    explainability,
  }
}
