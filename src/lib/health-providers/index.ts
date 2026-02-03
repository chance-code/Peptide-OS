// Health Provider Infrastructure
// Unified interface for Apple HealthKit, Oura, and Eight Sleep integrations

export type HealthProviderType = 'apple_health' | 'oura' | 'eight_sleep'

export type MetricType =
  | 'sleep_duration'
  | 'rem_sleep'
  | 'sleep_score'
  | 'hrv'
  | 'rhr'
  | 'weight'
  | 'steps'
  | 'bed_temperature'
  | 'time_in_bed'
  // Body composition (Hume scale, etc.)
  | 'body_fat_percentage'
  | 'lean_body_mass'
  | 'bmi'
  | 'bone_mass'
  | 'muscle_mass'
  | 'body_water'
  // Activity & Fitness
  | 'active_calories'
  | 'basal_calories'
  | 'exercise_minutes'
  | 'stand_hours'
  | 'vo2_max'
  | 'walking_running_distance'
  // Vitals
  | 'respiratory_rate'
  | 'blood_oxygen'
  | 'body_temperature'

export type MetricUnit =
  | 'minutes'
  | 'ms'
  | 'bpm'
  | 'score'
  | 'kg'
  | 'lbs'
  | 'steps'
  | 'celsius'
  | 'percent'
  | 'kcal'
  | 'hours'
  | 'ml_kg_min'
  | 'km'
  | 'breaths_min'

export interface MetricSyncState {
  [metricType: string]: {
    lastSyncAt: string | null
    status: 'ok' | 'permission_denied' | 'error' | 'no_data'
    lastError?: string
    dataPoints?: number
  }
}

export interface FetchMetricsResult {
  metrics: HealthMetricInput[]
  permissions?: Record<string, boolean>
  errors?: Array<{ metricType: string; error: string }>
  metricCounts?: Record<string, number>
}

export interface TokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn?: number // seconds until expiry
}

export interface HealthMetricInput {
  metricType: MetricType
  value: number
  unit: MetricUnit
  recordedAt: Date
  context?: Record<string, unknown>
}

export interface HealthProvider {
  name: HealthProviderType
  displayName: string
  description: string
  supportedMetrics: MetricType[]
  requiresOAuth: boolean

  // OAuth flow (for Oura and Eight Sleep)
  getAuthUrl?(userId: string, redirectUri: string): string
  exchangeCode?(code: string, redirectUri: string): Promise<TokenResponse>
  refreshToken?(refreshToken: string): Promise<TokenResponse>
  revokeAccess?(accessToken: string): Promise<void>

  // Data fetching
  fetchMetrics(accessToken: string, since: Date): Promise<HealthMetricInput[]>

  // Enhanced fetch with per-metric status reporting
  fetchMetricsWithStatus?(
    accessToken: string,
    since: Date,
    metricTypes?: string[]
  ): Promise<FetchMetricsResult>

  // For Apple HealthKit - native permissions (handled differently)
  isNativeOnly?: boolean
}

export interface ProviderInfo {
  name: HealthProviderType
  displayName: string
  description: string
  supportedMetrics: MetricType[]
  requiresOAuth: boolean
  requiresCredentials: boolean // For email/password auth like Eight Sleep
  isNativeOnly: boolean
  icon: string
}

// Provider registry
const providers = new Map<HealthProviderType, HealthProvider>()

export function registerProvider(provider: HealthProvider): void {
  providers.set(provider.name, provider)
}

export function getProvider(name: HealthProviderType): HealthProvider | undefined {
  return providers.get(name)
}

export function getAllProviders(): HealthProvider[] {
  return Array.from(providers.values())
}

export function getProviderInfo(): ProviderInfo[] {
  return [
    {
      name: 'apple_health',
      displayName: 'Apple Health',
      description: 'Import all health data from your iPhone, Apple Watch, and connected devices (scales, etc.)',
      supportedMetrics: [
        'sleep_duration', 'rem_sleep', 'hrv', 'rhr', 'weight', 'steps',
        'body_fat_percentage', 'lean_body_mass', 'bmi', 'bone_mass', 'muscle_mass', 'body_water',
        'active_calories', 'basal_calories', 'exercise_minutes', 'stand_hours', 'vo2_max', 'walking_running_distance',
        'respiratory_rate', 'blood_oxygen', 'body_temperature'
      ],
      requiresOAuth: false,
      requiresCredentials: false,
      isNativeOnly: true,
      icon: 'heart'
    },
    {
      name: 'oura',
      displayName: 'Oura Ring',
      description: 'Sync sleep scores, HRV, heart rate, and activity from your Oura Ring',
      supportedMetrics: ['sleep_duration', 'sleep_score', 'hrv', 'rhr', 'steps'],
      requiresOAuth: true,
      requiresCredentials: false,
      isNativeOnly: false,
      icon: 'circle'
    },
    {
      name: 'eight_sleep',
      displayName: 'Eight Sleep',
      description: 'Import sleep scores and bed temperature data from your Eight Sleep mattress',
      supportedMetrics: ['sleep_score', 'time_in_bed', 'bed_temperature'],
      requiresOAuth: false,
      requiresCredentials: true,
      isNativeOnly: false,
      icon: 'bed'
    }
  ]
}

