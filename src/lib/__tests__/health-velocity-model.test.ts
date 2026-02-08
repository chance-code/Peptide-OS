import { describe, it, expect } from 'vitest'
import {
  linearRegression,
  computeCapacitySignals,
  computeLoadSignals,
  computeFatigueSignals,
  computeLabModulation,
  applyHardConstraints,
  applyShrinkage,
  computeSignalCompleteness,
  computeCapacityVelocity,
  computeExcessFatiguePenalty,
  computeSystemVelocities,
  computeVelocityV3,
  buildExplainability,
  VELOCITY_V3_MIN,
  VELOCITY_V3_MAX,
  type CapacitySignal,
  type FatigueSignal,
  type LoadSignal,
  type VelocityModelInput,
} from '../health-velocity-model'

// ─── Test Helpers ──────────────────────────────────────────────────────────

/** Generate daily values with a linear trend */
function generateTrend(
  startValue: number,
  slopePerDay: number,
  days: number,
  noise: number = 0,
  startDate: string = '2025-08-01'
): Array<{ date: string; value: number }> {
  const start = new Date(startDate)
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const value = startValue + slopePerDay * i + (noise > 0 ? (Math.random() - 0.5) * noise : 0)
    return {
      date: date.toISOString().slice(0, 10),
      value: Math.round(value * 100) / 100,
    }
  })
}

/** Generate flat (stable) daily values */
function generateFlat(value: number, days: number, startDate: string = '2025-08-01') {
  return generateTrend(value, 0, days, 0, startDate)
}

const POLARITY_MAP: Record<string, string> = {
  vo2_max: 'higher_better',
  body_fat_percentage: 'lower_better',
  lean_body_mass: 'higher_better',
  muscle_mass: 'higher_better',
  hrv: 'higher_better',
  rhr: 'lower_better',
  sleep_score: 'higher_better',
  readiness_score: 'higher_better',
  deep_sleep: 'higher_better',
  exercise_minutes: 'higher_better',
  active_calories: 'higher_better',
  steps: 'higher_better',
  weight: 'neutral',
}

// ─── Linear Regression Tests ───────────────────────────────────────────────

describe('linearRegression', () => {
  it('computes perfect positive slope', () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]
    const { slope, r2 } = linearRegression(points)
    expect(slope).toBeCloseTo(1.0)
    expect(r2).toBeCloseTo(1.0)
  })

  it('computes perfect negative slope', () => {
    const points = [{ x: 0, y: 10 }, { x: 1, y: 8 }, { x: 2, y: 6 }, { x: 3, y: 4 }]
    const { slope, r2 } = linearRegression(points)
    expect(slope).toBeCloseTo(-2.0)
    expect(r2).toBeCloseTo(1.0)
  })

  it('returns zero slope for flat data', () => {
    const points = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }]
    const { slope } = linearRegression(points)
    expect(slope).toBeCloseTo(0)
  })

  it('handles single point', () => {
    const { slope, r2 } = linearRegression([{ x: 0, y: 5 }])
    expect(slope).toBe(0)
    expect(r2).toBe(0)
  })

  it('handles empty array', () => {
    const { slope, r2 } = linearRegression([])
    expect(slope).toBe(0)
    expect(r2).toBe(0)
  })

  it('R² is low for noisy data', () => {
    const points = [
      { x: 0, y: 10 }, { x: 1, y: 2 }, { x: 2, y: 15 },
      { x: 3, y: 1 }, { x: 4, y: 12 },
    ]
    const { r2 } = linearRegression(points)
    expect(r2).toBeLessThan(0.3)
  })
})

// ─── Capacity Signal Tests ─────────────────────────────────────────────────

