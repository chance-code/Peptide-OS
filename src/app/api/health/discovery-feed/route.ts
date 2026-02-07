import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { generateDailyFeed } from '@/lib/discovery-feed-engine'
import prisma from '@/lib/prisma'

// GET /api/health/discovery-feed
export async function GET() {
  const start = Date.now()
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) return authResult.response

    const feed = await generateDailyFeed(authResult.userId)
    const isEmpty = feed.insights.length === 0

    console.log(`[health/discovery-feed] userId=${authResult.userId} ${Date.now() - start}ms 200 insights=${feed.insights.length} empty=${isEmpty}`)

    return NextResponse.json({ ...feed, isEmpty }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error(`[health/discovery-feed] ${Date.now() - start}ms 500`, error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to generate discovery feed. Please try again.' },
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
    console.error('[discovery-feed] Error updating insight:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to update insight' },
      { status: 500 },
    )
  }
}