// Helper to normalize metric units for storage
export function normalizeMetricUnit(metricType: MetricType): MetricUnit {
  const unitMap: Record<MetricType, MetricUnit> = {
    sleep_duration: 'minutes',
    rem_sleep: 'minutes',
    sleep_score: 'score',
    hrv: 'ms',
    rhr: 'bpm',
    weight: 'kg',
    steps: 'steps',
    bed_temperature: 'celsius',
    time_in_bed: 'minutes',
    // Body composition
    body_fat_percentage: 'percent',
    lean_body_mass: 'kg',
    bmi: 'score',
    bone_mass: 'kg',
    muscle_mass: 'kg',
    body_water: 'percent',
    // Activity
    active_calories: 'kcal',
    basal_calories: 'kcal',
    exercise_minutes: 'minutes',
    stand_hours: 'hours',
    vo2_max: 'ml_kg_min',
    walking_running_distance: 'km',
    // Vitals
    respiratory_rate: 'breaths_min',
    blood_oxygen: 'percent',
    body_temperature: 'celsius'
  }
  return unitMap[metricType]
}

// Helper to format metric values for display
export function formatMetricValue(value: number, metricType: MetricType): string {
  switch (metricType) {
    case 'sleep_duration':
    case 'rem_sleep':
    case 'time_in_bed':
    case 'exercise_minutes': {
      const hours = Math.floor(value / 60)
      const mins = Math.round(value % 60)
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
    }
    case 'sleep_score':
    case 'bmi':
      return `${Math.round(value)}`
    case 'hrv':
      return `${Math.round(value)} ms`
    case 'rhr':
      return `${Math.round(value)} bpm`
    case 'weight':
    case 'lean_body_mass':
    case 'bone_mass':
    case 'muscle_mass':
      return `${value.toFixed(1)} kg`
    case 'steps':
      return value.toLocaleString()
    case 'bed_temperature':
    case 'body_temperature':
      return `${value.toFixed(1)}°C`
    case 'body_fat_percentage':
    case 'body_water':
    case 'blood_oxygen':
      return `${value.toFixed(1)}%`
    case 'active_calories':
    case 'basal_calories':
      return `${Math.round(value)} kcal`
    case 'stand_hours':
      return `${Math.round(value)}h`
    case 'vo2_max':
      return `${value.toFixed(1)} mL/kg/min`
    case 'walking_running_distance':
      return `${value.toFixed(2)} km`
    case 'respiratory_rate':
      return `${value.toFixed(1)} br/min`
    default:
      return String(value)
  }
}

// Helper to get human-readable metric name
export function getMetricDisplayName(metricType: MetricType): string {
  const nameMap: Record<MetricType, string> = {
    sleep_duration: 'Sleep Duration',
    rem_sleep: 'REM Sleep',
    sleep_score: 'Sleep Score',
    hrv: 'HRV',
    rhr: 'Resting Heart Rate',
    weight: 'Weight',
    steps: 'Steps',
    bed_temperature: 'Bed Temperature',
    time_in_bed: 'Time in Bed',
    // Body composition
    body_fat_percentage: 'Body Fat',
    lean_body_mass: 'Lean Mass',
    bmi: 'BMI',
    bone_mass: 'Bone Mass',
    muscle_mass: 'Muscle Mass',
    body_water: 'Body Water',
    // Activity
    active_calories: 'Active Calories',
    basal_calories: 'Basal Calories',
    exercise_minutes: 'Exercise',
    stand_hours: 'Stand Hours',
    vo2_max: 'VO2 Max',
    walking_running_distance: 'Distance',
    // Vitals
    respiratory_rate: 'Respiratory Rate',
    blood_oxygen: 'Blood Oxygen',
    body_temperature: 'Body Temp'
  }
  return nameMap[metricType]
}
