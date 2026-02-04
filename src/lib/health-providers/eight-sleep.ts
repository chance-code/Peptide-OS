// Eight Sleep Health Provider
// Email/Password authentication with Eight Sleep API
// Based on community reverse-engineering (pyeight library)

import {
  HealthProvider,
  HealthMetricInput,
  TokenResponse,
  registerProvider
} from './index'

// Eight Sleep API endpoints (from pyeight)
const AUTH_URL = 'https://auth-api.8slp.net/v1/tokens'
const CLIENT_API_URL = 'https://client-api.8slp.net/v1'

// Known client credentials (from Eight Sleep mobile app)
const CLIENT_ID = '0894c7f33bb94800a03f1f4df13a4f38'
const CLIENT_SECRET = 'f0954a3ed5763ba3d06834c73731a32f15f168f47d4f164751275def86db0c76'

interface EightSleepAuthResponse {
  access_token: string
  expires_in: number
  userId: string
  token_type: string
}

interface EightSleepInterval {
  id: string
  ts: string // ISO timestamp
  stages?: Array<{
    stage: string
    duration: number // seconds
  }>
  score?: number
  timeseries?: {
    tempRoomC?: Array<{ value: number }>
    tempBedC?: Array<{ value: number }>
    hrv?: Array<[number, number]>              // [timestamp, value] - HRV in ms
    heartRate?: Array<[number, number]>        // [timestamp, value] - BPM
    respiratoryRate?: Array<[number, number]>  // [timestamp, value] - breaths/min
  }
  sleepFitnessScore?: {
    total: number
  }
  duration?: number // seconds
}

interface EightSleepUser {
  userId: string
  currentDevice?: {
    id: string
    side: 'left' | 'right' | 'solo'
  }
}

// Authenticate with email/password
export async function authenticateEightSleep(
  email: string,
  password: string
): Promise<{ accessToken: string; expiresIn: number; userId: string }> {
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'password',
      username: email,
      password: password
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Eight Sleep auth failed:', response.status, error)
    if (response.status === 401) {
      throw new Error('Invalid email or password')
    }
    throw new Error(`Eight Sleep authentication failed: ${error}`)
  }

  const data: EightSleepAuthResponse = await response.json()

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    userId: data.userId
  }
}

