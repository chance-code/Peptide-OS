import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { generateDailyFeed } from '@/lib/discovery-feed-engine'
import prisma from '@/lib/prisma'

// GET /api/health/discovery-feed
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) return authResult.response

    const feed = await generateDailyFeed(authResult.userId)

    return NextResponse.json(feed, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('Error generating discovery feed:', error)
    return NextResponse.json(
      { error: 'Failed to generate discovery feed' },
      { status: 500 },
    )
  }
}

// PUT /api/health/discovery-feed
// Body: { insightId: string, action: 'seen' | 'dismissed' }
export async function PUT(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) return authResult.response

    const body = await request.json()
    const { insightId, action } = body as { insightId?: string; action?: string }

    if (!insightId || !action) {
      return NextResponse.json(
        { error: 'Must provide insightId and action' },
        { status: 400 },
      )
    }

    if (action !== 'seen' && action !== 'dismissed') {
      return NextResponse.json(
        { error: 'Action must be "seen" or "dismissed"' },
        { status: 400 },
      )
    }

    // Verify ownership
    const insight = await prisma.discoveryInsight.findUnique({
      where: { id: insightId },
    })

    if (!insight || insight.userId !== authResult.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await prisma.discoveryInsight.update({
      where: { id: insightId },
      data: action === 'seen' ? { seen: true } : { dismissed: true },
    })

    return NextResponse.json({
      id: updated.id,
      seen: updated.seen,
      dismissed: updated.dismissed,
    })
  } catch (error) {
    console.error('Error updating discovery insight:', error)
    return NextResponse.json(
      { error: 'Failed to update insight' },
      { status: 500 },
    )
  }
}
