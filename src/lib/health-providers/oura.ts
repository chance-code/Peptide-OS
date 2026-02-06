// Oura Ring Health Provider
// OAuth2 integration with Oura Cloud API v2

import {
  HealthProvider,
  HealthMetricInput,
  TokenResponse,
  registerProvider
} from './index'

const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize'
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token'
const OURA_API_BASE = 'https://api.ouraring.com/v2'

interface OuraDailySleep {
  day: string
  score: number
  contributors: {
    total_sleep: number
    rem_sleep: number
    deep_sleep: number
  }
}

interface OuraDailyActivity {
  day: string
  steps: number
  active_calories: number
}

interface OuraHeartRate {
  day: string
  data: Array<{
    bpm: number
    source: string
    timestamp: string
  }>
}

interface OuraHRV {
  day: string
  data: Array<{
    hrv: number
    timestamp: string
  }>
}

interface OuraSleepSession {
  day: string
  total_sleep_duration: number // seconds
  time_in_bed: number // seconds (includes awake time)
  awake_time: number // seconds spent awake during sleep
  rem_sleep_duration: number
  deep_sleep_duration: number
  light_sleep_duration: number
  average_heart_rate: number
  lowest_heart_rate: number
  average_hrv: number | null // HRV in milliseconds
}

interface OuraDailyStress {
  day: string
  stress_high: number        // Minutes of high stress
  recovery_high: number      // Minutes of recovery
  day_summary: string        // "restored", "normal", "stressed"
}

interface OuraDailyResilience {
  day: string
  level: string              // "limited", "adequate", "solid", "strong", "exceptional"
  contributors: {
    sleep_recovery: number
    daytime_recovery: number
    stress: number
  }
}

// Convert resilience level text to numeric score
function resilienceLevelToScore(level: string): number {
  const levelMap: Record<string, number> = {
    'limited': 20,
    'adequate': 40,
    'solid': 60,
    'strong': 80,
    'exceptional': 100
  }
  return levelMap[level.toLowerCase()] ?? 0
}

