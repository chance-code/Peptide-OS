// WHOOP Health Provider
// OAuth2 integration with WHOOP Developer API v1

import {
  HealthProvider,
  HealthMetricInput,
  TokenResponse,
  registerProvider
} from './index'

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v1'

// --- WHOOP API Response Types ---

interface WhoopCycleScore {
  strain: number
  kilojoule: number
  average_heart_rate: number
  max_heart_rate: number
}

interface WhoopCycle {
  id: number
  user_id: number
  start: string
  end: string | null
  score: WhoopCycleScore | null
}

interface WhoopRecoveryScore {
  user_calibrating: boolean
  recovery_score: number
  resting_heart_rate: number
  hrv_rmssd_milli: number
  spo2_percentage: number | null
  skin_temp_celsius: number | null
}

interface WhoopRecovery {
  cycle_id: number
  sleep_id: number
  user_id: number
  score: WhoopRecoveryScore | null
}

interface WhoopSleepStages {
  total_in_bed_time_milli: number
  total_awake_time_milli: number
  total_no_data_time_milli: number
  total_light_sleep_time_milli: number
  total_slow_wave_sleep_time_milli: number
  total_rem_sleep_time_milli: number
  sleep_cycle_count: number
  disturbance_count: number
}

interface WhoopSleepScore {
  stage_summary: WhoopSleepStages
  sleep_needed: { baseline_milli: number; need_from_sleep_debt_milli: number; need_from_recent_strain_milli: number; need_from_recent_nap_milli: number }
  respiratory_rate: number | null
  sleep_performance_percentage: number | null
  sleep_consistency_percentage: number | null
  sleep_efficiency_percentage: number | null
}

interface WhoopSleep {
  id: number
  user_id: number
  start: string
  end: string
  nap: boolean
  score: WhoopSleepScore | null
}

interface WhoopWorkoutScore {
  strain: number
  average_heart_rate: number
  max_heart_rate: number
  kilojoule: number
  percent_recorded: number
  zone_duration: { zone_zero_milli: number; zone_one_milli: number; zone_two_milli: number; zone_three_milli: number; zone_four_milli: number; zone_five_milli: number }
}

interface WhoopWorkout {
  id: number
  user_id: number
  start: string
  end: string
  sport_id: number
  score: WhoopWorkoutScore | null
}

interface WhoopPaginatedResponse<T> {
  records: T[]
  next_token: string | null
}

// --- Helper Functions ---

/** Normalize an ISO timestamp to a YYYY-MM-DD date string */
function toDateString(isoTimestamp: string): string {
  return isoTimestamp.split('T')[0]
}

/** Convert milliseconds to minutes, rounded */
function msToMinutes(ms: number): number {
  return Math.round(ms / 60000)
}

/** Fetch all pages from a WHOOP paginated endpoint */
async function fetchAllPages<T>(
  url: string,
  headers: Record<string, string>
): Promise<T[]> {
  const allRecords: T[] = []
  let nextToken: string | null = null

  do {
    const separator = url.includes('?') ? '&' : '?'
    const pageUrl = nextToken ? `${url}${separator}nextToken=${encodeURIComponent(nextToken)}` : url

    const response = await fetch(pageUrl, { headers })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`WHOOP API error (${response.status}): ${errorText}`)
    }

    const data: WhoopPaginatedResponse<T> = await response.json()
    allRecords.push(...data.records)
    nextToken = data.next_token ?? null
  } while (nextToken)

  return allRecords
}

// --- Provider Implementation ---