describe('computeCapacitySignals', () => {
  it('detects improving VO2 max', () => {
    // VO2 max going from 42 to 44 over 56 days (~0.036/day)
    const data = new Map([
      ['vo2_max', generateTrend(42, 0.036, 56)],
    ])
    const signals = computeCapacitySignals(data, POLARITY_MAP)
    const vo2 = signals.find(s => s.metric === 'vo2_max')
    expect(vo2).toBeDefined()
    expect(vo2!.normalizedSlope).toBeGreaterThan(0) // positive = improving (higher_better)
    expect(vo2!.trendDirection).toBe('improving')
  })

  it('detects declining body fat (good — improving for lower_better)', () => {
    // Body fat going from 18% to 16% over 56 days
    const data = new Map([
      ['body_fat_percentage', generateTrend(18, -0.036, 56)],
    ])
    const signals = computeCapacitySignals(data, POLARITY_MAP)
    const bf = signals.find(s => s.metric === 'body_fat_percentage')
    expect(bf).toBeDefined()
    expect(bf!.normalizedSlope).toBeGreaterThan(0) // positive because polarity-corrected
    expect(bf!.trendDirection).toBe('improving')
  })

  it('detects declining HRV (bad — declining for higher_better)', () => {
    // HRV going from 55 to 45 over 28 days
    const data = new Map([
      ['hrv', generateTrend(55, -0.357, 28)],
    ])
    const signals = computeCapacitySignals(data, POLARITY_MAP)
    const hrv = signals.find(s => s.metric === 'hrv')
    expect(hrv).toBeDefined()
    expect(hrv!.normalizedSlope).toBeLessThan(0) // negative = declining
    expect(hrv!.trendDirection).toBe('declining')
  })

  it('reports stable for flat data', () => {
    const data = new Map([
      ['vo2_max', generateFlat(45, 56)],
    ])
    const signals = computeCapacitySignals(data, POLARITY_MAP)
    const vo2 = signals.find(s => s.metric === 'vo2_max')
    expect(vo2).toBeDefined()
    expect(vo2!.trendDirection).toBe('stable')
    expect(Math.abs(vo2!.normalizedSlope)).toBeLessThan(1)
  })

  it('skips metrics with insufficient data', () => {
    const data = new Map([
      ['vo2_max', generateFlat(45, 3)], // only 3 data points
    ])
    const signals = computeCapacitySignals(data, POLARITY_MAP)
    expect(signals.length).toBe(0)
  })

  it('confidence increases with longer windows', () => {
    const shortData = new Map([['vo2_max', generateTrend(42, 0.03, 25)]])
    const longData = new Map([['vo2_max', generateTrend(42, 0.03, 65)]])

    const shortSignals = computeCapacitySignals(shortData, POLARITY_MAP)
    const longSignals = computeCapacitySignals(longData, POLARITY_MAP)

    expect(shortSignals.length).toBeGreaterThan(0)
    expect(longSignals.length).toBeGreaterThan(0)
    expect(longSignals[0].confidence).toBeGreaterThan(shortSignals[0].confidence)
  })
})

// ─── Load Signal Tests ────────────────────────────────────────────────────

describe('computeLoadSignals', () => {
  it('detects higher training load', () => {
    // 28 days of 30min/day, then 7 days of 60min/day
    const values = [
      ...generateFlat(30, 21, '2025-08-01'),
      ...generateFlat(60, 7, '2025-08-22'),
    ]
    const data = new Map([['exercise_minutes', values]])
    const signals = computeLoadSignals(data)
    const ex = signals.find(s => s.metric === 'exercise_minutes')
    expect(ex).toBeDefined()
    expect(ex!.loadRatio).toBeGreaterThan(1.0) // recent > baseline
  })

  it('detects reduced training load', () => {
    const values = [
      ...generateFlat(60, 21, '2025-08-01'),
      ...generateFlat(20, 7, '2025-08-22'),
    ]
    const data = new Map([['exercise_minutes', values]])
    const signals = computeLoadSignals(data)
    const ex = signals.find(s => s.metric === 'exercise_minutes')
    expect(ex).toBeDefined()
    expect(ex!.loadRatio).toBeLessThan(1.0)
  })

  it('reports ratio ~1.0 for stable load', () => {
    const data = new Map([['exercise_minutes', generateFlat(45, 28)]])
    const signals = computeLoadSignals(data)
    const ex = signals.find(s => s.metric === 'exercise_minutes')
    expect(ex).toBeDefined()
    expect(ex!.loadRatio).toBeCloseTo(1.0, 1)
  })
})

