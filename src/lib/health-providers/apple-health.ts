// Apple HealthKit Provider
// Uses @flomentumsolutions/capacitor-health-extended for comprehensive health data access
// Supports: weight, body fat, HRV, heart rate, sleep, steps, calories, and more

import {
  HealthProvider,
  HealthMetricInput,
  FetchMetricsResult,
  registerProvider,
  MetricType
} from './index'

// Type definitions for the plugin
interface HealthPlugin {
  isHealthAvailable(): Promise<{ available: boolean }>
  requestHealthPermissions(request: { permissions: string[] }): Promise<{ permissions: Record<string, boolean> }>
  queryAggregated(request: {
    startDate: string
    endDate: string
    dataType: string
    bucket: string
  }): Promise<{ aggregatedData: Array<{ startDate: string; endDate: string; value: number; unit?: string }> }>
  queryLatestSample(request: { dataType: string }): Promise<{
    value: number
    timestamp: number
    unit: string
  } | null>
}

// Dynamic plugin loader - only loads at runtime on iOS
// The native plugin registers as "HealthPlugin" (see HealthPlugin.swift jsName)
// Accessed via Capacitor.Plugins proxy, which works even when loading from a remote URL
async function getHealthPlugin(): Promise<HealthPlugin | null> {
  if (typeof window === 'undefined') return null

  try {
    // Check if running in Capacitor native environment
    const win = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean
        Plugins?: Record<string, HealthPlugin>
      }
    }

    if (!win.Capacitor?.isNativePlatform?.()) {
      return null
    }

    // The Swift plugin registers with jsName = "HealthPlugin"
    // Capacitor creates a proxy in Plugins that forwards calls to native
    const plugin = win.Capacitor?.Plugins?.HealthPlugin
    if (plugin) {
      return plugin
    }

    return null
  } catch (error) {
    console.log('Health plugin not available:', error)
    return null
  }
}

// Permission mapping for each metric type
const PERMISSIONS_FOR_METRICS: Record<string, string[]> = {
  weight: ['READ_WEIGHT'],
  body_fat_percentage: ['READ_BODY_FAT'],
  lean_body_mass: ['READ_LEAN_BODY_MASS'],
  bmi: ['READ_BMI'],
  muscle_mass: ['READ_LEAN_BODY_MASS'], // Uses lean body mass permission
  hrv: ['READ_HRV'],
  rhr: ['READ_RESTING_HEART_RATE'],
  sleep_duration: ['READ_SLEEP'],
  rem_sleep: ['READ_SLEEP'],
  deep_sleep: ['READ_SLEEP'],
  // Derived sleep metrics (calculated on iOS native, synced via HealthSyncManager)
  sleep_efficiency: ['READ_SLEEP'],
  waso: ['READ_SLEEP'],
  sleep_latency: ['READ_SLEEP'],
  steps: ['READ_STEPS'],
  active_calories: ['READ_ACTIVE_CALORIES'],
  basal_calories: ['READ_BASAL_CALORIES'],
  exercise_minutes: ['READ_EXERCISE_TIME'],
  stand_hours: ['READ_STAND_HOURS'],
  vo2_max: ['READ_VO2_MAX'],
  respiratory_rate: ['READ_RESPIRATORY_RATE'],
  blood_oxygen: ['READ_OXYGEN_SATURATION'],
  body_temperature: ['READ_BODY_TEMPERATURE'],
  walking_running_distance: ['READ_DISTANCE']
}

// Map our metric types to plugin data types
const METRIC_TO_DATA_TYPE: Record<string, string> = {
  weight: 'weight',
  body_fat_percentage: 'body-fat',
  lean_body_mass: 'lean-body-mass',
  bmi: 'bmi',
  muscle_mass: 'lean-body-mass', // Approximated via lean body mass
  hrv: 'hrv',
  rhr: 'resting-heart-rate',
  sleep_duration: 'sleep',
  rem_sleep: 'sleep-rem',
  deep_sleep: 'sleep-deep',
  steps: 'steps',
  active_calories: 'active-calories',
  basal_calories: 'basal-calories',
  exercise_minutes: 'exercise-time',
  stand_hours: 'stand-hours',
  vo2_max: 'vo2-max',
  respiratory_rate: 'respiratory-rate',
  blood_oxygen: 'oxygen-saturation',
  body_temperature: 'body-temperature',
  walking_running_distance: 'distance'
}

// Unit conversions
const UNIT_MAP: Record<string, string> = {
  'kg': 'kg',
  'lb': 'lb',
  'count': 'steps',
  'kcal': 'kcal',
  'ms': 'ms',
  'bpm': 'bpm',
  '%': 'percent',
  'min': 'minutes',
  'm': 'km', // We'll convert meters to km
  'breaths/min': 'breaths_min',
  'degC': 'celsius',
  'ml/kg/min': 'ml_kg_min', // VO2 max unit
  'hours': 'hours'
}

