import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import {
  getPersonalBaselines,
  getOverallBaselineConfidence,
} from '@/lib/health-personal-baselines'

export const dynamic = 'force-dynamic'

// GET /api/health/brain/baselines — Personal baselines + confidence
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const biomarkerKey = searchParams.get('biomarkerKey') ?? undefined

    const baselines = await getPersonalBaselines(userId, biomarkerKey)

    // Compute overall confidence from max draw count
    const maxDrawCount = baselines.reduce((max, b) => Math.max(max, b.drawCount), 0)
    const overallConfidence = getOverallBaselineConfidence(maxDrawCount)

    return NextResponse.json({
      baselines,
      totalMarkers: baselines.length,
      primaryCount: baselines.filter(b => b.isPrimary).length,
      overallConfidence,
      maxDrawCount,
    })
  } catch (error) {
    console.error('Brain baselines API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch personal baselines' },
      { status: 500 }
    )
  }
}