// ─── Fatigue Signal Tests ─────────────────────────────────────────────────

describe('computeFatigueSignals', () => {
  it('reports zero excess when fatigue matches load', () => {
    // HRV baseline 55, recent 3 days slightly lower (normal for high training)
    const hrv = [
      ...generateFlat(55, 14, '2025-08-01'),
      ...generateFlat(50, 3, '2025-08-15'),
    ]
    const load: LoadSignal[] = [
      { metric: 'exercise_minutes', recentValue: 60, baselineValue: 30, loadRatio: 2.0 },
    ]
    const capacity: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 2.0, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const data = new Map([['hrv', hrv]])
    const signals = computeFatigueSignals(data, load, capacity, POLARITY_MAP)
    const hrvFatigue = signals.find(s => s.metric === 'hrv')
    expect(hrvFatigue).toBeDefined()
    // High load explains the fatigue, so excess should be low
    expect(hrvFatigue!.excessFatigue).toBeLessThan(5)
  })

  it('reports high excess when fatigued with no load explanation', () => {
    // HRV baseline 55, recent 3 days much lower, but NO increased training
    const hrv = [
      ...generateFlat(55, 14, '2025-08-01'),
      ...generateFlat(40, 3, '2025-08-15'),
    ]
    const load: LoadSignal[] = [
      { metric: 'exercise_minutes', recentValue: 30, baselineValue: 30, loadRatio: 1.0 },
    ]
    const capacity: CapacitySignal[] = []
    const data = new Map([['hrv', hrv]])
    const signals = computeFatigueSignals(data, load, capacity, POLARITY_MAP)
    const hrvFatigue = signals.find(s => s.metric === 'hrv')
    expect(hrvFatigue).toBeDefined()
    // No load explanation → excess fatigue should be notable
    expect(hrvFatigue!.excessFatigue).toBeGreaterThan(0)
  })

  it('handles RHR polarity correctly (lower_better)', () => {
    // RHR baseline 58, recent 3 days higher (65) = more fatigued
    const rhr = [
      ...generateFlat(58, 14, '2025-08-01'),
      ...generateFlat(65, 3, '2025-08-15'),
    ]
    const data = new Map([['rhr', rhr]])
    const signals = computeFatigueSignals(data, [], [], POLARITY_MAP)
    const rhrFatigue = signals.find(s => s.metric === 'rhr')
    expect(rhrFatigue).toBeDefined()
    // RHR going up (bad) → deviation should be negative (more fatigued)
    expect(rhrFatigue!.deviation).toBeLessThan(0)
  })
})

// ─── Lab Modulation Tests ─────────────────────────────────────────────────

describe('computeLabModulation', () => {
  it('returns negative delta for good labs (score > 70)', () => {
    const labs = [
      { biomarkerKey: 'ldl_cholesterol', score: 85 },
      { biomarkerKey: 'hs_crp', score: 90 },
    ]
    const mod = computeLabModulation(labs, 7)
    expect(mod).toBeLessThan(0) // good labs → push velocity down
  })

  it('returns positive delta for poor labs (score < 70)', () => {
    const labs = [
      { biomarkerKey: 'ldl_cholesterol', score: 40 },
      { biomarkerKey: 'hs_crp', score: 30 },
    ]
    const mod = computeLabModulation(labs, 7)
    expect(mod).toBeGreaterThan(0)
  })

  it('returns zero for neutral labs (score = 70)', () => {
    const labs = [{ biomarkerKey: 'hs_crp', score: 70 }]
    const mod = computeLabModulation(labs, 7)
    expect(mod).toBe(0)
  })

  it('decays with recency', () => {
    const labs = [{ biomarkerKey: 'hs_crp', score: 90 }]
    const fresh = computeLabModulation(labs, 7)
    const old = computeLabModulation(labs, 120)
    expect(Math.abs(fresh)).toBeGreaterThan(Math.abs(old))
  })

  it('returns 0 for null labs', () => {
    expect(computeLabModulation(null, 7)).toBe(0)
  })

  it('filters to specified markers', () => {
    const labs = [
      { biomarkerKey: 'hs_crp', score: 90 },
      { biomarkerKey: 'ldl_cholesterol', score: 30 },
    ]
    const filtered = computeLabModulation(labs, 7, ['hs_crp'])
    expect(filtered).toBeLessThan(0) // only sees good hs_crp
  })
})

