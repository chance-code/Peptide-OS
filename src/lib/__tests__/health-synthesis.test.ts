import { describe, it, expect } from 'vitest'
import {
  validateSleepStages,
  calculateConsistency,
  calculateMomentum,
} from '../health-synthesis'

// ─── validateSleepStages ─────────────────────────────────────────────

describe('validateSleepStages', () => {
  it('passes through when stages fit within sleep duration', () => {
    const result = validateSleepStages(480, 90, 120, 200)
    expect(result.corrected).toBe(false)
    expect(result.deepSleep).toBe(90)
    expect(result.remSleep).toBe(120)
    expect(result.lightSleep).toBe(200)
  })

  it('scales down when stages exceed total sleep', () => {
    // Stages sum to 600 but sleep is only 480 minutes
    const result = validateSleepStages(480, 120, 180, 300)
    expect(result.corrected).toBe(true)
    const newSum = result.deepSleep + result.remSleep + result.lightSleep
    expect(newSum).toBeLessThanOrEqual(480.1) // rounding tolerance
    // Proportions should be preserved
    expect(result.deepSleep / result.remSleep).toBeCloseTo(120 / 180, 1)
  })

  it('returns unchanged when stageSum is zero', () => {
    const result = validateSleepStages(480, 0, 0, 0)
    expect(result.corrected).toBe(false)
  })

  it('returns unchanged when sleepDuration is zero', () => {
    const result = validateSleepStages(0, 90, 120, 200)
    expect(result.corrected).toBe(false)
  })

  it('returns unchanged when stages equal sleep duration', () => {
    const result = validateSleepStages(480, 90, 120, 270)
    expect(result.corrected).toBe(false)
    expect(result.deepSleep).toBe(90)
  })

  it('correctly scales a 2x overflow scenario', () => {
    // Stages sum to 960, sleep = 480 → scale factor = 0.5
    const result = validateSleepStages(480, 200, 200, 560)
    expect(result.corrected).toBe(true)
    expect(result.deepSleep).toBeCloseTo(100, 0)
    expect(result.remSleep).toBeCloseTo(100, 0)
    expect(result.lightSleep).toBeCloseTo(280, 0)
  })
})

// ─── calculateConsistency ────────────────────────────────────────────

describe('calculateConsistency', () => {
  it('returns 100 for single value', () => {
    expect(calculateConsistency([60])).toBe(100)
  })

  it('returns 100 for identical values', () => {
    expect(calculateConsistency([60, 60, 60, 60])).toBe(100)
  })

  it('returns lower score for variable data', () => {
    const score = calculateConsistency([50, 60, 70, 80, 90])
    expect(score).toBeLessThan(100)
    expect(score).toBeGreaterThan(0)
  })

  it('returns 50 for zero mean', () => {
    expect(calculateConsistency([0, 0, 0])).toBe(50)
  })

  it('handles empty array edge case (< 2 values)', () => {
    expect(calculateConsistency([])).toBe(100)
  })

  it('clamps to 0 for extremely variable data', () => {
    // CV > 1 → score goes negative → clamped to 0
    const score = calculateConsistency([1, 100, 1, 100])
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ─── calculateMomentum ──────────────────────────────────────────────

describe('calculateMomentum', () => {
  it('returns steady when difference < 2', () => {
    expect(calculateMomentum(5, 4)).toBe('steady')
    expect(calculateMomentum(-3, -2)).toBe('steady')
    expect(calculateMomentum(0, 1)).toBe('steady')
  })

  it('returns accelerating when positive change is growing', () => {
    // currentChange > 0 and |current| - |previous| > 2
    expect(calculateMomentum(10, 5)).toBe('accelerating')
  })

  it('returns accelerating when negative change is growing', () => {
    // currentChange < 0 and |current| - |previous| > 2
    expect(calculateMomentum(-10, -5)).toBe('accelerating')
  })

  it('returns decelerating when improvement is slowing', () => {
    // |current| < |previous| and diff > 2
    expect(calculateMomentum(3, 10)).toBe('decelerating')
  })

  it('returns decelerating when direction reverses', () => {
    expect(calculateMomentum(-5, 10)).toBe('decelerating')
  })
})
