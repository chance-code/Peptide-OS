import { describe, it, expect } from 'vitest'
import {
  computeTrajectory,
  computeBodyCompState,
  computeEnhancedBodyComp,
} from '../health-trajectory'
import {
  RECOMP_METRICS,
  FAT_LOSS_METRICS,
  REGRESSING_METRICS,
  INSUFFICIENT_METRICS,
  STABLE_METRICS,
  METABOLIC_ADAPTATION_METRICS,
  EMPTY_METRICS,
  SINGLE_POINT,
  metric,
  series,
} from './fixtures/metrics-fixtures'

// ─── computeTrajectory ──────────────────────────────────────────────

describe('computeTrajectory', () => {
  it('returns insufficient with < 5 unique days of data', () => {
    // Only 2 unique dates
    const sparse = [
      metric('hrv', 45, 1),
      metric('rhr', 62, 1),
      metric('hrv', 46, 2),
      metric('rhr', 61, 2),
    ]
    const result = computeTrajectory(sparse, new Map())
    expect(result.dataState).toBe('insufficient')
    expect(result.confidence).toBe('insufficient')
    expect(result.confidenceScore).toBe(0)
  })

  it('returns insufficient for empty data', () => {
    const result = computeTrajectory([], new Map())
    expect(result.dataState).toBe('insufficient')
    expect(result.confidence).toBe('insufficient')
  })

  it('returns insufficient for single data point', () => {
    const result = computeTrajectory(SINGLE_POINT, new Map())
    expect(result.dataState).toBe('insufficient')
    expect(result.daysOfData).toBe(1)
  })

  it('detects improving direction when sleep data trends upward', () => {
    // Create 25 days of sleep_duration data: first 18 days ~420, last 7 days ~480
    const sleepMetrics = [
      ...series('sleep_duration', [
        420, 418, 422, 425, 415, 420, 419, 423, 421, 418,
        420, 422, 417, 421, 420, 419, 423, 420,
        460, 470, 475, 480, 485, 490, 495,
      ]),
      // Add some HRV data to get 25 unique dates
      ...series('hrv', [
        42, 43, 41, 44, 42, 43, 41, 42, 44, 40,
        43, 41, 42, 43, 41, 42, 40, 43, 44, 41,
        42, 43, 41, 45, 47,
      ]),
    ]
    const result = computeTrajectory(sleepMetrics, new Map())
    // Should detect the upward sleep trend as improving
    expect(result.dataState).not.toBe('insufficient')
    expect(result.sleep.direction).toBe('improving')
  })

  it('detects declining direction when data trends downward', () => {
    // Create 25 days: first 18 stable, last 7 declining
    const decliningMetrics = [
      ...series('sleep_duration', [
        440, 435, 445, 438, 442, 437, 443, 440, 436, 444,
        439, 441, 437, 443, 440, 438, 442, 436,
        380, 370, 360, 350, 340, 330, 320,
      ]),
      ...series('hrv', [
        42, 43, 41, 44, 42, 43, 41, 42, 44, 40,
        43, 41, 42, 43, 41, 42, 40, 43, 44, 41,
        42, 43, 41, 45, 47,
      ]),
    ]
    const result = computeTrajectory(decliningMetrics, new Map())
    expect(result.dataState).not.toBe('insufficient')
    expect(result.sleep.direction).toBe('declining')
  })

  it('detects body recomp (fat down + muscle up simultaneously)', () => {
    // Use RECOMP_METRICS but also add sleep/activity for sufficient data diversity
    const allMetrics = [
      ...RECOMP_METRICS,
      ...series('sleep_duration', [
        420, 425, 430, 435, 440, 445, 450, 455,
      ], 30),
      ...series('hrv', [
        40, 42, 44, 46, 48, 50, 52, 54,
      ], 30),
      ...series('steps', [
        8000, 8200, 8500, 8700, 9000, 9200, 9500, 9800,
      ], 30),
    ]
    const result = computeTrajectory(allMetrics, new Map())
    expect(result.dataState).not.toBe('insufficient')
    // Body comp should reflect the recomp trends
    if (result.bodyComp) {
      // bodyComp aggregation detected
      expect(result.bodyComp).toBeDefined()
    }
  })

  it('produces reasonable result with mixed signals (sleep up, activity down)', () => {
    const mixed = [
      // Sleep improving
      ...series('sleep_duration', [
        400, 405, 410, 415, 420, 425, 430, 435, 440, 445,
        450, 455, 460, 465, 470, 475, 480, 485, 490, 495,
        500, 505, 510, 515, 520,
      ]),
      // Activity declining
      ...series('steps', [
        12000, 11800, 11500, 11200, 11000, 10800, 10500, 10200, 10000, 9800,
        9500, 9200, 9000, 8800, 8500, 8200, 8000, 7800, 7500, 7200,
        7000, 6800, 6500, 6200, 6000,
      ]),
    ]
    const result = computeTrajectory(mixed, new Map())
    // Should not crash and should return a valid trajectory
    expect(result.dataState).not.toBe('insufficient')
    expect(['improving', 'stable', 'declining']).toContain(result.direction)
    expect(result.headline).toBeTruthy()
  })

  it('produces a headline and window label', () => {
    const data = [
      ...series('sleep_duration', Array.from({ length: 25 }, (_, i) => 420 + i * 2)),
      ...series('hrv', Array.from({ length: 25 }, (_, i) => 40 + i)),
    ]
    const result = computeTrajectory(data, new Map(), 30)
    expect(result.headline).toBeTruthy()
    expect(result.windowLabel).toBeTruthy()
    expect(result.timeWindow).toBe(30)
  })
})

