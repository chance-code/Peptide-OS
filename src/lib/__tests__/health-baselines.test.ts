import { describe, it, expect } from 'vitest'
import {
  computeBaseline,
  compareToBaseline,
  calculateVolatility,
  calculateMomentum,
  classifySignal,
  type DailyMetricValue,
  type MetricBaseline,
} from '../health-baselines'

// Helper: create daily values for N days ending today
function makeDailyValues(values: number[], startDaysAgo?: number): DailyMetricValue[] {
  const start = startDaysAgo ?? values.length
  return values.map((value, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (start - i))
    return { date: date.toISOString().split('T')[0], value }
  })
}

// ─── computeBaseline ────────────────────────────────────────────────────

describe('computeBaseline', () => {
  it('computes correct mean and median for simple data', () => {
    const values = makeDailyValues([60, 62, 58, 61, 63, 59, 64])
    const baseline = computeBaseline(values, 28)
    expect(baseline).not.toBeNull()
    expect(baseline!.mean).toBeCloseTo(61, 0)
    expect(baseline!.dataPoints).toBe(7)
  })

  it('returns null with too few data points', () => {
    const values = makeDailyValues([60, 62])
    expect(computeBaseline(values, 28, new Date(), 5)).toBeNull()
  })

  it('removes outliers beyond 3 IQR', () => {
    // 9 normal values + 1 extreme outlier
    const values = makeDailyValues([60, 62, 58, 61, 63, 59, 64, 60, 62, 999])
    const baseline = computeBaseline(values, 28)
    expect(baseline).not.toBeNull()
    // 999 should be removed; mean should be close to ~61
    expect(baseline!.mean).toBeLessThan(70)
    expect(baseline!.max).toBeLessThan(100)
  })

  it('filters to window correctly', () => {
    // 5 values within window, 5 values outside
    const recentValues = makeDailyValues([60, 62, 58, 61, 63], 5)
    const oldValues = makeDailyValues([100, 100, 100, 100, 100], 60)
    const baseline = computeBaseline([...oldValues, ...recentValues], 28)
    expect(baseline).not.toBeNull()
    expect(baseline!.mean).toBeLessThan(70) // Should only see recent values
  })

  it('computes stdDev correctly', () => {
    // All same values → stdDev 0
    const values = makeDailyValues([60, 60, 60, 60, 60])
    const baseline = computeBaseline(values, 28)
    expect(baseline).not.toBeNull()
    expect(baseline!.stdDev).toBe(0)
  })
})

// ─── compareToBaseline ──────────────────────────────────────────────────

describe('compareToBaseline', () => {
  const baseline: MetricBaseline = {
    metricType: 'hrv',
    mean: 60,
    stdDev: 5,
    median: 60,
    p25: 57,
    p75: 63,
    min: 50,
    max: 70,
    dataPoints: 28,
    windowDays: 28,
    lastUpdated: new Date(),
  }

  it('value at baseline returns direction "at"', () => {
    const delta = compareToBaseline(60, baseline)
    expect(delta.direction).toBe('at')
    expect(delta.significance).toBe('none')
  })

  it('value above baseline', () => {
    const delta = compareToBaseline(70, baseline)
    expect(delta.direction).toBe('above')
    expect(delta.zScore).toBe(2)
    expect(delta.significance).toBe('high')
  })

  it('value below baseline', () => {
    const delta = compareToBaseline(50, baseline)
    expect(delta.direction).toBe('below')
    expect(delta.zScore).toBe(-2)
    expect(delta.significance).toBe('high')
  })

  it('handles zero stdDev without crashing', () => {
    const flatBaseline = { ...baseline, stdDev: 0 }
    const delta = compareToBaseline(65, flatBaseline)
    // safeDivide(5, 0) → null → 0
    expect(delta.zScore).toBe(0)
    expect(delta.direction).toBe('at')
    expect(isFinite(delta.percentDelta)).toBe(true)
  })

  it('handles zero mean without crashing', () => {
    const zeroMeanBaseline = { ...baseline, mean: 0 }
    const delta = compareToBaseline(5, zeroMeanBaseline)
    // safePercentChange(5, 0) → null → 0
    expect(delta.percentDelta).toBe(0)
    expect(isFinite(delta.zScore)).toBe(true)
  })

  it('produces correct percentile range', () => {
    const delta = compareToBaseline(65, baseline) // z=1
    expect(delta.percentile).toBeGreaterThan(50)
    expect(delta.percentile).toBeLessThan(100)
  })
})

