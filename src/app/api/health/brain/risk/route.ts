import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { evaluate, getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 5 * 60 * 1000

// GET /api/health/brain/risk — Risk trajectory assessments (optional ?domain= filter)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const domainFilter = searchParams.get('domain')

    let snapshot = await getLatestSnapshot(userId)
    if (!snapshot || !isRecentSnapshot(snapshot.evaluatedAt, STALE_THRESHOLD_MS)) {
      snapshot = await evaluate(userId, 'manual_refresh')
    }

    let riskTrajectories = snapshot.riskTrajectories
    if (domainFilter) {
      const filtered: Record<string, typeof riskTrajectories[string]> = {}
      for (const key of domainFilter.split(',')) {
        if (riskTrajectories[key]) filtered[key] = riskTrajectories[key]
      }
      riskTrajectories = filtered
    }

    return NextResponse.json({
      riskTrajectories,
      evaluatedAt: snapshot.evaluatedAt,
    })
  } catch (error) {
    console.error('Brain risk API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch risk trajectories' },
      { status: 500 }
    )
  }
}
