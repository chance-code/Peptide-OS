import { describe, it, expect } from 'vitest'
import {
  METRIC_REGISTRY,
  getMetricDef,
  getMetricsByCategory,
  formatMetric,
  getPolarity,
  getDisplayName,
  getStableThresholdFromContract,
  getOptimalRange,
  getBounds,
  derivePolarityMap,
  getMetricCategory,
  type MetricCategory,
} from '../health-metric-contract'

// ─── METRIC_REGISTRY completeness ────────────────────────────────────

describe('METRIC_REGISTRY', () => {
  const allKeys = Object.keys(METRIC_REGISTRY)

  it('has at least 35 metric definitions', () => {
    expect(allKeys.length).toBeGreaterThanOrEqual(35)
  })

  it('every metric has required fields (displayName, unit, bounds, polarity)', () => {
    for (const key of allKeys) {
      const def = METRIC_REGISTRY[key]
      expect(def.key, `${key}: missing key`).toBe(key)
      expect(def.displayName, `${key}: missing displayName`).toBeTruthy()
      expect(def.category, `${key}: missing category`).toBeTruthy()
      expect(def.unit, `${key}: unit should be string`).toBeDefined()
      expect(def.displayUnit, `${key}: displayUnit should be string`).toBeDefined()
      expect(['higher_better', 'lower_better', 'neutral']).toContain(def.polarity)
      expect(def.bounds.min, `${key}: bounds.min should be number`).not.toBeNaN()
      expect(def.bounds.max, `${key}: bounds.max should be number`).not.toBeNaN()
      expect(def.bounds.max).toBeGreaterThan(def.bounds.min)
      expect(typeof def.maxWeeklyChange).toBe('number')
      expect(typeof def.stableThreshold).toBe('number')
      expect(typeof def.format).toBe('function')
    }
  })

  it('every metric has valid bounds (min < max)', () => {
    for (const key of allKeys) {
      const def = METRIC_REGISTRY[key]
      expect(def.bounds.min, `${key}: min should be less than max`).toBeLessThan(def.bounds.max)
    }
  })

  it('every metric with optimalRange has valid min < optimal < max', () => {
    for (const key of allKeys) {
      const def = METRIC_REGISTRY[key]
      if (def.optimalRange) {
        expect(def.optimalRange.min, `${key}: optimal.min`).toBeLessThanOrEqual(def.optimalRange.optimal)
        expect(def.optimalRange.optimal, `${key}: optimal.optimal`).toBeLessThanOrEqual(def.optimalRange.max)
      }
    }
  })

  it('polarity values are only higher_better, lower_better, or neutral', () => {
    const validPolarities = ['higher_better', 'lower_better', 'neutral']
    for (const key of allKeys) {
      const def = METRIC_REGISTRY[key]
      expect(validPolarities, `${key} has invalid polarity: ${def.polarity}`).toContain(def.polarity)
    }
  })

  it('covers all expected categories', () => {
    const categories = new Set(allKeys.map(k => METRIC_REGISTRY[k].category))
    expect(categories.has('sleep')).toBe(true)
    expect(categories.has('recovery')).toBe(true)
    expect(categories.has('activity')).toBe(true)
    expect(categories.has('bodyComp')).toBe(true)
  })

  it('key metrics exist', () => {
    const required = [
      'sleep_duration', 'deep_sleep', 'rem_sleep', 'sleep_score', 'sleep_efficiency',
      'hrv', 'resting_heart_rate', 'blood_oxygen', 'respiratory_rate',
      'steps', 'active_calories', 'exercise_minutes', 'vo2_max',
      'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi',
    ]
    for (const key of required) {
      expect(METRIC_REGISTRY[key], `Missing metric: ${key}`).toBeDefined()
    }
  })
})

// ─── getMetricDef ────────────────────────────────────────────────────

describe('getMetricDef', () => {
  it('returns definition for known metrics', () => {
    const def = getMetricDef('hrv')
    expect(def).toBeDefined()
    expect(def!.displayName).toBe('HRV')
    expect(def!.category).toBe('recovery')
  })

  it('returns undefined for unknown metrics', () => {
    expect(getMetricDef('totally_fake_metric')).toBeUndefined()
  })
})

// ─── getMetricsByCategory ────────────────────────────────────────────