// ─── calculateVolatility ────────────────────────────────────────────────

describe('calculateVolatility', () => {
  const makeBaseline = (mean: number, stdDev: number): MetricBaseline => ({
    metricType: 'test',
    mean,
    stdDev,
    median: mean,
    p25: mean - stdDev,
    p75: mean + stdDev,
    min: mean - 2 * stdDev,
    max: mean + 2 * stdDev,
    dataPoints: 28,
    windowDays: 28,
    lastUpdated: new Date(),
  })

  it('very stable (CV < 5%)', () => {
    const v = calculateVolatility(makeBaseline(100, 3))
    expect(v.level).toBe('very_stable')
    expect(v.cv).toBe(3)
  })

  it('volatile (CV 20-35%)', () => {
    const v = calculateVolatility(makeBaseline(100, 25))
    expect(v.level).toBe('volatile')
  })

  it('handles zero mean without crashing', () => {
    const v = calculateVolatility(makeBaseline(0, 5))
    // safeDivide(5, 0) → null → cv = 0
    expect(v.cv).toBe(0)
    expect(v.level).toBe('very_stable')
  })
})

// ─── calculateMomentum ──────────────────────────────────────────────────

describe('calculateMomentum', () => {
  it('returns null with less than 21 data points', () => {
    const values = makeDailyValues(Array(20).fill(60))
    expect(calculateMomentum(values)).toBeNull()
  })

  it('steady trend when values are constant', () => {
    const values = makeDailyValues(Array(21).fill(60))
    const m = calculateMomentum(values)
    expect(m).not.toBeNull()
    expect(m!.momentum).toBe('steady')
  })

  it('accelerating when improvement is increasing', () => {
    // Older: 50s, Middle: 55s, Recent: 65s (higher_better)
    const older = Array(7).fill(50)
    const middle = Array(7).fill(55)
    const recent = Array(7).fill(65)
    const values = makeDailyValues([...older, ...middle, ...recent])
    const m = calculateMomentum(values, 'higher_better')
    expect(m).not.toBeNull()
    expect(m!.momentum).toBe('accelerating')
  })
})

// ─── classifySignal ─────────────────────────────────────────────────────

describe('classifySignal', () => {
  const baseline: MetricBaseline = {
    metricType: 'hrv',
    mean: 60,
    stdDev: 5,
    median: 60,
    p25: 57,
    p75: 63,
    min: 50,
    max: 70,
    dataPoints: 28,
    windowDays: 28,
    lastUpdated: new Date(),
  }

  it('returns null for empty values', () => {
    expect(classifySignal('hrv', [], baseline)).toBeNull()
  })

  it('classifies within-range values as noise', () => {
    const values = makeDailyValues([61], 1) // z = 0.2
    const signal = classifySignal('hrv', values, baseline)
    expect(signal).not.toBeNull()
    expect(signal!.signalClass).toBe('noise')
  })

  it('classifies single-day deviation as blip', () => {
    const values = makeDailyValues([75], 1) // z = 3
    const signal = classifySignal('hrv', values, baseline)
    expect(signal).not.toBeNull()
    expect(signal!.signalClass).toBe('blip')
  })

  it('classifies multi-day same-direction as short_term_change', () => {
    // Most recent values must be elevated (sorted desc by date, first is most recent)
    const values = makeDailyValues([60, 72, 73], 3) // last 2 days above baseline
    const signal = classifySignal('hrv', values, baseline)
    expect(signal).not.toBeNull()
    expect(signal!.signalClass).toBe('short_term_change')
  })

  it('classifies 5+ days same direction as sustained_trend', () => {
    // First value is oldest (noise), last 6 are elevated
    const values = makeDailyValues([60, 72, 73, 71, 74, 72, 73], 7)
    const signal = classifySignal('hrv', values, baseline)
    expect(signal).not.toBeNull()
    expect(signal!.signalClass).toBe('sustained_trend')
  })
})
