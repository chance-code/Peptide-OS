import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getDailyStatus } from '@/lib/health-daily-status'

// GET /api/health/daily-status
// Returns the daily classification and optional next-day evaluation
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }

    const status = await getDailyStatus(authResult.userId)

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
