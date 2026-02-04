// Health metric bounds and validation
// Defines physiologically reasonable bounds to catch illogical values early

export const METRIC_BOUNDS = {
  // Sleep metrics
  sleep_duration: { min: 0, max: 14, unit: 'hours', maxDailyChange: 4, maxWeeklyChange: 25 },
  deep_sleep: { min: 0, max: 6, unit: 'hours', maxDailyChange: 2, maxWeeklyChange: 50 },
  rem_sleep: { min: 0, max: 5, unit: 'hours', maxDailyChange: 2, maxWeeklyChange: 50 },
  light_sleep: { min: 0, max: 10, unit: 'hours', maxDailyChange: 3, maxWeeklyChange: 50 },
  sleep_efficiency: { min: 0, max: 100, unit: 'percent', maxDailyChange: 20, maxWeeklyChange: 30 },

  // Heart metrics
  resting_heart_rate: { min: 30, max: 150, unit: 'bpm', maxDailyChange: 15, maxWeeklyChange: 20 },
  hrv: { min: 5, max: 200, unit: 'ms', maxDailyChange: 30, maxWeeklyChange: 40 },

  // Activity metrics
  steps: { min: 0, max: 100000, unit: 'steps', maxDailyChange: null, maxWeeklyChange: 100 },
  active_calories: { min: 0, max: 5000, unit: 'kcal', maxDailyChange: null, maxWeeklyChange: 100 },

  // Body composition
  weight: { min: 50, max: 500, unit: 'lbs', maxDailyChange: 3, maxWeeklyChange: 5 },
  body_fat: { min: 3, max: 60, unit: 'percent', maxDailyChange: 2, maxWeeklyChange: 5 },
} as const;

export type MetricType = keyof typeof METRIC_BOUNDS;

export function validateMetricValue(type: MetricType, value: number): boolean {
  const bounds = METRIC_BOUNDS[type];
  if (!bounds) return true;
  return value >= bounds.min && value <= bounds.max;
}

export function validateChangePercent(type: MetricType, percent: number, period: 'daily' | 'weekly'): number {
  const bounds = METRIC_BOUNDS[type];
  if (!bounds) return percent;

  const maxChange = period === 'daily' ? bounds.maxDailyChange : bounds.maxWeeklyChange;
  if (maxChange === null) return percent;

  // Flag but don't clamp - return the value but log a warning
  if (Math.abs(percent) > maxChange * 2) {
    console.warn(`Suspicious ${period} change for ${type}: ${percent}% (expected max: +/-${maxChange}%)`);
  }

  return percent;
}

export function clampPercent(percent: number, min = -500, max = 500): number {
  return Math.max(min, Math.min(max, percent));
}
