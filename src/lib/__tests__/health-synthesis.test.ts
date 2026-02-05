import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateSleepStages,
  calculateConsistency,
  calculateMomentum,
} from '../health-synthesis'

// ─── Mock Prisma to prevent DB connections in tests ─────────────────
// We mock the prisma module so that importing health-synthesis does not
// attempt a real database connection. The mock returns empty results.

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
    // Stages sum to 960, sleep = 480 -> scale factor = 0.5
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
    // CV > 1 -> score goes negative -> clamped to 0
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

// ─── SOURCE_PRIORITY ────────────────────────────────────────────────

describe('SOURCE_PRIORITY', () => {
  // We can't directly import SOURCE_PRIORITY (it's a const, not exported),
  // but we can verify the module loads and the key metrics are mapped correctly
  // by checking that the module's exported getUnifiedMetrics uses it.
  // Instead, we test the dedup logic indirectly.

  it('health-synthesis module exports expected functions', async () => {
    const mod = await import('../health-synthesis')
    expect(typeof mod.getUnifiedMetrics).toBe('function')
    expect(typeof mod.calculateHealthTrends).toBe('function')
    expect(typeof mod.calculateHealthScore).toBe('function')
    expect(typeof mod.generateSynthesizedInsights).toBe('function')
    expect(typeof mod.validateSleepStages).toBe('function')
    expect(typeof mod.calculateConsistency).toBe('function')
    expect(typeof mod.calculateMomentum).toBe('function')
  })
})

// ─── getUnifiedMetrics dedup (via Prisma mock) ──────────────────────

describe('getUnifiedMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deduplicates by date, keeping highest-priority source', async () => {
    const { prisma } = await import('../prisma')
    const { getUnifiedMetrics } = await import('../health-synthesis')

    // Mock Prisma to return two entries for the same date from different providers
    const mockMetrics = [
      {
        metricType: 'hrv',
        value: 55,
        unit: 'ms',
        provider: 'oura',
        recordedAt: new Date('2025-01-15'),
        context: null,
      },
      {
        metricType: 'hrv',
        value: 52,
        unit: 'ms',
        provider: 'apple_health',
        recordedAt: new Date('2025-01-15'),
        context: null,
      },
    ]

    vi.mocked(prisma.healthMetric.findMany).mockResolvedValue(mockMetrics as never)

    const result = await getUnifiedMetrics(
      'test-user',
      new Date('2025-01-01'),
      new Date('2025-01-31')
    )

    const hrvMetrics = result.get('hrv' as never)
    expect(hrvMetrics).toBeDefined()
    expect(hrvMetrics!.length).toBe(1) // Deduped to one entry per date

    // For HRV, SOURCE_PRIORITY is ['apple_health', 'oura', 'eight_sleep']
    // So apple_health should be selected as the primary source
    expect(hrvMetrics![0].source).toBe('apple_health')
    expect(hrvMetrics![0].value).toBe(52)
    // The oura value should be in alternative sources
    expect(hrvMetrics![0].alternativeSources).toBeDefined()
    expect(hrvMetrics![0].alternativeSources!.length).toBe(1)
    expect(hrvMetrics![0].alternativeSources![0].provider).toBe('oura')
  })

  it('returns empty map when no metrics found', async () => {
    const { prisma } = await import('../prisma')
    const { getUnifiedMetrics } = await import('../health-synthesis')

    vi.mocked(prisma.healthMetric.findMany).mockResolvedValue([])

    const result = await getUnifiedMetrics(
      'test-user',
      new Date('2025-01-01'),
      new Date('2025-01-31')
    )

    expect(result.size).toBe(0)
  })
})

// ─── Health Score (mocked) ──────────────────────────────────────────

describe('calculateHealthScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null overall score when no data available', async () => {
    const { prisma } = await import('../prisma')
    const { calculateHealthScore } = await import('../health-synthesis')

    // No metrics found
    vi.mocked(prisma.healthMetric.findMany).mockResolvedValue([])

    const score = await calculateHealthScore('empty-user')
    // With no data, overall should be null
    expect(score.overall).toBeNull()
    expect(score.breakdown.length).toBe(0)
  })
})
