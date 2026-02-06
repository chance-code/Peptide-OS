import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'

// GET /api/health/labs/latest-review — Fetch the latest (or specific) LabEventReview
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')

    let review
    if (uploadId) {
      review = await prisma.labEventReview.findFirst({
        where: { labUploadId: uploadId, userId },
      })
    } else {
      review = await prisma.labEventReview.findFirst({
        where: { userId },
        orderBy: { labDate: 'desc' },
      })
    }

    if (!review) {
      return NextResponse.json(
        { error: 'No lab review found. Upload a lab PDF to generate your first review.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: review.id,
      labUploadId: review.labUploadId,
      labDate: review.labDate,
      trialCyclePhase: review.trialCyclePhase,
      verdict: {
        headline: review.verdictHeadline,
        takeaways: safeParseJSON(review.verdictTakeaways, []),
        focus: review.verdictFocus,
        confidence: review.verdictConfidence,
      },
      domainSummaries: safeParseJSON(review.domainSummaries, []),
      markerDeltas: safeParseJSON(review.markerDeltas, []),
      predictions: safeParseJSON(review.predictions, []),
      protocolScores: safeParseJSON(review.protocolScores, []),
      evidenceLedger: safeParseJSON(review.evidenceLedger, []),
      computedAt: review.computedAt,
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    console.error('Error fetching latest review:', error)
    return NextResponse.json({ error: 'Failed to fetch lab review' }, { status: 500 })
  }
}

function safeParseJSON(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