const ouraProvider: HealthProvider = {
  name: 'oura',
  displayName: 'Oura Ring',
  description: 'Sync sleep scores, HRV, heart rate, and activity from your Oura Ring',
  supportedMetrics: ['sleep_duration', 'deep_sleep', 'rem_sleep', 'light_sleep', 'time_in_bed', 'sleep_score', 'hrv', 'rhr', 'steps', 'readiness_score', 'temperature_deviation', 'stress_high', 'recovery_high', 'resilience_level'],
  requiresOAuth: true,

  getAuthUrl(userId: string, redirectUri: string): string {
    const clientId = process.env.OURA_CLIENT_ID
    if (!clientId) {
      throw new Error('OURA_CLIENT_ID environment variable not set')
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'daily heartrate personal session',
      state: userId // Use userId as state for callback verification
    })

    return `${OURA_AUTH_URL}?${params.toString()}`
  },

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    const clientId = process.env.OURA_CLIENT_ID
    const clientSecret = process.env.OURA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('Oura OAuth credentials not configured')
    }

    // Log for debugging (will show in Vercel logs)
    console.log('Oura token exchange:', {
      clientIdLength: clientId.length,
      clientIdStart: clientId.substring(0, 8),
      secretLength: clientSecret.length,
      redirectUri,
      tokenUrl: OURA_TOKEN_URL
    })

    // Use Basic auth as recommended by Home Assistant integration
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const body = new URLSearchParams()
    body.append('grant_type', 'authorization_code')
    body.append('code', code)
    body.append('redirect_uri', redirectUri)

    console.log('Request body:', body.toString())
    console.log('Using Basic auth header')

    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: body.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Oura token exchange failed:', response.status, error)
      throw new Error(`Oura token exchange failed: ${error}`)
    }

    const data = await response.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    }
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const clientId = process.env.OURA_CLIENT_ID
    const clientSecret = process.env.OURA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('Oura OAuth credentials not configured')
    }

    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Oura token refresh failed: ${error}`)
    }

    const data = await response.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    }
  },

  async revokeAccess(accessToken: string): Promise<void> {
    // Oura doesn't have a dedicated revoke endpoint
    // Users should revoke access via their Oura account settings
    // We just clear our stored tokens
    console.log('Oura access revoked locally (user should revoke in Oura app)', accessToken.slice(0, 8))
  },

  async fetchMetrics(accessToken: string, since: Date): Promise<HealthMetricInput[]> {
    const metrics: HealthMetricInput[] = []
    const startDate = since.toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]

    const headers = {
      Authorization: `Bearer ${accessToken}`
    }

    // Fetch sleep data
    try {
      const sleepResponse = await fetch(
        `${OURA_API_BASE}/usercollection/daily_sleep?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (sleepResponse.ok) {
        const sleepData = await sleepResponse.json()
        for (const day of sleepData.data as OuraDailySleep[]) {
          metrics.push({
            metricType: 'sleep_score',
            value: day.score,
            unit: 'score',
            recordedAt: new Date(day.day),
            context: {
              total_sleep_contribution: day.contributors.total_sleep,
              rem_contribution: day.contributors.rem_sleep,
              deep_contribution: day.contributors.deep_sleep
            }
          })
        }
      }
    } catch (error) {
      console.error('Error fetching Oura sleep data:', error)
    }

    // Fetch sleep sessions for duration
    try {
      const sessionResponse = await fetch(
        `${OURA_API_BASE}/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json()
        const sessions = sessionData.data as OuraSleepSession[]

        // Group sessions by day and pick longest per day to avoid duplicates
        // (e.g., nap + main sleep on the same day)
        const sessionsByDay = new Map<string, OuraSleepSession>()
        for (const session of sessions) {
          const day = session.day
          const existing = sessionsByDay.get(day)
          if (!existing || (session.total_sleep_duration || 0) > (existing.total_sleep_duration || 0)) {
            sessionsByDay.set(day, session)
          }
        }
        const dedupedSessions = Array.from(sessionsByDay.values())

        for (const session of dedupedSessions) {
          metrics.push({
            metricType: 'sleep_duration',
            value: Math.round(session.total_sleep_duration / 60), // Convert seconds to minutes
            unit: 'minutes',
            recordedAt: new Date(session.day),
            context: {
              rem_duration: Math.round(session.rem_sleep_duration / 60),
              deep_duration: Math.round(session.deep_sleep_duration / 60)
            }
          })

          // Sync individual sleep stages as separate metrics
          if (session.deep_sleep_duration) {
            metrics.push({
              metricType: 'deep_sleep',
              value: Math.round(session.deep_sleep_duration / 60),
              unit: 'minutes',
              recordedAt: new Date(session.day),
            })
          }
          if (session.rem_sleep_duration) {
            metrics.push({
              metricType: 'rem_sleep',
              value: Math.round(session.rem_sleep_duration / 60),
              unit: 'minutes',
              recordedAt: new Date(session.day),
            })
          }
          if (session.light_sleep_duration) {
            metrics.push({
              metricType: 'light_sleep',
              value: Math.round(session.light_sleep_duration / 60),
              unit: 'minutes',
              recordedAt: new Date(session.day),
            })
          }
          // Sync time in bed: prefer time_in_bed field, fall back to total_sleep + awake_time
          const timeInBedSeconds = session.time_in_bed
            ?? (session.total_sleep_duration + (session.awake_time ?? 0))
          if (timeInBedSeconds != null && timeInBedSeconds > 0) {
            metrics.push({
              metricType: 'time_in_bed',
              value: Math.round(timeInBedSeconds / 60),
              unit: 'minutes',
              recordedAt: new Date(session.day),
            })
          }

          // Add resting heart rate from sleep session
          if (session.lowest_heart_rate) {
            metrics.push({
              metricType: 'rhr',
              value: session.lowest_heart_rate,
              unit: 'bpm',
              recordedAt: new Date(session.day),
              context: {
                source: 'sleep_session',
                average_hr: session.average_heart_rate
              }
            })
          }

          // Add HRV from sleep session (actual HRV in milliseconds, not HRV balance score)
          if (session.average_hrv != null) {
            metrics.push({
              metricType: 'hrv',
              value: session.average_hrv,
              unit: 'ms',
              recordedAt: new Date(session.day),
              context: {
                source: 'sleep_session',
                lowest_heart_rate: session.lowest_heart_rate,
                average_heart_rate: session.average_heart_rate
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Oura sleep sessions:', error)
    }

    // Fetch daily readiness data (includes readiness score, temperature deviation, and HRV balance)
    try {
      const readinessResponse = await fetch(
        `${OURA_API_BASE}/usercollection/daily_readiness?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (readinessResponse.ok) {
        const readinessData = await readinessResponse.json()
        for (const day of readinessData.data as Array<{
          day: string
          score: number
          temperature_deviation: number | null
          contributors: {
            activity_balance: number
            body_temperature: number
            hrv_balance: number
            previous_day_activity: number
            previous_night: number
            recovery_index: number
            resting_heart_rate: number
            sleep_balance: number
          }
        }>) {
          // Add readiness score
          if (day.score != null) {
            metrics.push({
              metricType: 'readiness_score',
              value: day.score,
              unit: 'score',
              recordedAt: new Date(day.day),
              context: {
                activity_balance: day.contributors?.activity_balance,
                body_temperature: day.contributors?.body_temperature,
                hrv_balance: day.contributors?.hrv_balance,
                previous_day_activity: day.contributors?.previous_day_activity,
                previous_night: day.contributors?.previous_night,
                recovery_index: day.contributors?.recovery_index,
                resting_heart_rate: day.contributors?.resting_heart_rate,
                sleep_balance: day.contributors?.sleep_balance
              }
            })
          }

          // Add temperature deviation (body temp deviation from baseline in Celsius)
          if (day.temperature_deviation != null) {
            metrics.push({
              metricType: 'temperature_deviation',
              value: day.temperature_deviation,
              unit: 'celsius',
              recordedAt: new Date(day.day),
              context: {
                readiness_score: day.score
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Oura readiness data:', error)
    }

    // Fetch activity/steps
    try {
      const activityResponse = await fetch(
        `${OURA_API_BASE}/usercollection/daily_activity?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (activityResponse.ok) {
        const activityData = await activityResponse.json()
        for (const day of activityData.data as OuraDailyActivity[]) {
          metrics.push({
            metricType: 'steps',
            value: day.steps,
            unit: 'steps',
            recordedAt: new Date(day.day),
            context: {
              active_calories: day.active_calories
            }
          })
        }
      }
    } catch (error) {
      console.error('Error fetching Oura activity data:', error)
    }

    // Fetch daily stress data
    try {
      const stressResponse = await fetch(
        `${OURA_API_BASE}/usercollection/daily_stress?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (stressResponse.ok) {
        const stressData = await stressResponse.json()
        for (const day of stressData.data as OuraDailyStress[]) {
          // Add stress_high metric
          if (day.stress_high != null) {
            metrics.push({
              metricType: 'stress_high',
              value: day.stress_high,
              unit: 'minutes',
              recordedAt: new Date(day.day),
              context: {
                day_summary: day.day_summary
              }
            })
          }

          // Add recovery_high metric
          if (day.recovery_high != null) {
            metrics.push({
              metricType: 'recovery_high',
              value: day.recovery_high,
              unit: 'minutes',
              recordedAt: new Date(day.day),
              context: {
                day_summary: day.day_summary
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Oura daily stress data:', error)
    }

    // Fetch daily resilience data
    try {
      const resilienceResponse = await fetch(
        `${OURA_API_BASE}/usercollection/daily_resilience?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (resilienceResponse.ok) {
        const resilienceData = await resilienceResponse.json()
        for (const day of resilienceData.data as OuraDailyResilience[]) {
          if (day.level != null) {
            metrics.push({
              metricType: 'resilience_level',
              value: resilienceLevelToScore(day.level),
              unit: 'score',
              recordedAt: new Date(day.day),
              context: {
                level_text: day.level,
                sleep_recovery: day.contributors?.sleep_recovery,
                daytime_recovery: day.contributors?.daytime_recovery,
                stress: day.contributors?.stress
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Oura daily resilience data:', error)
    }

    return metrics
  }
}

// Register the provider
registerProvider(ouraProvider)

export default ouraProvider
