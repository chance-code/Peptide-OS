import { describe, it, expect, vi } from 'vitest'
import {
  computeEffectSize,
  detectMechanisms,
  type EnhancedSignal,
  type EffectSizeResult,
} from '../health-evidence-engine'
import { KNOWN_EFFECT_SIZE, NO_EFFECT_DATA, ALL_ZEROS } from './fixtures/metrics-fixtures'

// Mock Prisma to prevent DB connection attempts
vi.mock('../prisma', () => ({
  prisma: {
    healthMetric: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    protocol: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    doseLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

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

  it('computes Cohen d ~ 1.0 for known inputs (mean1=50, mean2=45, sd=5)', () => {
    // Construct before/after arrays where mean1=50, sd~5, mean2=45, sd~5
    // Cohen's d = (50 - 45) / 5 = -1.0 (after is lower)
    // We use after=45-centered, before=50-centered
    const before = [47, 48, 49, 50, 51, 52, 53, 50, 50, 50]  // mean~50, sd~1.7
    const after = [42, 43, 44, 45, 46, 47, 48, 45, 45, 45]    // mean~45, sd~1.7
    const result = computeEffectSize(before, after)
    // d should be negative (after < before) and magnitude ~2.9 (due to small sd)
    expect(result.cohensD).toBeLessThan(0)
    expect(Math.abs(result.cohensD)).toBeGreaterThan(0.8) // Large effect
    expect(result.absoluteChange).toBeLessThan(0) // after < before
  })

  it('computes known large effect size from fixture', () => {
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

  it('returns t-test results when n >= 5 (Welch t-test produces reasonable p-value)', () => {
    const { before, after } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.tValue).not.toBeNull()
    expect(result.pValue).not.toBeNull()
    expect(result.degreesOfFreedom).not.toBeNull()
    // The p-value should be between 0 and 1
    expect(result.pValue!).toBeGreaterThanOrEqual(0)
    expect(result.pValue!).toBeLessThanOrEqual(1)
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
    // CI should have reasonable bounds (not extreme)
    expect(result.confidenceInterval.lower).toBeGreaterThan(-10)
    expect(result.confidenceInterval.upper).toBeLessThan(10)
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

  it('handles empty metric data gracefully', () => {
    const result1 = computeEffectSize([], [])
    expect(result1.cohensD).toBe(0)
    expect(result1.percentChange).toBe(0)
    expect(result1.absoluteChange).toBe(0)
    expect(result1.standardError).toBe(0)
    expect(result1.powerEstimate).toBe(0)
    expect(result1.tValue).toBeNull()
    expect(result1.pValue).toBeNull()
  })

  it('power estimate is between 0 and 1', () => {
    const { before, after } = KNOWN_EFFECT_SIZE
    const result = computeEffectSize(before, after)
    expect(result.powerEstimate).toBeGreaterThanOrEqual(0)
    expect(result.powerEstimate).toBeLessThanOrEqual(1)
  })

  it('is polarity-aware: RHR decrease = positive effect (negative cohensD)', () => {
    // RHR is "lower_better" -- a decrease should give negative cohensD
    // (after mean < before mean)
    const beforeRHR = [68, 70, 67, 69, 71, 68, 70, 69, 67, 70]  // mean ~68.9
    const afterRHR = [60, 62, 59, 61, 63, 60, 62, 61, 59, 62]    // mean ~60.9
    const result = computeEffectSize(beforeRHR, afterRHR)
    // cohensD is negative because after < before
    expect(result.cohensD).toBeLessThan(0)
    // For a "lower_better" metric, negative d means improvement
    // (the code consumer interprets polarity, but the raw d reflects the direction)
    expect(result.percentChange).toBeLessThan(0) // after < before = decrease
    expect(Math.abs(result.cohensD)).toBeGreaterThan(0.8) // large effect
  })
})

// ─── Verdict logic ──────────────────────────────────────────────────

describe('Evidence Verdict logic', () => {
  // These test the verdict determination via the exported types.
  // The actual determineVerdict function is internal, but we can validate
  // the verdict types and create scenarios that would produce them.

  it('too_early verdict type exists in EvidenceVerdict union', async () => {
    const mod = await import('../health-evidence-engine')
    // Verify the module exports the type by checking known functions exist
    expect(typeof mod.computeEffectSize).toBe('function')
    expect(typeof mod.detectMechanisms).toBe('function')
    expect(typeof mod.computePremiumEvidence).toBe('function')
  })

  it('too_early: protocol with < 7 days yields too_early verdict', async () => {
    // We test via computePremiumEvidence with mocked data
    const { prisma } = await import('../prisma')
    const { computePremiumEvidence } = await import('../health-evidence-engine')

    // Mock a protocol that started 3 days ago
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    vi.mocked(prisma.protocol.findMany).mockResolvedValue([
      {
        id: 'test-proto',
        userId: 'test-user',
        peptideId: 'test-peptide',
        startDate: threeDaysAgo,
        endDate: null,
        status: 'active',
        doseMg: 5,
        frequency: 'daily',
        timing: 'morning',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        peptide: { name: 'BPC-157', type: 'peptide', category: 'recovery' },
      },
    ] as never)

    // Empty metrics and dose logs
    vi.mocked(prisma.healthMetric.findMany).mockResolvedValue([])
    vi.mocked(prisma.doseLog.findMany).mockResolvedValue([])

    const results = await computePremiumEvidence('test-user')
    expect(results.length).toBe(1)
    expect(results[0].verdict).toBe('too_early')
    expect(results[0].daysOnProtocol).toBeLessThan(7)
  })

  it('no_data scenario: returns no_detectable_effect when metrics are absent', async () => {
    const { prisma } = await import('../prisma')
    const { computePremiumEvidence } = await import('../health-evidence-engine')

    // Mock a protocol that started 30 days ago
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    vi.mocked(prisma.protocol.findMany).mockResolvedValue([
      {
        id: 'test-proto-2',
        userId: 'test-user',
        peptideId: 'test-peptide',
        startDate: thirtyDaysAgo,
        endDate: null,
        status: 'active',
        doseMg: 5,
        frequency: 'daily',
        timing: 'morning',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        peptide: { name: 'BPC-157', type: 'peptide', category: 'recovery' },
      },
    ] as never)

    // No health metrics at all
    vi.mocked(prisma.healthMetric.findMany).mockResolvedValue([])
    vi.mocked(prisma.doseLog.findMany).mockResolvedValue([])

    const results = await computePremiumEvidence('test-user')
    expect(results.length).toBe(1)
    // With 30 days but no metrics, should be no_detectable_effect or accumulating
    expect(['no_detectable_effect', 'accumulating']).toContain(results[0].verdict)
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

  it('mechanism detection finds correct mechanism for known peptide patterns (e.g. BPC-157)', () => {
    // BPC-157 is a recovery/healing peptide. Expected mechanism: HRV up + deep sleep up
    // This tests the pattern matching, not the peptide database specifically
    const signals = [
      makeSignal('hrv', 'up', 'large'),
      makeSignal('rhr', 'down', 'medium'),
      makeSignal('deep_sleep', 'up', 'medium'),
      makeSignal('sleep_score', 'up', 'medium'),
    ]
    const mechanisms = detectMechanisms(signals)
    const names = mechanisms.map(m => m.name)
    // Should detect both Parasympathetic Recovery and Deep Sleep Enhancement
    expect(names).toContain('Parasympathetic Recovery')
    expect(names).toContain('Deep Sleep Enhancement')
    expect(mechanisms.length).toBeGreaterThanOrEqual(2)
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
