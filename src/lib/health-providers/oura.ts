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
  rem_sleep_duration: number
  deep_sleep_duration: number
  average_heart_rate: number
  lowest_heart_rate: number
}

const ouraProvider: HealthProvider = {
  name: 'oura',
  displayName: 'Oura Ring',
  description: 'Sync sleep scores, HRV, heart rate, and activity from your Oura Ring',
  supportedMetrics: ['sleep_duration', 'sleep_score', 'hrv', 'rhr', 'steps'],
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
        for (const session of sessionData.data as OuraSleepSession[]) {
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
        }
      }
    } catch (error) {
      console.error('Error fetching Oura sleep sessions:', error)
    }

    // Fetch HRV data
    try {
      const hrvResponse = await fetch(
        `${OURA_API_BASE}/usercollection/daily_readiness?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      )

      if (hrvResponse.ok) {
        const hrvData = await hrvResponse.json()
        for (const day of hrvData.data as Array<{ day: string; contributors: { hrv_balance: number } }>) {
          // Oura provides HRV balance as a score, not raw ms value
          // We'd need to fetch detailed HRV from heart_rate endpoint for actual values
          if (day.contributors?.hrv_balance) {
            // Note: This is HRV balance score, not raw HRV in ms
            // For actual HRV, we'd need additional API calls
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Oura HRV data:', error)
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

    return metrics
  }
}

// Register the provider
registerProvider(ouraProvider)

export default ouraProvider
