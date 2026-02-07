import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { evaluate, getLatestSnapshot, formatDaysDisplay, getDaysGainedLabel, VELOCITY_PIPELINE_VERSION } from '@/lib/health-brain'
import type { StableVelocityResponse } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

// GET /api/health/brain/velocity — Stable aging velocity contract (v2.0.0)
//
// Normal polling: returns the most recently PUBLISHED snapshot. Never triggers evaluate().
// Explicit refresh: pass ?refresh=true AND header x-user-action to trigger evaluate().
// Debug mode: pass ?debug=true to include raw computed values alongside published.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const refreshRequested = searchParams.get('refresh') === 'true'
    const userAction = request.headers.get('x-user-action')
    const shouldEvaluate = refreshRequested && !!userAction
    const debugRequested = searchParams.get('debug') === 'true'

    let snapshot = null

    if (shouldEvaluate) {
      const start = Date.now()
      snapshot = await evaluate(userId, 'user_refresh')
      console.log(JSON.stringify({
        event: 'brain_velocity_evaluate',
        userId,
        reason: 'user_refresh',
        userAction,
        durationMs: Date.now() - start,
      }))
    } else {
      snapshot = await getLatestSnapshot(userId)
      console.log(JSON.stringify({
        event: 'brain_velocity_read',
        userId,
        reason: refreshRequested ? 'refresh_without_user_action' : 'poll',
        hasSnapshot: !!snapshot,
      }))
    }

    // No snapshot at all — brand new user
    if (!snapshot) {
      return NextResponse.json({
        status: 'initializing',
        value: {
          overallVelocityStable: null,
          daysGainedAnnuallyDisplay: null,
          daysGainedAnnuallyExact: null,
          daysGainedAnnuallyLabel: null,
          systemVelocitiesStable: [],
        },
        meta: {
          publishedAt: null,
          computedAt: null,
          windowDays: 90,
          dataCompletenessScore: 0,
          confidence: 'low',
          concordanceScore: null,
          version: VELOCITY_PIPELINE_VERSION,
          timezone: 'UTC',
          overallVelocityCI: null,
          missingDomains: [],
          effectiveDomainsCount: 0,
          note: null,
          trendDirection: undefined,
          delta28d: null,
          delta28dDays: null,
          topDrivers: undefined,
        },
        agingVelocity: null,
        evaluatedAt: null,
      } satisfies StableVelocityResponse)
    }

    const av = snapshot.agingVelocity       // computed (always fresh)
    const published = snapshot.publishedVelocity  // published (stable, gate-controlled)

    // Use published if available, otherwise show initializing
    const displayVelocity = published ?? av
    const isPublished = published != null

    const systemVelocitiesStable = Object.entries(displayVelocity.systemVelocities || {}).map(
      ([system, sv]) => ({
        system,
        velocity: sv.velocity,
        confidence: sv.confidence,
        trend: sv.trend,
      })
    )

    const response: StableVelocityResponse = {
      status: isPublished ? 'published' : 'initializing',
      value: (() => {
        if (!isPublished) {
          return {
            overallVelocityStable: null,
            daysGainedAnnuallyDisplay: null,
            daysGainedAnnuallyExact: null,
            daysGainedAnnuallyLabel: null,
            systemVelocitiesStable: [],
          }
        }
        const bucket = displayVelocity.daysGainedAnnuallyBucket ?? displayVelocity.daysGainedAnnually ?? null
        const exactDays = displayVelocity.daysGainedAnnually != null
          ? (1.0 - (displayVelocity.overallVelocity ?? 1.0)) * 365
          : null
        return {
          overallVelocityStable: displayVelocity.overallVelocity ?? null,
          daysGainedAnnuallyDisplay: bucket != null
            ? formatDaysDisplay(bucket, displayVelocity.confidence)
            : null,
          daysGainedAnnuallyExact: exactDays != null ? Math.round(exactDays * 10) / 10 : null,
          daysGainedAnnuallyLabel: bucket != null
            ? getDaysGainedLabel(bucket)
            : null,
          systemVelocitiesStable,
        }
      })(),
      meta: {
        publishedAt: snapshot.publishedVelocityAt,
        computedAt: snapshot.velocityComputedAt,
        windowDays: snapshot.velocityWindowDays,
        dataCompletenessScore: snapshot.dataCompleteness,
        confidence: displayVelocity.confidence,
        concordanceScore: displayVelocity.concordanceScore,
        version: snapshot.velocityVersion,
        timezone: 'UTC',
        overallVelocityCI: displayVelocity.overallVelocityCI ?? null,
        missingDomains: displayVelocity.missingDomains ?? [],
        effectiveDomainsCount: displayVelocity.effectiveDomainsCount ?? 0,
        note: displayVelocity.note ?? null,
        trendDirection: displayVelocity.trendDirection,
        delta28d: displayVelocity.delta28d ?? null,
        delta28dDays: displayVelocity.delta28dDays ?? null,
        topDrivers: displayVelocity.topDrivers,
      },
      // Legacy fields — return published velocity for stability
      agingVelocity: displayVelocity,
      evaluatedAt: snapshot.evaluatedAt,
    }

    // Debug mode: attach raw computed values alongside published
    if (debugRequested) {
      ;(response as unknown as Record<string, unknown>).computed = {
        agingVelocity: av,
        computedAt: snapshot.velocityComputedAt,
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Brain velocity API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch aging velocity' },
      { status: 500 }
    )
  }
}