// Standalone implementation for fetchMetricsWithStatus
// Extracted so both fetchMetrics and fetchMetricsWithStatus can call it
export async function fetchAppleHealthWithStatus(
  _accessToken: string,
  since: Date,
  metricTypes?: string[]
): Promise<FetchMetricsResult> {
  const metrics: HealthMetricInput[] = []
  const errors: Array<{ metricType: string; error: string }> = []
  const metricCounts: Record<string, number> = {}
  let permissions: Record<string, boolean> = {}

  try {
    const health = await getHealthPlugin()
    if (!health) {
      return { metrics, permissions, errors: [{ metricType: '*', error: 'Apple Health only available on iOS' }], metricCounts }
    }

    const { available } = await health.isHealthAvailable()
    if (!available) {
      return { metrics, permissions, errors: [{ metricType: '*', error: 'HealthKit not available' }], metricCounts }
    }

    // Request permissions and capture result
    const allPermissions = Object.values(PERMISSIONS_FOR_METRICS).flat()
    const permResult = await health.requestHealthPermissions({ permissions: allPermissions })
    permissions = permResult.permissions || {}

    const startDate = since.toISOString()
    const endDate = new Date().toISOString()

    // Determine which metrics to fetch (all or filtered subset)
    const entriesToFetch = metricTypes
      ? Object.entries(METRIC_TO_DATA_TYPE).filter(([mt]) => metricTypes.includes(mt))
      : Object.entries(METRIC_TO_DATA_TYPE)

    for (const [metricType, dataType] of entriesToFetch) {
      try {
        const response = await health.queryAggregated({
          startDate,
          endDate,
          dataType,
          bucket: 'day'
        })

        let count = 0
        if (response.aggregatedData && response.aggregatedData.length > 0) {
          for (const sample of response.aggregatedData) {
            let value = sample.value
            let unit = UNIT_MAP[sample.unit || ''] || sample.unit || 'unknown'

            if (metricType === 'walking_running_distance' && sample.unit === 'm') {
              value = value / 1000
              unit = 'km'
            }
            if (metricType === 'body_fat_percentage' && value < 1) {
              value = value * 100
            }
            if (metricType === 'blood_oxygen' && value < 1) {
              value = value * 100
            }

            if (value === 0) continue

            metrics.push({
              metricType: metricType as MetricType,
              value,
              unit: unit as HealthMetricInput['unit'],
              recordedAt: new Date(sample.startDate),
              context: { source: 'apple_health', dataType }
            })
            count++
          }
        }
        metricCounts[metricType] = count
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push({ metricType, error: msg })
        console.error(`Error fetching ${metricType} from Apple Health:`, msg)
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    errors.push({ metricType: '*', error: msg })
    console.error('Error accessing HealthKit:', msg)
  }

  return { metrics, permissions, errors, metricCounts }
}

const appleHealthProvider: HealthProvider = {
  name: 'apple_health',
  displayName: 'Apple Health',
  description: 'Import all health data from your iPhone, Apple Watch, and connected devices',
  supportedMetrics: [
    // Body composition (Hume scale, smart scales, etc.)
    'weight', 'body_fat_percentage', 'lean_body_mass', 'bmi', 'muscle_mass',
    // Heart & HRV
    'hrv', 'rhr',
    // Sleep (duration, stages, and derived metrics)
    // Note: sleep_efficiency, waso, sleep_latency are calculated on iOS native
    // from raw sleep samples and synced via HealthSyncManager. The Capacitor plugin
    // doesn't expose raw samples needed for web-side calculation.
    'sleep_duration', 'rem_sleep', 'deep_sleep',
    'sleep_efficiency', 'waso', 'sleep_latency',
    // Activity
    'steps', 'active_calories', 'basal_calories', 'exercise_minutes',
    'stand_hours', 'walking_running_distance',
    // Fitness
    'vo2_max',
    // Vitals
    'respiratory_rate', 'blood_oxygen', 'body_temperature',
  ] as MetricType[],
  requiresOAuth: false,
  isNativeOnly: true,

  // Apple Health doesn't use OAuth - it uses native permissions
  getAuthUrl(): string {
    throw new Error('Apple Health uses native permissions, not OAuth')
  },

  async fetchMetrics(_accessToken: string, since: Date): Promise<HealthMetricInput[]> {
    const result = await fetchAppleHealthWithStatus(_accessToken, since)
    return result.metrics
  },

  async fetchMetricsWithStatus(
    _accessToken: string,
    since: Date,
    metricTypes?: string[]
  ): Promise<FetchMetricsResult> {
    return fetchAppleHealthWithStatus(_accessToken, since, metricTypes)
  }
}

// Register the provider
registerProvider(appleHealthProvider)

export default appleHealthProvider

// Helper function to check if HealthKit is available (for UI)
export async function isHealthKitAvailable(): Promise<boolean> {
  try {
    const health = await getHealthPlugin()
    if (!health) return false
    const { available } = await health.isHealthAvailable()
    return available
  } catch {
    return false
  }
}

// Helper function to request HealthKit permissions
export async function requestHealthKitPermissions(): Promise<boolean> {
  try {
    const health = await getHealthPlugin()
    if (!health) return false
    const allPermissions = Object.values(PERMISSIONS_FOR_METRICS).flat()
    await health.requestHealthPermissions({ permissions: allPermissions })
    return true
  } catch (error) {
    console.error('Error requesting HealthKit permissions:', error)
    return false
  }
}
