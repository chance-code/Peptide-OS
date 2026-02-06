import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getUnifiedHealthSummary } from '@/lib/health-synthesis'
import { getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

const BRAIN_STALE_MS = 5 * 60 * 1000 // 5 minutes

// GET /api/health/summary - Get unified health summary
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const window = Math.min(Math.max(parseInt(searchParams.get('window') || '7', 10) || 7, 7), 90)

    // Try Brain snapshot first — enrich the summary with Brain data
    const snapshot = await getLatestSnapshot(userId)

    const summary = await getUnifiedHealthSummary(userId, window)

    // If Brain snapshot is recent, overlay Brain-computed fields
    if (snapshot && isRecentSnapshot(snapshot.evaluatedAt, BRAIN_STALE_MS)) {
      // Add Brain-computed unified score and domain assessments
      ;(summary as any).brainScore = snapshot.unifiedScore
      ;(summary as any).brainDomains = snapshot.domains
      ;(summary as any).brainConfidence = snapshot.systemConfidence
      ;(summary as any).brainEvaluatedAt = snapshot.evaluatedAt
    }

    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'private, max-age=0, must-revalidate'
      }
    })
  } catch (error) {
    console.error('Error generating health summary:', error)
    return NextResponse.json(
      { error: 'Failed to generate health summary' },
      { status: 500 }
    )
  }
}
