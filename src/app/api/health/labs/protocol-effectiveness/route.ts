import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'

// GET /api/health/labs/protocol-effectiveness — Protocol effectiveness scores from latest review
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const protocolId = searchParams.get('protocolId')

    // Get the latest review (which contains protocol scores)
    const latestReview = await prisma.labEventReview.findFirst({
      where: { userId },
      orderBy: { labDate: 'desc' },
    })

    if (!latestReview) {
      return NextResponse.json(
        { error: 'No lab review found. Upload a lab PDF to see protocol effectiveness.' },
        { status: 404 }
      )
    }

    let protocolScores: Array<{
      protocolId: string
      protocolName: string
      protocolType: string
      labVerdict: string
      labVerdictExplanation: string
      labVerdictConfidence: string
      targetMarkers: Array<{
        biomarkerKey: string
        displayName: string
        expectedEffect: string
        actualEffect: string
        effectMatch: string
      }>
      adherencePercent: number
      daysOnProtocol: number
      adherenceNote: string
      recommendation: string
      recommendationRationale: string
      nextCheckpoint: string
    }> = []

    try {
      protocolScores = JSON.parse(latestReview.protocolScores)
    } catch {
      protocolScores = []
    }

    // Filter to specific protocol if requested
    if (protocolId) {
      protocolScores = protocolScores.filter(p => p.protocolId === protocolId)
    }

    // Historical scores across reviews for trend
    let scoreHistory: Array<{
      labDate: string
      protocolId: string
      protocolName: string
      verdict: string
    }> = []

    if (protocolId) {
      const allReviews = await prisma.labEventReview.findMany({
        where: { userId },
        orderBy: { labDate: 'asc' },
        select: { labDate: true, protocolScores: true },
      })

      for (const review of allReviews) {
        try {
          const scores: Array<{ protocolId: string; protocolName: string; labVerdict: string }> =
            JSON.parse(review.protocolScores)
          const match = scores.find(s => s.protocolId === protocolId)
          if (match) {
            scoreHistory.push({
              labDate: review.labDate.toISOString(),
              protocolId: match.protocolId,
              protocolName: match.protocolName,
              verdict: match.labVerdict,
            })
          }
        } catch { /* skip */ }
      }
    }

    return NextResponse.json({
      labDate: latestReview.labDate,
      protocolScores,
      scoreHistory: protocolId ? scoreHistory : undefined,
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    console.error('Error fetching protocol effectiveness:', error)
    return NextResponse.json({ error: 'Failed to fetch protocol effectiveness' }, { status: 500 })
  }
}
