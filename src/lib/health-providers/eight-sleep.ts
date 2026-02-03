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
  supportedMetrics: ['sleep_score', 'time_in_bed', 'bed_temperature'],
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

          // Time in bed (duration)
          const durationSeconds = interval.duration ||
            (interval.stages?.reduce((sum, s) => sum + s.duration, 0) || 0)

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
                }, {} as Record<string, number>)
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
