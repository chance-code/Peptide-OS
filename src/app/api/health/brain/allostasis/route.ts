import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { evaluate, getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 5 * 60 * 1000

// GET /api/health/brain/allostasis — Allostatic load assessment
export async function GET() {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    let snapshot = await getLatestSnapshot(userId)
    if (!snapshot || !isRecentSnapshot(snapshot.evaluatedAt, STALE_THRESHOLD_MS)) {
      snapshot = await evaluate(userId, 'manual_refresh')
    }

    return NextResponse.json({
      allostasis: snapshot.allostasis,
      evaluatedAt: snapshot.evaluatedAt,
    })
  } catch (error) {
    console.error('Brain allostasis API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch allostatic load' },
      { status: 500 }
    )
  }
}
