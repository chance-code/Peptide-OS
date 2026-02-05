// Health metric bounds and validation
// Defines physiologically reasonable bounds to catch illogical values early

export const METRIC_BOUNDS: Record<string, {
  min: number
  max: number
  unit: string
  maxDailyChange: number | null
  maxWeeklyChange: number
  stableThreshold?: number // metric-specific % threshold for "stable" (default 5%)
}> = {
  // Sleep metrics (stored in minutes in DB)
  sleep_duration: { min: 0, max: 840, unit: 'min', maxDailyChange: 240, maxWeeklyChange: 25, stableThreshold: 5 },
  deep_sleep: { min: 0, max: 360, unit: 'min', maxDailyChange: 120, maxWeeklyChange: 50, stableThreshold: 10 },
  rem_sleep: { min: 0, max: 300, unit: 'min', maxDailyChange: 120, maxWeeklyChange: 50, stableThreshold: 10 },
  light_sleep: { min: 0, max: 600, unit: 'min', maxDailyChange: 180, maxWeeklyChange: 50, stableThreshold: 10 },
  sleep_efficiency: { min: 0, max: 100, unit: '%', maxDailyChange: 20, maxWeeklyChange: 30, stableThreshold: 3 },
  sleep_score: { min: 0, max: 100, unit: 'score', maxDailyChange: 30, maxWeeklyChange: 25, stableThreshold: 5 },
  time_in_bed: { min: 0, max: 960, unit: 'min', maxDailyChange: 240, maxWeeklyChange: 30, stableThreshold: 5 },

  // Heart & Recovery metrics
  hrv: { min: 5, max: 200, unit: 'ms', maxDailyChange: 30, maxWeeklyChange: 40, stableThreshold: 8 },
  rhr: { min: 30, max: 150, unit: 'bpm', maxDailyChange: 15, maxWeeklyChange: 20, stableThreshold: 5 },
  resting_heart_rate: { min: 30, max: 150, unit: 'bpm', maxDailyChange: 15, maxWeeklyChange: 20, stableThreshold: 5 },

  // Activity metrics
  steps: { min: 0, max: 100000, unit: 'steps', maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15 },
  active_calories: { min: 0, max: 5000, unit: 'kcal', maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15 },
  basal_calories: { min: 800, max: 3500, unit: 'kcal', maxDailyChange: 200, maxWeeklyChange: 10, stableThreshold: 3 },
  exercise_minutes: { min: 0, max: 480, unit: 'min', maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15 },
  stand_hours: { min: 0, max: 24, unit: 'hrs', maxDailyChange: null, maxWeeklyChange: 50, stableThreshold: 10 },
  walking_running_distance: { min: 0, max: 50, unit: 'mi', maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15 },
  vo2_max: { min: 15, max: 90, unit: 'mL/kg/min', maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 2 },

  // Body composition
  weight: { min: 50, max: 500, unit: 'lbs', maxDailyChange: 3, maxWeeklyChange: 5, stableThreshold: 1 },
  body_fat_percentage: { min: 3, max: 60, unit: '%', maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 2 },
  body_fat: { min: 3, max: 60, unit: '%', maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 2 },
  lean_body_mass: { min: 50, max: 300, unit: 'lbs', maxDailyChange: 3, maxWeeklyChange: 5, stableThreshold: 1 },
  muscle_mass: { min: 30, max: 200, unit: 'lbs', maxDailyChange: 2, maxWeeklyChange: 5, stableThreshold: 1 },
  bmi: { min: 12, max: 60, unit: '', maxDailyChange: 1, maxWeeklyChange: 3, stableThreshold: 1 },
  bone_mass: { min: 1, max: 15, unit: 'lbs', maxDailyChange: 0.5, maxWeeklyChange: 2, stableThreshold: 1 },
  body_water: { min: 30, max: 80, unit: '%', maxDailyChange: 5, maxWeeklyChange: 10, stableThreshold: 3 },

  // Vitals
  respiratory_rate: { min: 8, max: 30, unit: 'br/min', maxDailyChange: 5, maxWeeklyChange: 15, stableThreshold: 5 },
  blood_oxygen: { min: 85, max: 100, unit: '%', maxDailyChange: 5, maxWeeklyChange: 5, stableThreshold: 2 },
  body_temperature: { min: 35, max: 40, unit: '°C', maxDailyChange: 1, maxWeeklyChange: 2, stableThreshold: 1 },

  // Oura readiness & recovery
  readiness_score: { min: 0, max: 100, unit: 'score', maxDailyChange: 30, maxWeeklyChange: 25, stableThreshold: 5 },
  temperature_deviation: { min: -3, max: 3, unit: '°C', maxDailyChange: 1, maxWeeklyChange: 2, stableThreshold: 10 },
  stress_high: { min: 0, max: 1440, unit: 'min', maxDailyChange: null, maxWeeklyChange: 100, stableThreshold: 15 },
  recovery_high: { min: 0, max: 1440, unit: 'min', maxDailyChange: null, maxWeeklyChange: 50, stableThreshold: 10 },
  resilience_level: { min: 0, max: 100, unit: 'score', maxDailyChange: 20, maxWeeklyChange: 20, stableThreshold: 5 },

  // Sleep sub-metrics
  bed_temperature: { min: 10, max: 40, unit: '°C', maxDailyChange: 5, maxWeeklyChange: 10, stableThreshold: 5 },
}