describe('getMetricsByCategory', () => {
  it('returns sleep metrics', () => {
    const sleepMetrics = getMetricsByCategory('sleep')
    expect(sleepMetrics.length).toBeGreaterThan(0)
    expect(sleepMetrics.every(m => m.category === 'sleep')).toBe(true)
  })

  it('returns correct metrics for each category', () => {
    const categories: MetricCategory[] = ['sleep', 'recovery', 'activity', 'bodyComp', 'vitals', 'readiness']
    for (const cat of categories) {
      const metrics = getMetricsByCategory(cat)
      // Every returned metric must belong to the requested category
      for (const m of metrics) {
        expect(m.category, `${m.key} should be in category ${cat}`).toBe(cat)
      }
    }
    // Verify specific known metrics are in their categories
    const recoveryKeys = getMetricsByCategory('recovery').map(m => m.key)
    expect(recoveryKeys).toContain('hrv')
    expect(recoveryKeys).toContain('resting_heart_rate')

    const activityKeys = getMetricsByCategory('activity').map(m => m.key)
    expect(activityKeys).toContain('steps')
    expect(activityKeys).toContain('active_calories')
  })

  it('returns empty array for nonexistent category', () => {
    expect(getMetricsByCategory('nonexistent' as MetricCategory)).toEqual([])
  })
})

// ─── formatMetric ────────────────────────────────────────────────────

describe('formatMetric', () => {
  it('formats sleep duration as hours + minutes', () => {
    expect(formatMetric('sleep_duration', 450)).toBe('7h 30m')
    expect(formatMetric('sleep_duration', 432)).toBe('7h 12m')
    expect(formatMetric('sleep_duration', 30)).toBe('30m')
  })

  it('formats HRV as ms', () => {
    expect(formatMetric('hrv', 65)).toBe('65 ms')
  })

  it('formats heart rate as bpm', () => {
    expect(formatMetric('resting_heart_rate', 62)).toBe('62 bpm')
  })

  it('formats weight as lbs', () => {
    expect(formatMetric('weight', 180.5)).toBe('180.5 lbs')
  })

  it('formats body fat as percent', () => {
    expect(formatMetric('body_fat_percentage', 15.3)).toBe('15.3%')
  })

  it('formats steps with locale separators', () => {
    const formatted = formatMetric('steps', 10000)
    // Locale-dependent, but should contain the digits
    expect(formatted).toContain('10')
    expect(formatted).toContain('000')
  })

  it('falls back to String() for unknown metric', () => {
    expect(formatMetric('unknown_metric', 42)).toBe('42')
  })
})

// ─── getPolarity ─────────────────────────────────────────────────────

describe('getPolarity', () => {
  it('HRV is higher_better', () => {
    expect(getPolarity('hrv')).toBe('higher_better')
  })

  it('resting heart rate is lower_better', () => {
    expect(getPolarity('resting_heart_rate')).toBe('lower_better')
  })

  it('weight is neutral', () => {
    expect(getPolarity('weight')).toBe('neutral')
  })

  it('unknown metric defaults to neutral', () => {
    expect(getPolarity('unknown')).toBe('neutral')
  })
})

// ─── getDisplayName ──────────────────────────────────────────────────

describe('getDisplayName', () => {
  it('returns human-readable names', () => {
    expect(getDisplayName('sleep_duration')).toBe('Sleep Duration')
    expect(getDisplayName('body_fat_percentage')).toBe('Body Fat')
  })

  it('falls back to key for unknown metrics', () => {
    expect(getDisplayName('my_custom_metric')).toBe('my_custom_metric')
  })
})

// ─── derivePolarityMap ───────────────────────────────────────────────

describe('derivePolarityMap', () => {
  it('returns a record with all metrics', () => {
    const map = derivePolarityMap()
    expect(Object.keys(map).length).toBe(Object.keys(METRIC_REGISTRY).length)
    expect(map['hrv']).toBe('higher_better')
    expect(map['resting_heart_rate']).toBe('lower_better')
  })
})

// ─── getMetricCategory ──────────────────────────────────────────────

describe('getMetricCategory', () => {
  it('returns correct categories', () => {
    expect(getMetricCategory('sleep_duration')).toBe('sleep')
    expect(getMetricCategory('hrv')).toBe('recovery')
    expect(getMetricCategory('steps')).toBe('activity')
    expect(getMetricCategory('weight')).toBe('bodyComp')
  })

  it('returns undefined for unknown metrics', () => {
    expect(getMetricCategory('unknown')).toBeUndefined()
  })
})