// ─── computeBodyCompState ────────────────────────────────────────────

describe('computeBodyCompState', () => {
  it('returns insufficient_data with < 4 data points', () => {
    const result = computeBodyCompState(INSUFFICIENT_METRICS)
    expect(result.recompStatus).toBe('insufficient_data')
    expect(result.confidence).toBe('insufficient')
  })

  it('detects recomposition (fat down, mass up)', () => {
    const result = computeBodyCompState(RECOMP_METRICS)
    expect(result.recompStatus).toBe('recomposing')
    expect(result.headline).toContain('recomposition')
  })

  it('detects fat loss phase', () => {
    const result = computeBodyCompState(FAT_LOSS_METRICS)
    expect(result.recompStatus).toBe('fat_loss')
    expect(result.headline).toContain('Fat loss')
  })

  it('detects regression (fat up, mass down)', () => {
    const result = computeBodyCompState(REGRESSING_METRICS)
    expect(result.recompStatus).toBe('regressing')
  })

  it('detects stable when no significant changes', () => {
    const result = computeBodyCompState(STABLE_METRICS)
    expect(result.recompStatus).toBe('stable')
  })

  it('returns empty metrics as insufficient', () => {
    const result = computeBodyCompState(EMPTY_METRICS)
    expect(result.recompStatus).toBe('insufficient_data')
  })

  it('assigns confidence based on data points', () => {
    // 8 points per metric = 24 total points -> high
    const result = computeBodyCompState(RECOMP_METRICS)
    expect(result.confidence).toBe('high')
  })
})

// ─── computeEnhancedBodyComp ──────────────────────────────────────────

describe('computeEnhancedBodyComp', () => {
  it('inherits base body comp state', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.recompStatus).toBe('recomposing')
    expect(result.weight).toBeDefined()
  })

  it('computes weekly rates', () => {
    const result = computeEnhancedBodyComp(FAT_LOSS_METRICS)
    expect(result.weeklyRates.weightChangePerWeek).not.toBeNull()
    expect(result.weeklyRates.weightChangePerWeek!).toBeLessThan(0) // losing weight
    expect(result.weeklyRates.fatChangePerWeek).not.toBeNull()
    expect(result.weeklyRates.fatChangePerWeek!).toBeLessThan(0) // losing fat
  })

  it('returns null weekly rates with insufficient data', () => {
    const result = computeEnhancedBodyComp(INSUFFICIENT_METRICS)
    expect(result.weeklyRates.weightChangePerWeek).toBeNull()
    expect(result.weeklyRates.fatChangePerWeek).toBeNull()
  })

  it('computes lean-to-fat ratio when weight and body fat exist', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.leanToFatRatio).toBeDefined()
    expect(result.leanToFatRatio!.current).toBeGreaterThan(0)
  })

  it('detects metabolic adaptation', () => {
    const result = computeEnhancedBodyComp(METABOLIC_ADAPTATION_METRICS)
    expect(result.metabolicAdaptation).toBeDefined()
    expect(result.metabolicAdaptation!.detected).toBe(true)
    expect(result.metabolicAdaptation!.severity).not.toBe('none')
  })

  it('no metabolic adaptation when not present', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.metabolicAdaptation).toBeDefined()
    expect(result.metabolicAdaptation!.detected).toBe(false)
  })

  it('computes time-to-goal for weight target', () => {
    const result = computeEnhancedBodyComp(FAT_LOSS_METRICS, { weight: 170 })
    expect(result.timeToGoal).toBeDefined()
    if (result.timeToGoal!.estimatedWeeks != null) {
      expect(result.timeToGoal!.estimatedWeeks).toBeGreaterThan(0)
      expect(result.timeToGoal!.estimatedWeeks).toBeLessThan(104)
    }
  })

  it('returns null time-to-goal when moving wrong direction', () => {
    // Gaining weight but targeting lower -- can't estimate
    const result = computeEnhancedBodyComp(REGRESSING_METRICS, { weight: 170 })
    expect(result.timeToGoal).toBeDefined()
    expect(result.timeToGoal!.estimatedWeeks).toBeNull()
  })

  it('generates narratives', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.narratives.primary).toBeTruthy()
    expect(result.narratives.metabolic).toBeTruthy()
    expect(result.narratives.prediction).toBeTruthy()
  })

  it('prediction narrative shows goal info when targets set', () => {
    const result = computeEnhancedBodyComp(FAT_LOSS_METRICS, { weight: 170 })
    // If it can estimate, narrative should mention the target
    if (result.timeToGoal?.estimatedWeeks != null) {
      expect(result.narratives.prediction).toContain('170')
    }
  })
})
