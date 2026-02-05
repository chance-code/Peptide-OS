import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getUnifiedHealthSummary } from '@/lib/health-synthesis'

// GET /api/health/summary - Get unified health summary
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const summary = await getUnifiedHealthSummary(userId)

    return NextResponse.json(summary, {
      headers: {
        // No caching — after ingest, users should see fresh data immediately.
        // The browser will always revalidate with the server.
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