const whoopProvider: HealthProvider = {
  name: 'whoop',
  displayName: 'WHOOP',
  description: 'Sync strain, recovery, HRV, sleep, and workout data from your WHOOP band',
  supportedMetrics: [
    'strain_score', 'recovery_score', 'hrv', 'rhr', 'blood_oxygen',
    'sleep_duration', 'deep_sleep', 'rem_sleep', 'sleep_efficiency',
    'sleep_score', 'exercise_minutes', 'active_calories'
  ],
  requiresOAuth: true,

  getAuthUrl(userId: string, redirectUri: string): string {
    const clientId = process.env.WHOOP_CLIENT_ID
    if (!clientId) {
      throw new Error('WHOOP_CLIENT_ID environment variable not set')
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:recovery read:sleep read:workout read:cycles offline',
      state: userId
    })

    return `${WHOOP_AUTH_URL}?${params.toString()}`
  },

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    const clientId = process.env.WHOOP_CLIENT_ID
    const clientSecret = process.env.WHOOP_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('WHOOP OAuth credentials not configured')
    }

    console.log('WHOOP token exchange:', {
      clientIdLength: clientId.length,
      clientIdStart: clientId.substring(0, 8),
      secretLength: clientSecret.length,
      redirectUri,
      tokenUrl: WHOOP_TOKEN_URL
    })

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const body = new URLSearchParams()
    body.append('grant_type', 'authorization_code')
    body.append('code', code)
    body.append('redirect_uri', redirectUri)

    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: body.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('WHOOP token exchange failed:', response.status, error)
      throw new Error(`WHOOP token exchange failed: ${error}`)
    }

    const data = await response.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    }
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const clientId = process.env.WHOOP_CLIENT_ID
    const clientSecret = process.env.WHOOP_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('WHOOP OAuth credentials not configured')
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`WHOOP token refresh failed: ${error}`)
    }

    const data = await response.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    }
  },

  async revokeAccess(accessToken: string): Promise<void> {
    // WHOOP doesn't have a dedicated revoke endpoint
    // Users should revoke access via their WHOOP account settings
    console.log('WHOOP access revoked locally (user should revoke in WHOOP app)', accessToken.slice(0, 8))
  },

  async fetchMetrics(accessToken: string, since: Date): Promise<HealthMetricInput[]> {
    const metrics: HealthMetricInput[] = []
    const startDate = since.toISOString()
    const endDate = new Date().toISOString()

    const headers = {
      Authorization: `Bearer ${accessToken}`
    }

    // 1. Fetch Cycles + Recovery
    try {
      const cycles = await fetchAllPages<WhoopCycle>(
        `${WHOOP_API_BASE}/cycle?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
        headers
      )

      // Fetch recovery for each cycle
      for (const cycle of cycles) {
        if (!cycle.score) continue

        const day = toDateString(cycle.start)
        const recordedAt = new Date(day)

        // Strain score (WHOOP proprietary 0-21 scale)
        metrics.push({
          metricType: 'strain_score',
          value: Math.round(cycle.score.strain * 100) / 100,
          unit: 'score',
          recordedAt,
          context: {
            source: 'whoop_cycle',
            average_heart_rate: cycle.score.average_heart_rate,
            max_heart_rate: cycle.score.max_heart_rate
          }
        })

        // Active calories from cycle
        metrics.push({
          metricType: 'active_calories',
          value: Math.round(cycle.score.kilojoule * 0.239006),
          unit: 'kcal',
          recordedAt,
          context: {
            source: 'whoop_cycle',
            strain: cycle.score.strain
          }
        })

        // Fetch recovery data for this cycle
        try {
          const recoveryResponse = await fetch(
            `${WHOOP_API_BASE}/recovery/${cycle.id}`,
            { headers }
          )

          if (recoveryResponse.ok) {
            const recovery: WhoopRecovery = await recoveryResponse.json()

            if (recovery.score) {
              // Recovery score (WHOOP proprietary 0-100%)
              if (recovery.score.recovery_score != null) {
                metrics.push({
                  metricType: 'recovery_score',
                  value: Math.round(recovery.score.recovery_score),
                  unit: 'percent',
                  recordedAt,
                  context: {
                    source: 'whoop_recovery',
                    user_calibrating: recovery.score.user_calibrating
                  }
                })
              }

              // HRV (already in ms from WHOOP)
              if (recovery.score.hrv_rmssd_milli != null) {
                metrics.push({
                  metricType: 'hrv',
                  value: Math.round(recovery.score.hrv_rmssd_milli * 100) / 100,
                  unit: 'ms',
                  recordedAt,
                  context: {
                    source: 'whoop_recovery',
                    recovery_score: recovery.score.recovery_score,
                    user_calibrating: recovery.score.user_calibrating
                  }
                })
              }

              // Resting heart rate
              if (recovery.score.resting_heart_rate != null) {
                metrics.push({
                  metricType: 'rhr',
                  value: Math.round(recovery.score.resting_heart_rate),
                  unit: 'bpm',
                  recordedAt,
                  context: {
                    source: 'whoop_recovery',
                    recovery_score: recovery.score.recovery_score
                  }
                })
              }

              // Blood oxygen (WHOOP 4.0 members only, may be null)
              if (recovery.score.spo2_percentage != null) {
                metrics.push({
                  metricType: 'blood_oxygen',
                  value: recovery.score.spo2_percentage,
                  unit: 'percent',
                  recordedAt,
                  context: {
                    source: 'whoop_recovery'
                  }
                })
              }
            }
          }
        } catch (recoveryError) {
          console.error(`Error fetching WHOOP recovery for cycle ${cycle.id}:`, recoveryError)
        }
      }
    } catch (error) {
      console.error('Error fetching WHOOP cycles/recovery:', error)
    }

    // 2. Fetch Sleep
    try {
      const sleepSessions = await fetchAllPages<WhoopSleep>(
        `${WHOOP_API_BASE}/activity/sleep?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
        headers
      )

      // Group by day and pick longest non-nap session per day
      const sessionsByDay = new Map<string, WhoopSleep>()
      for (const session of sleepSessions) {
        // Skip naps
        if (session.nap) continue
        if (!session.score) continue

        const day = toDateString(session.start)
        const durationMs = new Date(session.end).getTime() - new Date(session.start).getTime()

        const existing = sessionsByDay.get(day)
        if (existing) {
          const existingDurationMs = new Date(existing.end).getTime() - new Date(existing.start).getTime()
          if (durationMs > existingDurationMs) {
            sessionsByDay.set(day, session)
          }
        } else {
          sessionsByDay.set(day, session)
        }
      }

      for (const [day, session] of sessionsByDay) {
        const recordedAt = new Date(day)
        const durationMs = new Date(session.end).getTime() - new Date(session.start).getTime()

        // Sleep duration (total time from start to end, in minutes)
        metrics.push({
          metricType: 'sleep_duration',
          value: msToMinutes(durationMs),
          unit: 'minutes',
          recordedAt,
          context: {
            source: 'whoop_sleep'
          }
        })

        if (session.score) {
          // Deep sleep (slow wave sleep)
          if (session.score.stage_summary.total_slow_wave_sleep_time_milli != null) {
            metrics.push({
              metricType: 'deep_sleep',
              value: msToMinutes(session.score.stage_summary.total_slow_wave_sleep_time_milli),
              unit: 'minutes',
              recordedAt,
              context: {
                source: 'whoop_sleep'
              }
            })
          }

          // REM sleep
          if (session.score.stage_summary.total_rem_sleep_time_milli != null) {
            metrics.push({
              metricType: 'rem_sleep',
              value: msToMinutes(session.score.stage_summary.total_rem_sleep_time_milli),
              unit: 'minutes',
              recordedAt,
              context: {
                source: 'whoop_sleep'
              }
            })
          }

          // Sleep efficiency
          if (session.score.sleep_efficiency_percentage != null) {
            metrics.push({
              metricType: 'sleep_efficiency',
              value: session.score.sleep_efficiency_percentage,
              unit: 'percent',
              recordedAt,
              context: {
                source: 'whoop_sleep'
              }
            })
          }

          // Sleep score (sleep performance percentage)
          if (session.score.sleep_performance_percentage != null) {
            metrics.push({
              metricType: 'sleep_score',
              value: session.score.sleep_performance_percentage,
              unit: 'score',
              recordedAt,
              context: {
                source: 'whoop_sleep',
                sleep_consistency: session.score.sleep_consistency_percentage,
                respiratory_rate: session.score.respiratory_rate
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error fetching WHOOP sleep data:', error)
    }

    // 3. Fetch Workouts
    try {
      const workouts = await fetchAllPages<WhoopWorkout>(
        `${WHOOP_API_BASE}/activity/workout?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
        headers
      )

      // Group workouts by day and sum exercise minutes + calories
      const workoutsByDay = new Map<string, { totalMinutes: number; totalCalories: number; workoutCount: number; totalStrain: number }>()

      for (const workout of workouts) {
        const day = toDateString(workout.start)
        const durationMs = new Date(workout.end).getTime() - new Date(workout.start).getTime()
        const minutes = msToMinutes(durationMs)
        const calories = workout.score ? Math.round(workout.score.kilojoule * 0.239006) : 0
        const strain = workout.score?.strain ?? 0

        const existing = workoutsByDay.get(day)
        if (existing) {
          existing.totalMinutes += minutes
          existing.totalCalories += calories
          existing.workoutCount += 1
          existing.totalStrain += strain
        } else {
          workoutsByDay.set(day, {
            totalMinutes: minutes,
            totalCalories: calories,
            workoutCount: 1,
            totalStrain: strain
          })
        }
      }

      for (const [day, summary] of workoutsByDay) {
        const recordedAt = new Date(day)

        metrics.push({
          metricType: 'exercise_minutes',
          value: summary.totalMinutes,
          unit: 'minutes',
          recordedAt,
          context: {
            source: 'whoop_workout',
            workout_count: summary.workoutCount,
            total_strain: Math.round(summary.totalStrain * 100) / 100
          }
        })

        // Only add workout calories if we have score data (avoid duplicating cycle calories)
        if (summary.totalCalories > 0) {
          metrics.push({
            metricType: 'active_calories',
            value: summary.totalCalories,
            unit: 'kcal',
            recordedAt,
            context: {
              source: 'whoop_workout',
              workout_count: summary.workoutCount
            }
          })
        }
      }
    } catch (error) {
      console.error('Error fetching WHOOP workout data:', error)
    }

    return metrics
  }
}

// Register the provider
registerProvider(whoopProvider)

export default whoopProvider
