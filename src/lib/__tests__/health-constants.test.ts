import { describe, it, expect } from 'vitest'
import {
  safeDivide,
  safePercentChange,
  clampPercent,
  validateMetricValue,
  validateAndCorrectMetric,
  getStableThreshold,
  validateChangePercent,
} from '../health-constants'

// ─── safeDivide ──────────────────────────────────────────────────────────

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 2)).toBe(5)
    expect(safeDivide(7, 3)).toBeCloseTo(2.333, 2)
  })

  it('returns null for zero denominator', () => {
    expect(safeDivide(10, 0)).toBeNull()
    expect(safeDivide(0, 0)).toBeNull()
  })

  it('returns null for NaN/Infinity inputs', () => {
    expect(safeDivide(NaN, 5)).toBeNull()
    expect(safeDivide(5, NaN)).toBeNull()
    expect(safeDivide(Infinity, 5)).toBeNull()
    expect(safeDivide(5, Infinity)).toBeNull()
    expect(safeDivide(-Infinity, 2)).toBeNull()
  })

  it('handles negative numbers', () => {
    expect(safeDivide(-10, 2)).toBe(-5)
    expect(safeDivide(10, -2)).toBe(-5)
  })

  it('zero numerator returns 0', () => {
    expect(safeDivide(0, 5)).toBe(0)
  })
})

// ─── safePercentChange ──────────────────────────────────────────────────

describe('safePercentChange', () => {
  it('calculates positive change', () => {
    expect(safePercentChange(110, 100)).toBe(10)
  })

  it('calculates negative change', () => {
    expect(safePercentChange(90, 100)).toBe(-10)
  })

  it('returns null when previous is zero', () => {
    expect(safePercentChange(100, 0)).toBeNull()
  })

  it('returns null for NaN inputs', () => {
    expect(safePercentChange(NaN, 100)).toBeNull()
    expect(safePercentChange(100, NaN)).toBeNull()
  })

  it('clamps extreme percent changes', () => {
    // 100x increase = 9900% → clamped to 500
    expect(safePercentChange(10000, 100)).toBe(500)
    // Near-zero previous creates huge percentage → clamped
    expect(safePercentChange(100, 0.01)).toBe(500)
  })

  it('no change returns 0', () => {
    expect(safePercentChange(100, 100)).toBe(0)
  })
})

// ─── clampPercent ───────────────────────────────────────────────────────

