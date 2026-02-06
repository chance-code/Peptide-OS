import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { evaluate, getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

// GET /api/health/brain — Full HealthBrainOutput
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Try cached snapshot first (unless force refresh)
    if (!force) {
      const snapshot = await getLatestSnapshot(userId)
      if (snapshot && isRecentSnapshot(snapshot.evaluatedAt, STALE_THRESHOLD_MS)) {
        return NextResponse.json(snapshot)
      }
    }

    // Evaluate fresh
    const output = await evaluate(userId, 'manual_refresh')
    return NextResponse.json(output)
  } catch (error) {
    console.error('Brain API error:', error)
    return NextResponse.json(
      { error: 'Failed to evaluate health brain' },
      { status: 500 }
    )
  }
}
