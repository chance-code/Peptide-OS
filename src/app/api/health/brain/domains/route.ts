import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { evaluate, getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 5 * 60 * 1000

// GET /api/health/brain/domains — Domain assessments only (lightweight)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const domainFilter = searchParams.get('domain')?.split(',')

    let snapshot = await getLatestSnapshot(userId)
    if (!snapshot || !isRecentSnapshot(snapshot.evaluatedAt, STALE_THRESHOLD_MS)) {
      snapshot = await evaluate(userId, 'manual_refresh')
    }

    let domains = snapshot.domains
    if (domainFilter) {
      const filtered: Record<string, typeof domains[string]> = {}
      for (const key of domainFilter) {
        if (domains[key]) filtered[key] = domains[key]
      }
      domains = filtered
    }

    return NextResponse.json({
      domains,
      unifiedScore: snapshot.unifiedScore,
      evaluatedAt: snapshot.evaluatedAt,
      confidence: snapshot.systemConfidence.level,
    })
  } catch (error) {
    console.error('Brain domains API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch domain assessments' },
      { status: 500 }
    )
  }
}
