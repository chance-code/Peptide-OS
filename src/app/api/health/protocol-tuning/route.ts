import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { analyzeProtocolTuning } from '@/lib/health-protocol-tuning'

export const dynamic = 'force-dynamic'

// GET /api/health/protocol-tuning?protocolId=xxx (optional - omit for all active)
// Returns tuning recommendations for active protocols
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const protocolId = searchParams.get('protocolId') || undefined

    const recommendations = await analyzeProtocolTuning(userId, protocolId)

    return NextResponse.json(
      { recommendations },
      {
        headers: {
          'Cache-Control': 'private, max-age=300', // 5 min cache
        },
      }
    )
  } catch (error) {
    console.error('Error analyzing protocol tuning:', error)
    return NextResponse.json(
      { error: 'Failed to analyze protocol tuning' },
      { status: 500 }
    )
  }
}
