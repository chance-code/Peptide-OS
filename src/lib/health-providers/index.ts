// Health Provider Infrastructure
// Unified interface for Apple HealthKit and Oura integrations

import { METRIC_REGISTRY, formatMetric, getDisplayName } from '../health-metric-contract'

export type HealthProviderType = 'apple_health' | 'oura' | 'whoop'

export type MetricType =
  | 'sleep_duration'
  | 'rem_sleep'
  | 'sleep_score'
  | 'sleep_efficiency'
  | 'waso'
  | 'sleep_latency'
  | 'deep_sleep'
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
  // Oura readiness & recovery
  | 'readiness_score'
  | 'temperature_deviation'
  | 'stress_high'
  | 'recovery_high'
  | 'resilience_level'
  // WHOOP-specific
  | 'strain_score'
  | 'recovery_score'

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

  // OAuth flow (for Oura)
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
  requiresCredentials: boolean
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
      supportedMetrics: ['sleep_duration', 'sleep_score', 'hrv', 'rhr', 'steps', 'readiness_score', 'temperature_deviation', 'stress_high', 'recovery_high', 'resilience_level'],
      requiresOAuth: true,
      requiresCredentials: false,
      isNativeOnly: false,
      icon: 'circle'
    },
    {
      name: 'whoop',
      displayName: 'WHOOP',
      description: 'Sync strain, recovery, HRV, sleep, and workout data from your WHOOP band',
      supportedMetrics: ['hrv', 'rhr', 'blood_oxygen', 'sleep_duration', 'deep_sleep', 'rem_sleep', 'sleep_efficiency', 'sleep_score', 'exercise_minutes', 'active_calories'],
      requiresOAuth: true,
      requiresCredentials: false,
      isNativeOnly: false,
      icon: 'activity'
    }
  ]
}

// Helper to normalize metric units for storage
// Delegates to METRIC_REGISTRY from health-metric-contract.ts
export function normalizeMetricUnit(metricType: MetricType): MetricUnit {
  const unitMapping: Record<string, MetricUnit> = {
    'min': 'minutes', 'ms': 'ms', 'bpm': 'bpm', 'score': 'score',
    'lbs': 'lbs', 'steps': 'steps', '°C': 'celsius', '%': 'percent',
    'kcal': 'kcal', 'hrs': 'hours', 'mL/kg/min': 'ml_kg_min',
    'mi': 'km', 'br/min': 'breaths_min', '': 'score',
  }
  const def = METRIC_REGISTRY[metricType]
  if (!def) return 'score'
  return unitMapping[def.unit] ?? 'score'
}

// Helper to format metric values for display
// Delegates to METRIC_REGISTRY from health-metric-contract.ts
export function formatMetricValue(value: number, metricType: MetricType): string {
  return formatMetric(metricType, value)
}

// Helper to get human-readable metric name
// Delegates to METRIC_REGISTRY from health-metric-contract.ts
export function getMetricDisplayName(metricType: MetricType): string {
  return getDisplayName(metricType)
}
