import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getDailyStatus } from '@/lib/health-daily-status'
import { getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

const BRAIN_STALE_MS = 5 * 60 * 1000 // 5 minutes

// GET /api/health/daily-status
// Returns the daily classification and optional next-day evaluation
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    // Try Brain snapshot first for daily status
    const snapshot = await getLatestSnapshot(userId)
    if (snapshot && snapshot.dailyStatus && isRecentSnapshot(snapshot.evaluatedAt, BRAIN_STALE_MS)) {
      // Return Brain-computed daily status (enriched with Brain data)
      const enriched = {
        ...snapshot.dailyStatus,
        brainScore: snapshot.unifiedScore,
        brainConfidence: snapshot.systemConfidence?.level,
        brainEvaluatedAt: snapshot.evaluatedAt,
      }
      return NextResponse.json(enriched, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      })
    }

    // Fall back to existing daily status engine
    const status = await getDailyStatus(userId)

    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('Error computing daily status:', error)
    return NextResponse.json(
      { error: 'Failed to compute daily status' },
      { status: 500 }
    )
  }
}