// MetricType is a loose string union — any metric we recognize
// Using the METRIC_BOUNDS keys as the canonical set, but allow string for extensibility
export type MetricType = string

export function validateMetricValue(type: MetricType, value: number): boolean {
  if (!isFinite(value)) return false
  const bounds = METRIC_BOUNDS[type]
  if (!bounds) return true // Unknown metrics pass (no bounds to check)
  return value >= bounds.min && value <= bounds.max
}

export function validateChangePercent(type: MetricType, percent: number, period: 'daily' | 'weekly'): number {
  if (!isFinite(percent)) return 0
  const bounds = METRIC_BOUNDS[type]
  if (!bounds) return percent

  const maxChange = period === 'daily' ? bounds.maxDailyChange : bounds.maxWeeklyChange
  if (maxChange === null) return percent

  // Flag but don't clamp - return the value but log a warning
  if (Math.abs(percent) > maxChange * 2) {
    console.warn(`Suspicious ${period} change for ${type}: ${percent}% (expected max: +/-${maxChange}%)`)
  }

  return percent
}

export function clampPercent(percent: number, min = -500, max = 500): number {
  if (!isFinite(percent)) return 0
  return Math.max(min, Math.min(max, percent))
}

/** Get the metric-specific threshold for "stable" (as a percent). Defaults to 5. */
export function getStableThreshold(type: MetricType): number {
  return METRIC_BOUNDS[type]?.stableThreshold ?? 5
}

/**
 * Validate a metric value at ingest time. Returns { valid, reason, correctedValue? }.
 * Attempts to correct known unit mismatches (e.g., decimal SpO2 → percentage).
 */
export function validateAndCorrectMetric(
  metricType: string,
  value: number,
  unit: string
): { valid: boolean; reason?: string; correctedValue?: number; correctedUnit?: string } {
  if (!isFinite(value)) {
    return { valid: false, reason: `Non-finite value: ${value}` }
  }

  const bounds = METRIC_BOUNDS[metricType]
  if (!bounds) return { valid: true }

  // Auto-correct known unit mismatches
  if ((metricType === 'blood_oxygen' || metricType === 'body_fat_percentage') && value > 0 && value <= 1) {
    const corrected = value * 100
    if (corrected >= bounds.min && corrected <= bounds.max) {
      return { valid: true, correctedValue: corrected, correctedUnit: '%', reason: 'Converted decimal to percentage' }
    }
  }

  // Sleep duration: detect if sent in hours instead of minutes
  if ((metricType === 'sleep_duration' || metricType === 'deep_sleep' || metricType === 'rem_sleep' ||
       metricType === 'light_sleep' || metricType === 'time_in_bed') && value > 0 && value <= 24) {
    // Value looks like hours, bounds expect minutes
    if (bounds.max > 100 && value < bounds.min) {
      const corrected = value * 60
      if (corrected >= bounds.min && corrected <= bounds.max) {
        return { valid: true, correctedValue: corrected, correctedUnit: 'min', reason: 'Converted hours to minutes' }
      }
    }
  }

  // Reject values outside bounds
  if (value < bounds.min || value > bounds.max) {
    return { valid: false, reason: `Value ${value} outside bounds [${bounds.min}, ${bounds.max}] for ${metricType}` }
  }

  return { valid: true }
}

/** Safe division that returns null instead of NaN/Infinity */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return null
  const result = numerator / denominator
  return isFinite(result) ? result : null
}

/** Safe percent change that returns null instead of NaN/Infinity */
export function safePercentChange(current: number, previous: number): number | null {
  const result = safeDivide(current - previous, previous)
  if (result === null) return null
  return clampPercent(result * 100)
}
