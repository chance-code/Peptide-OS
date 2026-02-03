import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { MetricSyncState } from '@/lib/health-providers'

// Accepted metric types from Apple Health
const VALID_METRIC_TYPES = new Set([
  'weight', 'body_fat_percentage', 'lean_body_mass', 'bmi',
  'muscle_mass', 'bone_mass', 'body_water',
  'hrv', 'rhr',
  'sleep_duration', 'rem_sleep',
  'steps', 'active_calories', 'basal_calories', 'exercise_minutes',
  'stand_hours', 'walking_running_distance',
  'vo2_max', 'respiratory_rate', 'blood_oxygen', 'body_temperature',
])

interface IngestMetric {
  metricType: string
  value: number
  unit: string
  recordedAt: string // ISO string from client
  context?: Record<string, unknown>
}

interface IngestPayload {
  metrics: IngestMetric[]
  permissions?: Record<string, boolean>
  metricCounts?: Record<string, number>
  errors?: Array<{ metricType: string; error: string }>
}

// POST /api/health/ingest/apple-health
// Accepts metrics fetched client-side via the Capacitor HealthKit plugin.
// No HealthKit logic here — pure data ingestion and storage.
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const body = await request.json() as IngestPayload

    if (!body.metrics || !Array.isArray(body.metrics)) {
      return NextResponse.json(
        { error: 'metrics array is required' },
        { status: 400 }
      )
    }

    // Validate and filter metrics
    const validMetrics = body.metrics.filter(m =>
      VALID_METRIC_TYPES.has(m.metricType) &&
      typeof m.value === 'number' &&
      !isNaN(m.value) &&
      m.unit &&
      m.recordedAt
    )

    // Ensure integration exists and is connected
    const integration = await prisma.healthIntegration.findUnique({
      where: {
        userId_provider: { userId, provider: 'apple_health' }
      }
    })

    if (!integration || !integration.isConnected) {
      return NextResponse.json(
        { error: 'Apple Health integration not found or not connected' },
        { status: 404 }
      )
    }

    // Create sync log
    const syncLog = await prisma.healthSyncLog.create({
      data: {
        userId,
        provider: 'apple_health',
        status: 'success',
        startedAt: new Date()
      }
    })

    // Batch upsert metrics (chunks of 80 to stay within SQLite variable limits)
    let metricsCount = 0
    const CHUNK_SIZE = 80
    for (let i = 0; i < validMetrics.length; i += CHUNK_SIZE) {
      const chunk = validMetrics.slice(i, i + CHUNK_SIZE)
      const results = await prisma.$transaction(
        chunk.map(metric =>
          prisma.healthMetric.upsert({
            where: {
              userId_provider_metricType_recordedAt: {
                userId,
                provider: 'apple_health',
                metricType: metric.metricType,
                recordedAt: new Date(metric.recordedAt)
              }
            },
            update: {
              value: metric.value,
              unit: metric.unit,
              context: metric.context ? JSON.stringify(metric.context) : null
            },
            create: {
              userId,
              provider: 'apple_health',
              metricType: metric.metricType,
              value: metric.value,
              unit: metric.unit,
              recordedAt: new Date(metric.recordedAt),
              context: metric.context ? JSON.stringify(metric.context) : null
            }
          })
        )
      )
      metricsCount += results.length
    }

    // Build per-metric sync state
    const now = new Date()
    const nowISO = now.toISOString()

    // Load existing sync state
    let existingSyncState: MetricSyncState = {}
    if (integration.enabledMetrics) {
      try {
        existingSyncState = JSON.parse(integration.enabledMetrics) as MetricSyncState
      } catch { /* ignore malformed JSON */ }
    }

    // Start fresh — only keep metrics that are currently supported
    // This removes stale entries for metrics we no longer fetch (e.g., bone_mass, body_water)
    const newSyncState: MetricSyncState = {}

    // Update from metric counts (provided by client)
    if (body.metricCounts) {
      for (const [metricType, count] of Object.entries(body.metricCounts)) {
        newSyncState[metricType] = {
          lastSyncAt: nowISO,
          status: count > 0 ? 'ok' : 'no_data',
          dataPoints: count
        }
      }
    } else {
      // Fallback: derive counts from submitted metrics
      const counts = new Map<string, number>()
      for (const m of validMetrics) {
        counts.set(m.metricType, (counts.get(m.metricType) || 0) + 1)
      }
      for (const [metricType, count] of counts) {
        newSyncState[metricType] = {
          lastSyncAt: nowISO,
          status: 'ok',
          dataPoints: count
        }
      }
    }

    // Mark per-metric errors from client
    if (body.errors) {
      for (const err of body.errors) {
        if (err.metricType === '*') continue
        newSyncState[err.metricType] = {
          ...newSyncState[err.metricType],
          lastSyncAt: newSyncState[err.metricType]?.lastSyncAt || null,
          status: err.error.toLowerCase().includes('permission') ? 'permission_denied' : 'error',
          lastError: err.error
        }
      }
    }

    // Update integration and sync log
    await Promise.all([
      prisma.healthIntegration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: now,
          syncError: null,
          enabledMetrics: JSON.stringify(newSyncState)
        }
      }),
      prisma.healthSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: metricsCount > 0 ? 'success' : 'partial',
          metricsCount,
          completedAt: now
        }
      })
    ])

    return NextResponse.json({
      success: true,
      metricsCount,
      lastSyncAt: now,
      metricSyncState: newSyncState,
      permissions: body.permissions,
      errors: body.errors?.filter(e => e.metricType !== '*')
    })
  } catch (error) {
    console.error('Error ingesting Apple Health data:', error)
    return NextResponse.json(
      { error: 'Failed to ingest health data' },
      { status: 500 }
    )
  }
}
