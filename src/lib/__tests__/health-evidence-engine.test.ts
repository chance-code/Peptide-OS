import { describe, it, expect } from 'vitest'
import {
  computeEffectSize,
  detectMechanisms,
  type EnhancedSignal,
  type EffectSizeResult,
} from '../health-evidence-engine'
import { KNOWN_EFFECT_SIZE, NO_EFFECT_DATA, ALL_ZEROS } from './fixtures/metrics-fixtures'

// ─── computeEffectSize (Cohen's d + Welch's t-test) ─────────────────

describe('computeEffectSize', () => {
  it('returns zeros for empty arrays', () => {
    const result = computeEffectSize([], [1, 2, 3])
    expect(result.cohensD).toBe(0)
    expect(result.percentChange).toBe(0)
    expect(result.powerEstimate).toBe(0)

    const result2 = computeEffectSize([1, 2], [])
    expect(result2.cohensD).toBe(0)
  })

  it('computes known large effect size', () => {
    const { before, after, expectedD } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.cohensD).toBeCloseTo(expectedD, 0) // within 0.5
    expect(result.cohensD).toBeGreaterThan(0.8) // large effect threshold
    expect(result.percentChange).toBeGreaterThan(0) // positive change
    expect(result.absoluteChange).toBeCloseTo(5, 0) // 55.2 - 50.2
  })

  it('computes near-zero effect for no-change data', () => {
    const { before, after } = NO_EFFECT_DATA
    const result = computeEffectSize(before, after)
    expect(Math.abs(result.cohensD)).toBeLessThan(0.5) // small or negligible
    expect(Math.abs(result.percentChange)).toBeLessThan(5)
  })

  it('returns t-test results when n >= 5', () => {
    const { before, after } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.tValue).not.toBeNull()
    expect(result.pValue).not.toBeNull()
    expect(result.degreesOfFreedom).not.toBeNull()
  })

  it('skips t-test when n < 5', () => {
    const result = computeEffectSize([50, 52, 48], [55, 57, 53])
    expect(result.tValue).toBeNull()
    expect(result.pValue).toBeNull()
  })

  it('produces significant p-value for large effect', () => {
    const { before, after } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.pValue).not.toBeNull()
    expect(result.pValue!).toBeLessThan(0.05)
  })

  it('produces confidence interval containing the effect', () => {
    const { before, after } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.confidenceInterval.lower).toBeLessThan(result.cohensD)
    expect(result.confidenceInterval.upper).toBeGreaterThan(result.cohensD)
  })

  it('handles identical values (zero variance)', () => {
    const before = [50, 50, 50, 50, 50]
    const after = [55, 55, 55, 55, 55]
    const result = computeEffectSize(before, after)
    // Pooled std = 0, so cohensD = 0 (division by zero guard)
    expect(isFinite(result.cohensD)).toBe(true)
    expect(isFinite(result.percentChange)).toBe(true)
  })

  it('handles negative effect (decline)', () => {
    const before = [60, 62, 58, 61, 63, 59, 64, 60, 62, 61]
    const after = [50, 52, 48, 51, 53, 49, 54, 50, 52, 51]
    const result = computeEffectSize(before, after)
    expect(result.cohensD).toBeLessThan(0)
    expect(result.percentChange).toBeLessThan(0)
  })

  it('power estimate is between 0 and 1', () => {
    const { before, after } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.powerEstimate).toBeGreaterThanOrEqual(0)
    expect(result.powerEstimate).toBeLessThanOrEqual(1)
  })
})

// ─── detectMechanisms ────────────────────────────────────────────────

describe('detectMechanisms', () => {
  function makeSignal(
    metricType: string,
    direction: 'up' | 'down' | 'stable',
    magnitude: 'large' | 'medium' | 'small' | 'negligible' = 'medium'
  ): EnhancedSignal {
    return {
      metricType,
      metricName: metricType,
      category: 'recovery',
      before: { mean: 50, stdDev: 5, n: 10 },
      after: { mean: direction === 'up' ? 60 : direction === 'down' ? 40 : 50, stdDev: 5, n: 10 },
      change: {
        absolute: direction === 'up' ? 10 : direction === 'down' ? -10 : 0,
        percent: direction === 'up' ? 20 : direction === 'down' ? -20 : 0,
        direction,
      },
      effect: {
        cohensD: magnitude === 'large' ? 1.5 : magnitude === 'medium' ? 0.6 : 0.3,
        magnitude,
        confidenceInterval: { lower: 0, upper: 2 },
        pValue: 0.01,
        isSignificant: true,
      },
      interpretation: {
        polarity: 'higher_better',
        isImprovement: direction === 'up',
        explanation: `${metricType} is ${direction}`,
      },
    }
  }

  it('detects Parasympathetic Recovery (HRV up)', () => {
    const signals = [
      makeSignal('hrv', 'up'),
      makeSignal('rhr', 'down'),
    ]
    const mechanisms = detectMechanisms(signals)
    const names = mechanisms.map(m => m.name)
    expect(names).toContain('Parasympathetic Recovery')
  })

  it('detects Body Recomposition (BF down + lean mass up)', () => {
    const signals = [
      makeSignal('body_fat_percentage', 'down'),
      makeSignal('lean_body_mass', 'up'),
    ]
    const mechanisms = detectMechanisms(signals)
    const names = mechanisms.map(m => m.name)
    expect(names).toContain('Body Recomposition')
  })

  it('returns empty for negligible signals', () => {
    const signals = [
      makeSignal('hrv', 'up', 'negligible'),
      makeSignal('rhr', 'down', 'negligible'),
    ]
    const mechanisms = detectMechanisms(signals)
    expect(mechanisms.length).toBe(0)
  })

  it('returns empty for no signals', () => {
    expect(detectMechanisms([])).toEqual([])
  })

  it('assigns high confidence with multiple supporting signals', () => {
    const signals = [
      makeSignal('hrv', 'up'),
      makeSignal('rhr', 'down'),
      makeSignal('sleep_duration', 'up'),
      makeSignal('deep_sleep', 'up'),
    ]
    const mechanisms = detectMechanisms(signals)
    const parasympathetic = mechanisms.find(m => m.name === 'Parasympathetic Recovery')
    expect(parasympathetic).toBeDefined()
    expect(parasympathetic!.confidence).toBe('high')
  })

  it('detects Fat Loss Phase', () => {
    const signals = [
      makeSignal('body_fat_percentage', 'down'),
      makeSignal('weight', 'down'),
      makeSignal('active_calories', 'up'),
    ]
    const mechanisms = detectMechanisms(signals)
    const names = mechanisms.map(m => m.name)
    expect(names).toContain('Fat Loss Phase')
  })

  it('detects Deep Sleep Enhancement', () => {
    const signals = [
      makeSignal('deep_sleep', 'up'),
      makeSignal('hrv', 'up'),
      makeSignal('sleep_score', 'up'),
    ]
    const mechanisms = detectMechanisms(signals)
    const names = mechanisms.map(m => m.name)
    expect(names).toContain('Deep Sleep Enhancement')
  })

  it('detects multiple mechanisms simultaneously', () => {
    const signals = [
      makeSignal('hrv', 'up'),
      makeSignal('rhr', 'down'),
      makeSignal('deep_sleep', 'up'),
      makeSignal('sleep_score', 'up'),
    ]
    const mechanisms = detectMechanisms(signals)
    expect(mechanisms.length).toBeGreaterThanOrEqual(2)
  })
})
