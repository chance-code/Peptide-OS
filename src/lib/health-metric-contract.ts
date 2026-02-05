// Health Metric Contract — Single Source of Truth
// Consolidates metric bounds, polarity, optimal ranges, display names, and formatting
// All other files should import from here instead of maintaining their own copies

export type MetricCategory = 'sleep' | 'recovery' | 'activity' | 'bodyComp' | 'vitals' | 'readiness'
export type MetricPolarity = 'higher_better' | 'lower_better' | 'neutral'

export interface MetricDefinition {
  key: string
  displayName: string
  category: MetricCategory
  unit: string                      // Storage unit (min, ms, bpm, lbs, etc.)
  displayUnit: string               // Display suffix (ms, bpm, lbs, %, etc.)
  polarity: MetricPolarity
  bounds: { min: number; max: number }
  optimalRange?: { min: number; optimal: number; max: number }
  maxDailyChange: number | null
  maxWeeklyChange: number
  stableThreshold: number           // % threshold for "stable" (default 5)
  format: (value: number) => string // Custom display formatter
}

// ─── Formatters ─────────────────────────────────────────────────────────

function fmtMinutes(value: number): string {
  const hours = Math.floor(value / 60)
  const mins = Math.round(value % 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function fmtScore(value: number): string {
  return `${Math.round(value)}`
}

function fmtMs(value: number): string {
  return `${Math.round(value)} ms`
}

function fmtBpm(value: number): string {
  return `${Math.round(value)} bpm`
}

function fmtLbs(value: number): string {
  return `${value.toFixed(1)} lbs`
}

function fmtSteps(value: number): string {
  return value.toLocaleString()
}

function fmtCelsius(value: number): string {
  return `${value.toFixed(1)}°C`
}

function fmtPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtKcal(value: number): string {
  return `${Math.round(value)} kcal`
}

function fmtHours(value: number): string {
  return `${Math.round(value)}h`
}

function fmtVO2(value: number): string {
  return `${value.toFixed(1)} mL/kg/min`
}

function fmtKm(value: number): string {
  const km = value * 1.60934
  return `${km.toFixed(2)} km`
}

function fmtBreaths(value: number): string {
  return `${value.toFixed(1)} br/min`
}

function fmtTempDeviation(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}°C`
}

// ─── Registry ───────────────────────────────────────────────────────────

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  // ── Sleep ────────────────────────────────────────────────────────────
  sleep_duration: {
    key: 'sleep_duration', displayName: 'Sleep Duration', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 720 },
    optimalRange: { min: 360, optimal: 450, max: 540 },
    maxDailyChange: 240, maxWeeklyChange: 25, stableThreshold: 5,
    format: fmtMinutes,
  },
  deep_sleep: {
    key: 'deep_sleep', displayName: 'Deep Sleep', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 180 },
    optimalRange: { min: 45, optimal: 75, max: 120 },
    maxDailyChange: 90, maxWeeklyChange: 50, stableThreshold: 10,
    format: fmtMinutes,
  },
  rem_sleep: {
    key: 'rem_sleep', displayName: 'REM Sleep', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 210 },
    optimalRange: { min: 60, optimal: 90, max: 120 },
    maxDailyChange: 90, maxWeeklyChange: 50, stableThreshold: 10,
    format: fmtMinutes,
  },
  light_sleep: {
    key: 'light_sleep', displayName: 'Light Sleep', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'neutral',
    bounds: { min: 0, max: 420 },
    maxDailyChange: 180, maxWeeklyChange: 50, stableThreshold: 10,
    format: fmtMinutes,
  },
  sleep_efficiency: {
    key: 'sleep_efficiency', displayName: 'Sleep Efficiency', category: 'sleep',
    unit: '%', displayUnit: '%', polarity: 'higher_better',
    bounds: { min: 0, max: 100 },
    optimalRange: { min: 85, optimal: 92, max: 100 },
    maxDailyChange: 20, maxWeeklyChange: 30, stableThreshold: 3,
    format: fmtPercent,
  },
  sleep_score: {
    key: 'sleep_score', displayName: 'Sleep Score', category: 'sleep',
    unit: 'score', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 100 },
    optimalRange: { min: 60, optimal: 85, max: 100 },
    maxDailyChange: 30, maxWeeklyChange: 25, stableThreshold: 5,
    format: fmtScore,
  },
  time_in_bed: {
    key: 'time_in_bed', displayName: 'Time in Bed', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'neutral',
    bounds: { min: 0, max: 840 },
    optimalRange: { min: 420, optimal: 480, max: 540 },
    maxDailyChange: 240, maxWeeklyChange: 30, stableThreshold: 5,
    format: fmtMinutes,
  },
  waso: {
    key: 'waso', displayName: 'Wake After Sleep Onset', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'lower_better',
    bounds: { min: 0, max: 300 },
    maxDailyChange: 60, maxWeeklyChange: 50, stableThreshold: 10,
    format: fmtMinutes,
  },
  sleep_latency: {
    key: 'sleep_latency', displayName: 'Sleep Latency', category: 'sleep',
    unit: 'min', displayUnit: '', polarity: 'lower_better',
    bounds: { min: 0, max: 180 },
    maxDailyChange: 60, maxWeeklyChange: 50, stableThreshold: 10,
    format: fmtMinutes,
  },

  // ── Recovery ─────────────────────────────────────────────────────────
  hrv: {
    key: 'hrv', displayName: 'HRV', category: 'recovery',
    unit: 'ms', displayUnit: 'ms', polarity: 'higher_better',
    bounds: { min: 5, max: 200 },
    optimalRange: { min: 20, optimal: 50, max: 120 },
    maxDailyChange: 30, maxWeeklyChange: 40, stableThreshold: 8,
    format: fmtMs,
  },
  rhr: {
    key: 'rhr', displayName: 'Resting Heart Rate', category: 'recovery',
    unit: 'bpm', displayUnit: 'bpm', polarity: 'lower_better',
    bounds: { min: 30, max: 150 },
    optimalRange: { min: 40, optimal: 55, max: 75 },
    maxDailyChange: 15, maxWeeklyChange: 20, stableThreshold: 5,
    format: fmtBpm,
  },
  resting_heart_rate: {
    key: 'resting_heart_rate', displayName: 'Resting Heart Rate', category: 'recovery',
    unit: 'bpm', displayUnit: 'bpm', polarity: 'lower_better',
    bounds: { min: 30, max: 150 },
    optimalRange: { min: 40, optimal: 55, max: 75 },
    maxDailyChange: 15, maxWeeklyChange: 20, stableThreshold: 5,
    format: fmtBpm,
  },

  // ── Activity ─────────────────────────────────────────────────────────
  steps: {
    key: 'steps', displayName: 'Steps', category: 'activity',
    unit: 'steps', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 100000 },
    optimalRange: { min: 5000, optimal: 10000, max: 20000 },
    maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15,
    format: fmtSteps,
  },
  active_calories: {
    key: 'active_calories', displayName: 'Active Calories', category: 'activity',
    unit: 'kcal', displayUnit: 'kcal', polarity: 'higher_better',
    bounds: { min: 0, max: 5000 },
    optimalRange: { min: 200, optimal: 500, max: 1000 },
    maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15,
    format: fmtKcal,
  },
  basal_calories: {
    key: 'basal_calories', displayName: 'Basal Calories', category: 'activity',
    unit: 'kcal', displayUnit: 'kcal', polarity: 'neutral',
    bounds: { min: 800, max: 3500 },
    optimalRange: { min: 1200, optimal: 1800, max: 2500 },
    maxDailyChange: 200, maxWeeklyChange: 10, stableThreshold: 3,
    format: fmtKcal,
  },
  exercise_minutes: {
    key: 'exercise_minutes', displayName: 'Exercise', category: 'activity',
    unit: 'min', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 480 },
    optimalRange: { min: 15, optimal: 30, max: 90 },
    maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15,
    format: fmtMinutes,
  },
  stand_hours: {
    key: 'stand_hours', displayName: 'Stand Hours', category: 'activity',
    unit: 'hrs', displayUnit: 'h', polarity: 'higher_better',
    bounds: { min: 0, max: 24 },
    optimalRange: { min: 6, optimal: 12, max: 16 },
    maxDailyChange: null, maxWeeklyChange: 50, stableThreshold: 10,
    format: fmtHours,
  },
  walking_running_distance: {
    key: 'walking_running_distance', displayName: 'Distance', category: 'activity',
    unit: 'mi', displayUnit: 'km', polarity: 'higher_better',
    bounds: { min: 0, max: 50 },
    optimalRange: { min: 2, optimal: 5, max: 15 },
    maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15,
    format: fmtKm,
  },
  vo2_max: {
    key: 'vo2_max', displayName: 'VO2 Max', category: 'activity',
    unit: 'mL/kg/min', displayUnit: 'mL/kg/min', polarity: 'higher_better',
    bounds: { min: 15, max: 90 },
    optimalRange: { min: 30, optimal: 45, max: 60 },
    maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 2,
    format: fmtVO2,
  },

  // ── Body Composition ─────────────────────────────────────────────────
  weight: {
    key: 'weight', displayName: 'Weight', category: 'bodyComp',
    unit: 'lbs', displayUnit: 'lbs', polarity: 'neutral',
    bounds: { min: 50, max: 500 },
    maxDailyChange: 3, maxWeeklyChange: 5, stableThreshold: 1,
    format: fmtLbs,
  },
  body_fat_percentage: {
    key: 'body_fat_percentage', displayName: 'Body Fat', category: 'bodyComp',
    unit: '%', displayUnit: '%', polarity: 'lower_better',
    bounds: { min: 3, max: 60 },
    optimalRange: { min: 6, optimal: 15, max: 25 },
    maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 2,
    format: fmtPercent,
  },
  body_fat: {
    key: 'body_fat', displayName: 'Body Fat', category: 'bodyComp',
    unit: '%', displayUnit: '%', polarity: 'lower_better',
    bounds: { min: 3, max: 60 },
    optimalRange: { min: 6, optimal: 15, max: 25 },
    maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 2,
    format: fmtPercent,
  },
  lean_body_mass: {
    key: 'lean_body_mass', displayName: 'Lean Mass', category: 'bodyComp',
    unit: 'lbs', displayUnit: 'lbs', polarity: 'higher_better',
    bounds: { min: 50, max: 300 },
    maxDailyChange: 3, maxWeeklyChange: 5, stableThreshold: 1,
    format: fmtLbs,
  },
  muscle_mass: {
    key: 'muscle_mass', displayName: 'Muscle Mass', category: 'bodyComp',
    unit: 'lbs', displayUnit: 'lbs', polarity: 'higher_better',
    bounds: { min: 30, max: 200 },
    maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 1,
    format: fmtLbs,
  },
  bmi: {
    key: 'bmi', displayName: 'BMI', category: 'bodyComp',
    unit: '', displayUnit: '', polarity: 'neutral',
    bounds: { min: 12, max: 60 },
    optimalRange: { min: 18.5, optimal: 22, max: 25 },
    maxDailyChange: 1, maxWeeklyChange: 3, stableThreshold: 1,
    format: fmtScore,
  },
  bone_mass: {
    key: 'bone_mass', displayName: 'Bone Mass', category: 'bodyComp',
    unit: 'lbs', displayUnit: 'lbs', polarity: 'higher_better',
    bounds: { min: 1, max: 15 },
    maxDailyChange: 0.5, maxWeeklyChange: 2, stableThreshold: 1,
    format: fmtLbs,
  },
  body_water: {
    key: 'body_water', displayName: 'Body Water', category: 'bodyComp',
    unit: '%', displayUnit: '%', polarity: 'higher_better',
    bounds: { min: 30, max: 80 },
    optimalRange: { min: 45, optimal: 55, max: 65 },
    maxDailyChange: 5, maxWeeklyChange: 10, stableThreshold: 3,
    format: fmtPercent,
  },

  // ── Vitals ───────────────────────────────────────────────────────────
  respiratory_rate: {
    key: 'respiratory_rate', displayName: 'Respiratory Rate', category: 'vitals',
    unit: 'br/min', displayUnit: 'br/min', polarity: 'neutral',
    bounds: { min: 8, max: 30 },
    optimalRange: { min: 12, optimal: 14, max: 20 },
    maxDailyChange: 5, maxWeeklyChange: 15, stableThreshold: 5,
    format: fmtBreaths,
  },
  blood_oxygen: {
    key: 'blood_oxygen', displayName: 'Blood Oxygen', category: 'vitals',
    unit: '%', displayUnit: '%', polarity: 'higher_better',
    bounds: { min: 85, max: 100 },
    optimalRange: { min: 95, optimal: 98, max: 100 },
    maxDailyChange: 5, maxWeeklyChange: 5, stableThreshold: 2,
    format: fmtPercent,
  },
  body_temperature: {
    key: 'body_temperature', displayName: 'Body Temp', category: 'vitals',
    unit: '°C', displayUnit: '°C', polarity: 'neutral',
    bounds: { min: 35, max: 40 },
    optimalRange: { min: 36, optimal: 36.8, max: 37.5 },
    maxDailyChange: 1, maxWeeklyChange: 2, stableThreshold: 1,
    format: fmtCelsius,
  },

  // ── Readiness & Recovery (Oura) ──────────────────────────────────────
  readiness_score: {
    key: 'readiness_score', displayName: 'Readiness Score', category: 'readiness',
    unit: 'score', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 100 },
    optimalRange: { min: 60, optimal: 85, max: 100 },
    maxDailyChange: 30, maxWeeklyChange: 25, stableThreshold: 5,
    format: fmtScore,
  },
  temperature_deviation: {
    key: 'temperature_deviation', displayName: 'Temp Deviation', category: 'readiness',
    unit: '°C', displayUnit: '°C', polarity: 'neutral',
    bounds: { min: -3, max: 3 },
    optimalRange: { min: -0.5, optimal: 0, max: 0.5 },
    maxDailyChange: 1, maxWeeklyChange: 2, stableThreshold: 10,
    format: fmtTempDeviation,
  },
  stress_high: {
    key: 'stress_high', displayName: 'High Stress', category: 'readiness',
    unit: 'min', displayUnit: 'm', polarity: 'lower_better',
    bounds: { min: 0, max: 1440 },
    optimalRange: { min: 0, optimal: 0, max: 60 },
    maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15,
    format: (v) => `${Math.round(v)}m`,
  },
  recovery_high: {
    key: 'recovery_high', displayName: 'Recovery Time', category: 'readiness',
    unit: 'min', displayUnit: 'm', polarity: 'higher_better',
    bounds: { min: 0, max: 1440 },
    optimalRange: { min: 60, optimal: 180, max: 360 },
    maxDailyChange: null, maxWeeklyChange: 50, stableThreshold: 10,
    format: (v) => `${Math.round(v)}m`,
  },
  resilience_level: {
    key: 'resilience_level', displayName: 'Resilience', category: 'readiness',
    unit: 'score', displayUnit: '', polarity: 'higher_better',
    bounds: { min: 0, max: 100 },
    optimalRange: { min: 20, optimal: 80, max: 100 },
    maxDailyChange: 20, maxWeeklyChange: 20, stableThreshold: 5,
    format: fmtScore,
  },

  // ── WHOOP-specific ──────────────────────────────────────────────────
  strain_score: {
    key: 'strain_score', displayName: 'Strain', category: 'activity',
    unit: 'score', displayUnit: '', polarity: 'neutral',
    bounds: { min: 0, max: 21 },
    optimalRange: { min: 8, optimal: 14, max: 18 },
    maxDailyChange: null, maxWeeklyChange: 50, stableThreshold: 10,
    format: (v) => v.toFixed(1),
  },
  recovery_score: {
    key: 'recovery_score', displayName: 'Recovery', category: 'recovery',
    unit: '%', displayUnit: '%', polarity: 'higher_better',
    bounds: { min: 0, max: 100 },
    optimalRange: { min: 34, optimal: 67, max: 100 },
    maxDailyChange: null, maxWeeklyChange: 30, stableThreshold: 10,
    format: (v) => `${Math.round(v)}%`,
  },

  // ── Sleep Sub-metrics ────────────────────────────────────────────────
  bed_temperature: {
    key: 'bed_temperature', displayName: 'Bed Temperature', category: 'sleep',
    unit: '°C', displayUnit: '°C', polarity: 'neutral',
    bounds: { min: 10, max: 40 },
    optimalRange: { min: 16, optimal: 18.5, max: 21 },
    maxDailyChange: 5, maxWeeklyChange: 10, stableThreshold: 5,
    format: fmtCelsius,
  },
}

// ─── Convenience Functions ──────────────────────────────────────────────

/** Get a metric definition by key. Returns undefined for unknown metrics. */
export function getMetricDef(key: string): MetricDefinition | undefined {
  return METRIC_REGISTRY[key]
}

/** Get all metric definitions for a given category. */
export function getMetricsByCategory(category: MetricCategory): MetricDefinition[] {
  return Object.values(METRIC_REGISTRY).filter(m => m.category === category)
}

/** Format a metric value for display using the metric's custom formatter. */
export function formatMetric(key: string, value: number): string {
  const def = METRIC_REGISTRY[key]
  if (!def) return String(value)
  return def.format(value)
}

/** Get polarity for a metric. Defaults to 'neutral' for unknown metrics. */
export function getPolarity(key: string): MetricPolarity {
  return METRIC_REGISTRY[key]?.polarity ?? 'neutral'
}

/** Get display name for a metric. Falls back to the key itself. */
export function getDisplayName(key: string): string {
  return METRIC_REGISTRY[key]?.displayName ?? key
}

/** Get the stable threshold for a metric. Defaults to 5%. */
export function getStableThresholdFromContract(key: string): number {
  return METRIC_REGISTRY[key]?.stableThreshold ?? 5
}

/** Get optimal range for a metric. Returns undefined if not applicable. */
export function getOptimalRange(key: string): { min: number; optimal: number; max: number } | undefined {
  return METRIC_REGISTRY[key]?.optimalRange
}

/** Get bounds for a metric. Returns undefined for unknown metrics. */
export function getBounds(key: string): { min: number; max: number } | undefined {
  return METRIC_REGISTRY[key] ? METRIC_REGISTRY[key].bounds : undefined
}

/**
 * Derive a METRIC_POLARITY record compatible with existing code.
 * This lets us phase out the old scattered polarity maps gradually.
 */
export function derivePolarityMap(): Record<string, MetricPolarity> {
  const map: Record<string, MetricPolarity> = {}
  for (const [key, def] of Object.entries(METRIC_REGISTRY)) {
    map[key] = def.polarity
  }
  return map
}

/**
 * Derive OPTIMAL_RANGES compatible with existing health-synthesis.ts format.
 */
export function deriveOptimalRanges(): Record<string, { min: number; optimal: number; max: number; unit: string }> {
  const ranges: Record<string, { min: number; optimal: number; max: number; unit: string }> = {}
  for (const [key, def] of Object.entries(METRIC_REGISTRY)) {
    if (def.optimalRange) {
      ranges[key] = { ...def.optimalRange, unit: def.unit }
    } else {
      // For metrics without optimal ranges (individual-dependent), use zero placeholder
      ranges[key] = { min: 0, optimal: 0, max: 0, unit: def.unit }
    }
  }
  return ranges
}

/**
 * Derive METRIC_BOUNDS compatible with existing health-constants.ts format.
 */
export function deriveBoundsMap(): Record<string, { min: number; max: number; unit: string; maxDailyChange: number | null; maxWeeklyChange: number; stableThreshold: number }> {
  const map: Record<string, { min: number; max: number; unit: string; maxDailyChange: number | null; maxWeeklyChange: number; stableThreshold: number }> = {}
  for (const [key, def] of Object.entries(METRIC_REGISTRY)) {
    map[key] = {
      min: def.bounds.min,
      max: def.bounds.max,
      unit: def.unit,
      maxDailyChange: def.maxDailyChange,
      maxWeeklyChange: def.maxWeeklyChange,
      stableThreshold: def.stableThreshold,
    }
  }
  return map
}

/** Map metric key to category. Returns undefined for unknown metrics. */
export function getMetricCategory(key: string): MetricCategory | undefined {
  return METRIC_REGISTRY[key]?.category
}
