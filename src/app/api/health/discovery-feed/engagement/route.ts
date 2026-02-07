import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

// POST /api/health/discovery-feed/engagement - Log engagement event
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const body = await request.json()
    const { insightId, insightType, action, value } = body

    if (!insightId || !action) {
      return NextResponse.json({ error: 'Missing required fields: insightId, action' }, { status: 400 })
    }

    const validActions = ['impression', 'tap', 'dismiss', 'time_spent']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await prisma.insightEngagement.create({
      data: {
        userId,
        insightId,
        insightType: insightType ?? 'unknown',
        action,
        value: value ?? null,
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Engagement tracking error:', error)
    return NextResponse.json({ error: 'Failed to log engagement' }, { status: 500 })
  }
}

// GET /api/health/discovery-feed/engagement - Aggregate stats
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }

    const stats = await prisma.insightEngagement.groupBy({
      by: ['insightType', 'action'],
      _count: { id: true },
      _avg: { value: true },
    })

    return NextResponse.json({ stats })
  } catch (error) {
    console.error('Engagement stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch engagement stats' }, { status: 500 })
  }
}