const eightSleepProvider: HealthProvider = {
  name: 'eight_sleep',
  displayName: 'Eight Sleep',
  description: 'Import sleep scores and bed temperature data from your Eight Sleep mattress',
  supportedMetrics: [
    'sleep_score',
    'time_in_bed',
    'bed_temperature',
    'hrv',
    'respiratory_rate',
    'rem_sleep'
  ],
  requiresOAuth: false, // Changed to false - uses email/password

  // Not used - email/password auth instead
  getAuthUrl(): string {
    throw new Error('Eight Sleep uses email/password authentication')
  },

  // Not used - email/password auth instead
  async exchangeCode(): Promise<TokenResponse> {
    throw new Error('Eight Sleep uses email/password authentication')
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    // Eight Sleep tokens are long-lived, but if we need to refresh,
    // we'd need to re-authenticate with stored credentials
    // For now, throw an error - the sync will fail and user can reconnect
    throw new Error('Eight Sleep token refresh not supported - please reconnect')
  },

  async revokeAccess(accessToken: string): Promise<void> {
    // No revoke endpoint - just clear local tokens
    console.log('Eight Sleep access revoked locally', accessToken.slice(0, 8))
  },

  async fetchMetrics(accessToken: string, since: Date): Promise<HealthMetricInput[]> {
    const metrics: HealthMetricInput[] = []

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    // Get user info to find their device
    let userId: string
    try {
      const userResponse = await fetch(`${CLIENT_API_URL}/users/me`, { headers })
      if (!userResponse.ok) {
        const error = await userResponse.text()
        console.error('Failed to fetch Eight Sleep user:', userResponse.status, error)
        throw new Error('Failed to fetch Eight Sleep user info')
      }
      const userData: EightSleepUser = await userResponse.json()
      userId = userData.userId
    } catch (error) {
      console.error('Error fetching Eight Sleep user:', error)
      throw error
    }

    // Fetch sleep intervals
    try {
      const startDate = since.toISOString().split('T')[0]
      const endDate = new Date().toISOString().split('T')[0]

      const intervalsResponse = await fetch(
        `${CLIENT_API_URL}/users/${userId}/intervals?from=${startDate}&to=${endDate}`,
        { headers }
      )

      if (intervalsResponse.ok) {
        const intervalsData = await intervalsResponse.json()
        const intervals = intervalsData.intervals || intervalsData.data || []

        for (const interval of intervals as EightSleepInterval[]) {
          const recordedAt = new Date(interval.ts)

          // Sleep score
          if (interval.score !== undefined) {
            metrics.push({
              metricType: 'sleep_score',
              value: interval.score,
              unit: 'score',
              recordedAt,
              context: {
                sleepFitnessScore: interval.sleepFitnessScore?.total
              }
            })
          }

          // Time in bed (duration) and detailed sleep stages
          const durationSeconds = interval.duration ||
            (interval.stages?.reduce((sum, s) => sum + s.duration, 0) || 0)

          // Calculate detailed stage durations
          const stageDurations: Record<string, number> = {
            awake: 0,
            light: 0,
            deep: 0,
            rem: 0
          }

          if (interval.stages && interval.stages.length > 0) {
            for (const stage of interval.stages) {
              if (Object.prototype.hasOwnProperty.call(stageDurations, stage.stage)) {
                stageDurations[stage.stage] += stage.duration
              }
            }
          }

          // Convert seconds to hours for stage durations
          const deepSleepHours = stageDurations.deep / 3600
          const remSleepHours = stageDurations.rem / 3600
          const lightSleepHours = stageDurations.light / 3600
          const awakeDuringNightHours = stageDurations.awake / 3600

          // Calculate sleep latency (time from bedtime to first non-awake stage)
          let sleepLatencySeconds = 0
          if (interval.stages && interval.stages.length > 0) {
            for (const stage of interval.stages) {
              if (stage.stage === 'awake') {
                sleepLatencySeconds += stage.duration
              } else {
                // Found first non-awake stage, stop counting
                break
              }
            }
          }

          if (durationSeconds > 0) {
            metrics.push({
              metricType: 'time_in_bed',
              value: Math.round(durationSeconds / 60), // Convert to minutes
              unit: 'minutes',
              recordedAt,
              context: {
                stages: interval.stages?.reduce((acc, stage) => {
                  acc[stage.stage] = Math.round(stage.duration / 60)
                  return acc
                }, {} as Record<string, number>),
                // Detailed stage durations in hours
                deepSleepHours: Math.round(deepSleepHours * 100) / 100,
                remSleepHours: Math.round(remSleepHours * 100) / 100,
                lightSleepHours: Math.round(lightSleepHours * 100) / 100,
                awakeDuringNightHours: Math.round(awakeDuringNightHours * 100) / 100,
                // Sleep latency in minutes
                sleepLatencyMinutes: Math.round(sleepLatencySeconds / 60)
              }
            })
          }

          // REM sleep (from stages) - as separate metric
          if (stageDurations.rem > 0) {
            metrics.push({
              metricType: 'rem_sleep',
              value: Math.round(stageDurations.rem / 60), // Convert to minutes
              unit: 'minutes',
              recordedAt,
              context: {
                durationSeconds: stageDurations.rem,
                durationHours: Math.round(remSleepHours * 100) / 100
              }
            })
          }

          // Bed temperature (average from timeseries)
          if (interval.timeseries?.tempBedC && interval.timeseries.tempBedC.length > 0) {
            const temps = interval.timeseries.tempBedC.map(t => t.value)
            const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length

            metrics.push({
              metricType: 'bed_temperature',
              value: avgTemp,
              unit: 'celsius',
              recordedAt,
              context: {
                roomTemp: interval.timeseries.tempRoomC?.[0]?.value
              }
            })
          }

          // HRV (average from timeseries)
          if (interval.timeseries?.hrv && interval.timeseries.hrv.length > 0) {
            const hrvValues = interval.timeseries.hrv
              .map(([, val]) => val)
              .filter(v => v > 0)

            if (hrvValues.length > 0) {
              const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length

              metrics.push({
                metricType: 'hrv',
                value: Math.round(avgHrv * 10) / 10, // Round to 1 decimal
                unit: 'ms',
                recordedAt,
                context: {
                  dataPoints: hrvValues.length,
                  min: Math.min(...hrvValues),
                  max: Math.max(...hrvValues)
                }
              })
            }
          }

          // Respiratory rate (average from timeseries)
          if (interval.timeseries?.respiratoryRate && interval.timeseries.respiratoryRate.length > 0) {
            const respValues = interval.timeseries.respiratoryRate
              .map(([, val]) => val)
              .filter(v => v > 0)

            if (respValues.length > 0) {
              const avgRespRate = respValues.reduce((a, b) => a + b, 0) / respValues.length

              metrics.push({
                metricType: 'respiratory_rate',
                value: Math.round(avgRespRate * 10) / 10, // Round to 1 decimal
                unit: 'breaths_min',
                recordedAt,
                context: {
                  dataPoints: respValues.length,
                  min: Math.min(...respValues),
                  max: Math.max(...respValues)
                }
              })
            }
          }
        }
      } else {
        console.error('Failed to fetch intervals:', await intervalsResponse.text())
      }
    } catch (error) {
      console.error('Error fetching Eight Sleep intervals:', error)
    }

    return metrics
  }
}

// Register the provider
registerProvider(eightSleepProvider)

export default eightSleepProvider
