import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { evaluate, type BrainTrigger } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

// POST /api/health/brain/refresh — Manual full evaluation
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    let trigger: BrainTrigger = 'manual_refresh'
    try {
      const body = await request.json()
      if (body.trigger && ['lab_upload', 'daily_wearable_sync', 'protocol_change', 'manual_refresh'].includes(body.trigger)) {
        trigger = body.trigger
      }
    } catch {
      // No body or invalid JSON — use default trigger
    }

    const output = await evaluate(userId, trigger)

    return NextResponse.json(output)
  } catch (error) {
    console.error('Brain refresh API error:', error)
    return NextResponse.json(
      { error: 'Failed to refresh health brain' },
      { status: 500 }
    )
  }
}
