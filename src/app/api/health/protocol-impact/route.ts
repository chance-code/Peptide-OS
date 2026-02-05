import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { analyzeProtocolImpact } from '@/lib/health-protocol-impact'

// GET /api/health/protocol-impact - Analyze active protocol impacts on health metrics
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const impacts = await analyzeProtocolImpact(userId)

    return NextResponse.json({ impacts }, {
      headers: {
        // Short cache since this is personalized and changes with new health data
        'Cache-Control': 'private, max-age=120' // 2 min cache
      }
    })
  } catch (error) {
    console.error('Error analyzing protocol impact:', error)
    return NextResponse.json(
      { error: 'Failed to analyze protocol impact' },
      { status: 500 }
    )
  }
}