// ─── Hard Constraint Tests ────────────────────────────────────────────────

describe('applyHardConstraints', () => {
  it('caps velocity at 1.00 when VO2 max improving', () => {
    const signals: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 2.0, confidence: 0.7, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const result = applyHardConstraints(1.05, signals)
    expect(result.velocity).toBeLessThanOrEqual(1.00)
    expect(result.applied).toBe(true)
    expect(result.reason).toContain('VO2 max improving')
  })

  it('caps velocity when body fat declining', () => {
    const signals: CapacitySignal[] = [
      { metric: 'body_fat_percentage', normalizedSlope: 1.5, confidence: 0.6, windowDays: 30, dataPoints: 25, trendDirection: 'improving' },
    ]
    const result = applyHardConstraints(1.03, signals)
    expect(result.velocity).toBeLessThanOrEqual(1.00)
    expect(result.applied).toBe(true)
  })

  it('does NOT fire when lean mass is declining alongside body fat', () => {
    const signals: CapacitySignal[] = [
      { metric: 'body_fat_percentage', normalizedSlope: 1.0, confidence: 0.5, windowDays: 30, dataPoints: 25, trendDirection: 'improving' },
      { metric: 'lean_body_mass', normalizedSlope: -1.0, confidence: 0.5, windowDays: 30, dataPoints: 25, trendDirection: 'declining' },
    ]
    // Gate 2 should NOT fire (lean mass declining)
    // But no other gates fire either
    const result = applyHardConstraints(1.03, signals)
    // Body fat declining + lean mass declining = lean mass IS declining, so gate 2 doesn't fire
    expect(result.applied).toBe(false)
  })

  it('does NOT fire when velocity already ≤ 1.00', () => {
    const signals: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 3.0, confidence: 0.9, windowDays: 60, dataPoints: 55, trendDirection: 'improving' },
    ]
    const result = applyHardConstraints(0.95, signals)
    expect(result.velocity).toBe(0.95) // unchanged
    expect(result.applied).toBe(false)
  })

  it('does NOT fire with insufficient confidence', () => {
    const signals: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 2.0, confidence: 0.1, windowDays: 56, dataPoints: 10, trendDirection: 'improving' },
    ]
    const result = applyHardConstraints(1.05, signals)
    expect(result.applied).toBe(false)
  })

  it('does NOT fire with too short window', () => {
    const signals: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 3.0, confidence: 0.8, windowDays: 10, dataPoints: 10, trendDirection: 'improving' },
    ]
    const result = applyHardConstraints(1.05, signals)
    expect(result.applied).toBe(false)
  })
})

// ─── Bayesian Shrinkage Tests ─────────────────────────────────────────────

describe('applyShrinkage', () => {
  it('no shrinkage at full completeness', () => {
    const result = applyShrinkage(0.92, 1.0)
    expect(result.velocity).toBeCloseTo(0.92)
    expect(result.shrinkageFactor).toBe(1.0)
  })

  it('full shrinkage to neutral at zero completeness', () => {
    const result = applyShrinkage(0.85, 0)
    expect(result.velocity).toBeCloseTo(1.00)
    expect(result.shrinkageFactor).toBe(0)
  })

  it('half shrinkage at 50% completeness', () => {
    const result = applyShrinkage(0.90, 0.5)
    // velocity = 1.00 + (0.90 - 1.00) * 0.5 = 1.00 - 0.05 = 0.95
    expect(result.velocity).toBeCloseTo(0.95)
  })

  it('shrinks high velocity toward 1.00', () => {
    const result = applyShrinkage(1.15, 0.5)
    // velocity = 1.00 + (1.15 - 1.00) * 0.5 = 1.00 + 0.075 = 1.075
    expect(result.velocity).toBeCloseTo(1.075)
  })
})

// ─── Capacity Velocity Tests ──────────────────────────────────────────────

