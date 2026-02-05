// Synthetic test data for health engine tests
// Provides deterministic inputs with known expected outputs

import type { SeedMetric } from '@/lib/demo-data/seed-metrics'
import { subDays, format } from 'date-fns'

// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a dated metric value. daysAgo=0 means today. */
export function metric(
  type: string,
  value: number,
  daysAgo: number,
  unit = '',
  source = 'test'
): SeedMetric {
  return {
    metricType: type,
    value,
    date: format(subDays(new Date(), daysAgo), 'yyyy-MM-dd'),
    unit,
    source,
  }
}

/** Create a series of metrics for a type over N days (most recent first). */
export function series(
  type: string,
  values: number[],
  startDaysAgo?: number,
  unit = '',
  source = 'test'
): SeedMetric[] {
  const start = startDaysAgo ?? values.length - 1
  return values.map((value, i) => metric(type, value, start - i, unit, source))
}

// ─── Body Comp Scenarios ──────────────────────────────────────────────

/** Recomposition scenario: fat down, muscle up */
export const RECOMP_METRICS: SeedMetric[] = [
  // Weight stable around 180
  ...series('weight', [181, 180.5, 180.2, 180, 179.8, 180.1, 179.9, 180], 30),
  // Body fat declining
  ...series('body_fat_percentage', [20, 19.8, 19.5, 19.2, 19, 18.8, 18.5, 18.2], 30),
  // Lean mass increasing
  ...series('lean_body_mass', [144, 144.5, 145, 145.5, 146, 146.5, 147, 147.5], 30),
]

/** Fat loss scenario: fat down, mass stable */
export const FAT_LOSS_METRICS: SeedMetric[] = [
  ...series('weight', [185, 184, 183, 182, 181, 180, 179, 178], 30),
  ...series('body_fat_percentage', [22, 21.5, 21, 20.5, 20, 19.5, 19, 18.5], 30),
  ...series('lean_body_mass', [144, 144, 144.2, 144, 144.1, 144, 143.9, 144], 30),
]

/** Regression scenario: fat up, muscle down */
export const REGRESSING_METRICS: SeedMetric[] = [
  ...series('weight', [180, 181, 182, 183, 184, 185, 186, 187], 30),
  ...series('body_fat_percentage', [18, 18.5, 19, 19.5, 20, 20.5, 21, 21.5], 30),
  ...series('lean_body_mass', [147, 146.5, 146, 145.5, 145, 144.5, 144, 143.5], 30),
]

/** Insufficient data: only 2 points */
export const INSUFFICIENT_METRICS: SeedMetric[] = [
  metric('weight', 180, 10),
  metric('body_fat_percentage', 20, 10),
]

/** Stable scenario: no significant changes */
export const STABLE_METRICS: SeedMetric[] = [
  ...series('weight', [180, 180.1, 179.9, 180.2, 179.8, 180, 180.1, 179.9], 30),
  ...series('body_fat_percentage', [20, 20.1, 19.9, 20, 20.1, 19.9, 20, 20], 30),
  ...series('lean_body_mass', [144, 144, 144.1, 143.9, 144, 144, 144.1, 143.9], 30),
]

// ─── Metabolic Adaptation Scenario ────────────────────────────────────

/** Basal calories declining >3%, weight stalled.
 *  Data must span the right windows:
 *  - basalPrior: avgInRange('basal_calories', 28d ago, 7d ago) → ~2000
 *  - basalRecent: avgInRange('basal_calories', 7d ago, today) → ~1900 (>3% drop)
 *  - weightPrior: avgInRange('weight', 21d ago, 7d ago) → ~180
 *  - weightRecent: avgInRange('weight', 7d ago, today) → ~180 (stalled <0.5%)
 */
export const METABOLIC_ADAPTATION_METRICS: SeedMetric[] = [
  // Weight: stalled across both windows
  metric('weight', 180.0, 25), metric('weight', 180.1, 20),
  metric('weight', 179.9, 15), metric('weight', 180.0, 10),
  metric('weight', 180.1, 5), metric('weight', 179.9, 3),
  metric('weight', 180.0, 1), metric('weight', 180.0, 0),
  // Body fat: stable
  metric('body_fat_percentage', 20, 25), metric('body_fat_percentage', 20, 20),
  metric('body_fat_percentage', 20, 15), metric('body_fat_percentage', 20, 10),
  metric('body_fat_percentage', 20, 5), metric('body_fat_percentage', 20, 1),
  // Lean mass: stable
  metric('lean_body_mass', 144, 25), metric('lean_body_mass', 144, 20),
  metric('lean_body_mass', 144, 15), metric('lean_body_mass', 144, 10),
  metric('lean_body_mass', 144, 5), metric('lean_body_mass', 144, 1),
  // Basal calories: ~2000 in prior window (28-7d ago), ~1900 in recent (7-0d ago) → >5% drop
  metric('basal_calories', 2000, 25), metric('basal_calories', 2010, 20),
  metric('basal_calories', 1990, 15), metric('basal_calories', 2000, 10),
  metric('basal_calories', 1890, 5), metric('basal_calories', 1880, 3),
  metric('basal_calories', 1870, 1), metric('basal_calories', 1860, 0),
]

// ─── Effect Size Test Data ────────────────────────────────────────────

/** Known before/after with pre-computed expected Cohen's d */
export const KNOWN_EFFECT_SIZE = {
  before: [50, 52, 48, 51, 49, 50, 53, 47, 52, 50],  // mean=50.2, std≈1.81
  after: [55, 57, 53, 56, 54, 55, 58, 52, 57, 55],   // mean=55.2, std≈1.81
  expectedD: 2.76, // (55.2-50.2)/1.81 ≈ 2.76 (large effect)
}

/** No effect scenario */
export const NO_EFFECT_DATA = {
  before: [60, 62, 58, 61, 63, 59, 64, 60, 62, 61],
  after: [61, 59, 63, 60, 62, 58, 61, 63, 60, 62],
}

// ─── Empty / Edge Cases ──────────────────────────────────────────────

export const EMPTY_METRICS: SeedMetric[] = []
export const SINGLE_POINT: SeedMetric[] = [metric('weight', 180, 0)]
export const ALL_ZEROS: number[] = [0, 0, 0, 0, 0]