describe('clampPercent', () => {
  it('passes through normal values', () => {
    expect(clampPercent(50)).toBe(50)
    expect(clampPercent(-50)).toBe(-50)
  })

  it('clamps to ±500 by default', () => {
    expect(clampPercent(1000)).toBe(500)
    expect(clampPercent(-1000)).toBe(-500)
  })

  it('returns 0 for NaN', () => {
    expect(clampPercent(NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(clampPercent(Infinity)).toBe(0)
    expect(clampPercent(-Infinity)).toBe(0)
  })

  it('custom min/max', () => {
    expect(clampPercent(200, -100, 100)).toBe(100)
    expect(clampPercent(-200, -100, 100)).toBe(-100)
  })
})

// ─── validateMetricValue ────────────────────────────────────────────────

describe('validateMetricValue', () => {
  it('accepts values within bounds', () => {
    expect(validateMetricValue('hrv', 60)).toBe(true)
    expect(validateMetricValue('rhr', 65)).toBe(true)
    expect(validateMetricValue('blood_oxygen', 98)).toBe(true)
    expect(validateMetricValue('weight', 180)).toBe(true)
  })

  it('rejects values outside bounds', () => {
    expect(validateMetricValue('hrv', 0)).toBe(false)    // min is 5
    expect(validateMetricValue('hrv', 300)).toBe(false)   // max is 200
    expect(validateMetricValue('blood_oxygen', 50)).toBe(false)  // min is 85
    expect(validateMetricValue('rhr', 200)).toBe(false)   // max is 150
  })

  it('rejects NaN and Infinity', () => {
    expect(validateMetricValue('hrv', NaN)).toBe(false)
    expect(validateMetricValue('hrv', Infinity)).toBe(false)
    expect(validateMetricValue('hrv', -Infinity)).toBe(false)
  })

  it('accepts unknown metrics (no bounds to check)', () => {
    expect(validateMetricValue('unknown_metric', 999999)).toBe(true)
  })

  it('boundary values are inclusive', () => {
    expect(validateMetricValue('blood_oxygen', 85)).toBe(true)   // at min
    expect(validateMetricValue('blood_oxygen', 100)).toBe(true)  // at max
  })
})

// ─── validateAndCorrectMetric ───────────────────────────────────────────

describe('validateAndCorrectMetric', () => {
  it('valid value passes through', () => {
    const result = validateAndCorrectMetric('hrv', 65, 'ms')
    expect(result.valid).toBe(true)
    expect(result.correctedValue).toBeUndefined()
  })

  it('rejects non-finite values', () => {
    expect(validateAndCorrectMetric('hrv', NaN, 'ms').valid).toBe(false)
    expect(validateAndCorrectMetric('hrv', Infinity, 'ms').valid).toBe(false)
  })

  it('rejects out-of-bounds values', () => {
    const result = validateAndCorrectMetric('hrv', 500, 'ms')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('outside bounds')
  })

  it('auto-corrects decimal SpO2 to percentage', () => {
    const result = validateAndCorrectMetric('blood_oxygen', 0.97, '%')
    expect(result.valid).toBe(true)
    expect(result.correctedValue).toBe(97)
    expect(result.reason).toContain('decimal to percentage')
  })

  it('auto-corrects decimal body fat to percentage', () => {
    const result = validateAndCorrectMetric('body_fat_percentage', 0.22, '%')
    expect(result.valid).toBe(true)
    expect(result.correctedValue).toBe(22)
  })

  it('corrects sleep_duration from hours to minutes when unit is hrs', () => {
    // 7.5 hours = 450 minutes — unit normalization should convert
    const result = validateAndCorrectMetric('sleep_duration', 7.5, 'hrs')
    expect(result.valid).toBe(true)
    expect(result.correctedValue).toBe(450)
  })

  it('corrects deep_sleep from hours to minutes when unit is hrs', () => {
    // 1.5 hours = 90 minutes — unit normalization should convert
    const result = validateAndCorrectMetric('deep_sleep', 1.5, 'hrs')
    expect(result.valid).toBe(true)
    expect(result.correctedValue).toBe(90)
  })

  it('does NOT correct valid sleep minutes', () => {
    const result = validateAndCorrectMetric('sleep_duration', 420, 'min')
    expect(result.valid).toBe(true)
    expect(result.correctedValue).toBeUndefined()
  })

  it('unknown metrics pass through', () => {
    const result = validateAndCorrectMetric('completely_unknown', 42, 'units')
    expect(result.valid).toBe(true)
  })
})

// ─── getStableThreshold ─────────────────────────────────────────────────

describe('getStableThreshold', () => {
  it('returns metric-specific threshold', () => {
    expect(getStableThreshold('hrv')).toBe(8)
    expect(getStableThreshold('weight')).toBe(1)
    expect(getStableThreshold('steps')).toBe(15)
    expect(getStableThreshold('vo2_max')).toBe(2)
  })

  it('returns 5 for unknown metrics', () => {
    expect(getStableThreshold('unknown_metric')).toBe(5)
  })
})

// ─── validateChangePercent ──────────────────────────────────────────────

describe('validateChangePercent', () => {
  it('passes through normal changes', () => {
    expect(validateChangePercent('hrv', 5, 'daily')).toBe(5)
    expect(validateChangePercent('weight', 0.5, 'weekly')).toBe(0.5)
  })

  it('returns 0 for NaN/Infinity', () => {
    expect(validateChangePercent('hrv', NaN, 'daily')).toBe(0)
    expect(validateChangePercent('hrv', Infinity, 'daily')).toBe(0)
  })

  it('logs warning for suspicious changes but still returns value', () => {
    // maxDailyChange for hrv is 30, so 2x = 60; passing 70 should warn
    const result = validateChangePercent('hrv', 70, 'daily')
    expect(result).toBe(70)  // Returns the value (warns but doesn't clamp)
  })

  it('unknown metrics pass through unchanged', () => {
    expect(validateChangePercent('unknown', 999, 'daily')).toBe(999)
  })
})