describe('computeCapacityVelocity', () => {
  it('returns 1.00 for no signals', () => {
    expect(computeCapacityVelocity([])).toBe(1.00)
  })

  it('returns < 1.00 for improving signals', () => {
    const signals: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 2.0, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
      { metric: 'body_fat_percentage', normalizedSlope: 1.5, confidence: 0.7, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const v = computeCapacityVelocity(signals)
    expect(v).toBeLessThan(1.00)
  })

  it('returns > 1.00 for declining signals', () => {
    const signals: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: -2.0, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'declining' },
      { metric: 'hrv', normalizedSlope: -1.5, confidence: 0.7, windowDays: 28, dataPoints: 25, trendDirection: 'declining' },
    ]
    const v = computeCapacityVelocity(signals)
    expect(v).toBeGreaterThan(1.00)
  })
})

// ─── Excess Fatigue Penalty Tests ─────────────────────────────────────────

describe('computeExcessFatiguePenalty', () => {
  it('returns 0 when no excess fatigue', () => {
    const fatigue: FatigueSignal[] = [
      { metric: 'hrv', deviation: -5, expectedDeviation: -10, excessFatigue: 0 },
    ]
    expect(computeExcessFatiguePenalty(fatigue, [])).toBe(0)
  })

  it('returns penalty for excess fatigue', () => {
    const fatigue: FatigueSignal[] = [
      { metric: 'hrv', deviation: -15, expectedDeviation: -5, excessFatigue: 10 },
    ]
    const penalty = computeExcessFatiguePenalty(fatigue, [])
    expect(penalty).toBeGreaterThan(0)
    expect(penalty).toBeLessThanOrEqual(0.05) // capped
  })

  it('applies high-capacity deadband (reduces penalty when capacity improving)', () => {
    const fatigue: FatigueSignal[] = [
      { metric: 'hrv', deviation: -15, expectedDeviation: -5, excessFatigue: 10 },
    ]
    const capacity: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 2.0, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
      { metric: 'body_fat_percentage', normalizedSlope: 1.5, confidence: 0.7, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const penaltyWithCapacity = computeExcessFatiguePenalty(fatigue, capacity)
    const penaltyWithout = computeExcessFatiguePenalty(fatigue, [])
    expect(penaltyWithCapacity).toBeLessThan(penaltyWithout)
  })
})

// ─── Full Pipeline Validation Tests ───────────────────────────────────────

describe('computeVelocityV3 — validation scenarios', () => {
  /**
   * SCENARIO 1: Lean, strong, improving athlete with training fatigue
   * This is THE failure case. The user described:
   *   - 43M, lean, strong, highly active, improving
   *   - Training causes HRV depression and sleep disruption
   *   - Old model: 1.03x (WRONG)
   *   - New model: MUST be ≤ 1.00
   */
  it('Scenario 1: improving athlete MUST get velocity ≤ 1.00', () => {
    const input: VelocityModelInput = {
      capacitySignals: [
        // VO2 max improving 2%/28d
        { metric: 'vo2_max', normalizedSlope: 2.0, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
        // Body fat declining 1.5%/28d (improving for lower_better)
        { metric: 'body_fat_percentage', normalizedSlope: 1.5, confidence: 0.7, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
        // Lean mass improving 0.5%/28d
        { metric: 'lean_body_mass', normalizedSlope: 0.5, confidence: 0.6, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
        // HRV trend stable-to-improving (28-day mean going up)
        { metric: 'hrv', normalizedSlope: 1.0, confidence: 0.5, windowDays: 28, dataPoints: 25, trendDirection: 'improving' },
        // RHR trend improving (going down, polarity-corrected)
        { metric: 'rhr', normalizedSlope: 0.8, confidence: 0.5, windowDays: 28, dataPoints: 25, trendDirection: 'improving' },
        // Sleep score stable
        { metric: 'sleep_score', normalizedSlope: 0.3, confidence: 0.4, windowDays: 28, dataPoints: 25, trendDirection: 'stable' },
      ],
      fatigueSignals: [
        // HRV is depressed day-to-day from training, but load explains it
        { metric: 'hrv', deviation: -12, expectedDeviation: -15, excessFatigue: 0 },
        // Sleep slightly disrupted
        { metric: 'sleep_score', deviation: -5, expectedDeviation: -3, excessFatigue: 2 },
        // Readiness low (training effect)
        { metric: 'readiness_score', deviation: -8, expectedDeviation: -10, excessFatigue: 0 },
      ],
      loadSignals: [
        { metric: 'exercise_minutes', recentValue: 60, baselineValue: 40, loadRatio: 1.5 },
        { metric: 'active_calories', recentValue: 800, baselineValue: 550, loadRatio: 1.45 },
      ],
      labScores: [
        { biomarkerKey: 'total_testosterone', score: 75 },
        { biomarkerKey: 'hs_crp', score: 85 },
        { biomarkerKey: 'hba1c', score: 80 },
      ],
      labRecencyDays: 10,
    }

    const result = computeVelocityV3(input)

    // THE CRITICAL ASSERTION: improving athlete must get ≤ 1.00
    expect(result.overallVelocity).toBeLessThanOrEqual(1.00)

    // Capacity should be driving velocity down
    expect(result.capacityVelocity).toBeLessThan(1.00)

    // Fatigue penalty should be small (load explains most of it)
    expect(result.excessFatiguePenalty).toBeLessThan(0.03)

    // Either capacity already drives velocity below 1.00, or hard constraint fires
    // (hard constraint only fires when velocity would exceed 1.00)
    if (result.overallVelocity >= 0.99) {
      // Close to 1.00 — constraint may or may not have fired
    } else {
      // Well below 1.00 — capacity alone drove it down
      expect(result.capacityVelocity).toBeLessThan(0.99)
    }

    // Explainability should identify capacity as dominant
    expect(result.explainability.dominantFactor).toBe('capacity')
  })

  /**
   * SCENARIO 2: Sedentary person declining
   * - Low activity, increasing body fat, declining HRV
   * - Velocity should be > 1.00 (aging faster than calendar)
   */
  it('Scenario 2: declining sedentary person gets velocity > 1.00', () => {
    const input: VelocityModelInput = {
      capacitySignals: [
        { metric: 'vo2_max', normalizedSlope: -1.5, confidence: 0.7, windowDays: 56, dataPoints: 40, trendDirection: 'declining' },
        { metric: 'body_fat_percentage', normalizedSlope: -2.0, confidence: 0.6, windowDays: 56, dataPoints: 40, trendDirection: 'declining' },
        { metric: 'hrv', normalizedSlope: -1.0, confidence: 0.5, windowDays: 28, dataPoints: 20, trendDirection: 'declining' },
        { metric: 'rhr', normalizedSlope: -0.8, confidence: 0.5, windowDays: 28, dataPoints: 20, trendDirection: 'declining' },
      ],
      fatigueSignals: [
        { metric: 'hrv', deviation: -3, expectedDeviation: 0, excessFatigue: 3 },
        { metric: 'sleep_score', deviation: -4, expectedDeviation: 0, excessFatigue: 4 },
      ],
      loadSignals: [
        { metric: 'exercise_minutes', recentValue: 10, baselineValue: 15, loadRatio: 0.67 },
      ],
      labScores: [
        { biomarkerKey: 'fasting_glucose', score: 50 },
        { biomarkerKey: 'hba1c', score: 55 },
        { biomarkerKey: 'hs_crp', score: 45 },
      ],
      labRecencyDays: 20,
    }

    const result = computeVelocityV3(input)

    expect(result.overallVelocity).toBeGreaterThan(1.00)
    expect(result.capacityVelocity).toBeGreaterThan(1.00)
    expect(result.hardConstraintApplied).toBe(false)
  })

  /**
   * SCENARIO 3: New user with minimal data
   * - Only a few days of wearable data, no labs
   * - Bayesian shrinkage should pull toward 1.00
   */
  it('Scenario 3: sparse data shrinks toward neutral (1.00)', () => {
    const input: VelocityModelInput = {
      capacitySignals: [
        // Only 14 days of VO2 data, marginal confidence
        { metric: 'vo2_max', normalizedSlope: 3.0, confidence: 0.2, windowDays: 14, dataPoints: 10, trendDirection: 'improving' },
      ],
      fatigueSignals: [],
      loadSignals: [],
      labScores: null,
      labRecencyDays: 999,
    }

    const result = computeVelocityV3(input)

    // Shrinkage should pull heavily toward 1.00
    expect(result.shrinkageFactor).toBeLessThan(0.5)
    // Final velocity should be close to neutral
    expect(result.overallVelocity).toBeGreaterThan(0.96)
    expect(result.overallVelocity).toBeLessThan(1.04)
  })

  /**
   * SCENARIO 4: Good labs but poor wearable signals
   * - Lab data shows excellent biomarkers
   * - Wearable data shows fatigue (but person is healthy)
   * - Labs should stabilize the velocity, not dominated by fatigue
   */
  it('Scenario 4: good labs stabilize velocity despite wearable fatigue', () => {
    const input: VelocityModelInput = {
      capacitySignals: [
        { metric: 'hrv', normalizedSlope: -0.5, confidence: 0.4, windowDays: 21, dataPoints: 18, trendDirection: 'stable' },
      ],
      fatigueSignals: [
        { metric: 'hrv', deviation: -10, expectedDeviation: 0, excessFatigue: 10 },
        { metric: 'sleep_score', deviation: -8, expectedDeviation: 0, excessFatigue: 8 },
      ],
      loadSignals: [],
      labScores: [
        { biomarkerKey: 'hs_crp', score: 92 },
        { biomarkerKey: 'apolipoprotein_b', score: 88 },
        { biomarkerKey: 'fasting_glucose', score: 85 },
        { biomarkerKey: 'hba1c', score: 90 },
        { biomarkerKey: 'total_testosterone', score: 82 },
        { biomarkerKey: 'vitamin_d', score: 78 },
      ],
      labRecencyDays: 5,
    }

    const result = computeVelocityV3(input)

    // Good labs should push velocity down, counteracting fatigue
    expect(result.labModulation).toBeLessThan(0)
    // Overall should not be dramatically above 1.00
    expect(result.overallVelocity).toBeLessThan(1.10)
  })
})

// ─── Failure Condition (Non-Negotiable) ───────────────────────────────────

describe('failure condition', () => {
  it('lean, strong, improving user CANNOT get velocity > 1.00 under ANY normal training', () => {
    // Even with extreme training fatigue, if capacity is improving, velocity ≤ 1.00
    const input: VelocityModelInput = {
      capacitySignals: [
        { metric: 'vo2_max', normalizedSlope: 1.0, confidence: 0.5, windowDays: 28, dataPoints: 25, trendDirection: 'improving' },
        { metric: 'body_fat_percentage', normalizedSlope: 0.5, confidence: 0.4, windowDays: 28, dataPoints: 20, trendDirection: 'stable' },
      ],
      fatigueSignals: [
        // Massive training fatigue
        { metric: 'hrv', deviation: -25, expectedDeviation: -10, excessFatigue: 15 },
        { metric: 'sleep_score', deviation: -15, expectedDeviation: -5, excessFatigue: 10 },
        { metric: 'readiness_score', deviation: -20, expectedDeviation: -8, excessFatigue: 12 },
        { metric: 'rhr', deviation: -10, expectedDeviation: -3, excessFatigue: 7 },
        { metric: 'deep_sleep', deviation: -12, expectedDeviation: -4, excessFatigue: 8 },
      ],
      loadSignals: [
        { metric: 'exercise_minutes', recentValue: 90, baselineValue: 40, loadRatio: 2.25 },
      ],
      labScores: null,
      labRecencyDays: 999,
    }

    const result = computeVelocityV3(input)

    // HARD CONSTRAINT: VO2 improving → velocity MUST NOT exceed 1.00
    expect(result.overallVelocity).toBeLessThanOrEqual(1.00)
    expect(result.hardConstraintApplied).toBe(true)
  })
})

// ─── System Velocities Tests ──────────────────────────────────────────────

describe('computeSystemVelocities', () => {
  it('produces all 7 systems', () => {
    const capacity: CapacitySignal[] = [
      { metric: 'hrv', normalizedSlope: 1.0, confidence: 0.6, windowDays: 28, dataPoints: 25, trendDirection: 'improving' },
      { metric: 'vo2_max', normalizedSlope: 1.5, confidence: 0.7, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const result = computeSystemVelocities(capacity, [], null, 999)
    expect(Object.keys(result)).toHaveLength(7)
    expect(result.cardiovascular).toBeDefined()
    expect(result.fitness).toBeDefined()
    expect(result.hormonal).toBeDefined()
  })

  it('fitness system shows improving when VO2 max improving', () => {
    const capacity: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 2.5, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const result = computeSystemVelocities(capacity, [], null, 999)
    expect(result.fitness.velocity).toBeLessThan(1.00)
    expect(result.fitness.trendDirection).toBe('improving')
  })

  it('hormonal system uses labs (no wearable signals)', () => {
    const labs = [
      { biomarkerKey: 'total_testosterone', score: 85 },
      { biomarkerKey: 'cortisol', score: 80 },
    ]
    const result = computeSystemVelocities([], [], labs, 7)
    expect(result.hormonal.velocity).toBeLessThan(1.00) // good labs
    expect(result.hormonal.labComponent).toBeLessThan(0)
  })
})

// ─── Explainability Tests ─────────────────────────────────────────────────

describe('buildExplainability', () => {
  it('identifies capacity as dominant when it has highest magnitude', () => {
    const capacity: CapacitySignal[] = [
      { metric: 'vo2_max', normalizedSlope: 3.0, confidence: 0.8, windowDays: 56, dataPoints: 50, trendDirection: 'improving' },
    ]
    const result = buildExplainability(capacity, [], 0.92, 0, 0, false, null)
    expect(result.dominantFactor).toBe('capacity')
    expect(result.capacityNarrative).toContain('improving')
  })

  it('reports all fatigue within expected range when no excess', () => {
    const result = buildExplainability([], [], 1.00, 0, 0, false, null)
    expect(result.fatigueNarrative).toContain('within expected range')
  })

  it('includes constraint narrative when applied', () => {
    const result = buildExplainability([], [], 1.00, 0, 0, true, 'VO2 max improving')
    expect(result.constraintNarrative).toContain('VO2 max')
  })
})

// ─── Edge Cases ───────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles completely empty input', () => {
    const input: VelocityModelInput = {
      capacitySignals: [],
      fatigueSignals: [],
      loadSignals: [],
      labScores: null,
      labRecencyDays: 999,
    }
    const result = computeVelocityV3(input)
    // Should shrink to neutral
    expect(result.overallVelocity).toBeCloseTo(1.00)
    expect(result.explainability.dominantFactor).toBe('insufficient_data')
  })

  it('velocity stays within safety bounds', () => {
    // Extreme improving signals
    const input: VelocityModelInput = {
      capacitySignals: [
        { metric: 'vo2_max', normalizedSlope: 10, confidence: 1.0, windowDays: 90, dataPoints: 85, trendDirection: 'improving' },
        { metric: 'body_fat_percentage', normalizedSlope: 10, confidence: 1.0, windowDays: 90, dataPoints: 85, trendDirection: 'improving' },
        { metric: 'lean_body_mass', normalizedSlope: 10, confidence: 1.0, windowDays: 90, dataPoints: 85, trendDirection: 'improving' },
        { metric: 'hrv', normalizedSlope: 10, confidence: 1.0, windowDays: 90, dataPoints: 85, trendDirection: 'improving' },
        { metric: 'rhr', normalizedSlope: 10, confidence: 1.0, windowDays: 90, dataPoints: 85, trendDirection: 'improving' },
        { metric: 'sleep_score', normalizedSlope: 10, confidence: 1.0, windowDays: 90, dataPoints: 85, trendDirection: 'improving' },
      ],
      fatigueSignals: [],
      loadSignals: [],
      labScores: null,
      labRecencyDays: 999,
    }
    const result = computeVelocityV3(input)
    expect(result.overallVelocity).toBeGreaterThanOrEqual(VELOCITY_V3_MIN)
    expect(result.overallVelocity).toBeLessThanOrEqual(VELOCITY_V3_MAX)
  })
})
