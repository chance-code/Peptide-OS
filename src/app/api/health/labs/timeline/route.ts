import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { computePredictionAccuracy } from '@/lib/labs/lab-evidence-ledger'

// GET /api/health/labs/timeline — All lab events with review summaries
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Fetch all uploads with their reviews
    const uploads = await prisma.labUpload.findMany({
      where: { userId },
      orderBy: { testDate: 'desc' },
      take: limit,
      include: {
        biomarkers: { select: { biomarkerKey: true, flag: true } },
        review: true,
      },
    })

    // Compute global prediction accuracy across all reviews
    const allReviews = await prisma.labEventReview.findMany({
      where: { userId },
      select: { evidenceLedger: true },
    })

    let allLedgerEntries: Array<{ prediction?: { outcome?: string } }> = []
    for (const review of allReviews) {
      try {
        const entries = JSON.parse(review.evidenceLedger)
        allLedgerEntries.push(...entries)
      } catch { /* skip */ }
    }

    const predictionAccuracy = computePredictionAccuracy(allLedgerEntries as never[])

    const events = uploads.map(upload => {
      const flagCounts: Record<string, number> = {}
      for (const bm of upload.biomarkers) {
        flagCounts[bm.flag] = (flagCounts[bm.flag] || 0) + 1
      }

      let reviewSummary = null
      if (upload.review) {
        const r = upload.review
        reviewSummary = {
          verdictHeadline: r.verdictHeadline,
          verdictConfidence: r.verdictConfidence,
          trialCyclePhase: r.trialCyclePhase,
          domainSummaries: (safeParseJSON(r.domainSummaries, []) as Array<{ domain: string; displayName: string; status: string }>).map((d) => ({
            domain: d.domain,
            displayName: d.displayName,
            status: d.status,
          })),
        }
      }

      return {
        id: upload.id,
        testDate: upload.testDate,
        labName: upload.labName,
        biomarkersCount: upload.biomarkers.length,
        flagCounts,
        hasReview: !!upload.review,
        review: reviewSummary,
      }
    })

    return NextResponse.json({
      events,
      total: events.length,
      predictionAccuracy: {
        totalPredictions: predictionAccuracy.totalPredictions,
        confirmed: predictionAccuracy.confirmed,
        falsified: predictionAccuracy.falsified,
        pending: predictionAccuracy.pending,
        accuracyPercent: predictionAccuracy.accuracyPercent,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    console.error('Error fetching lab timeline:', error)
    return NextResponse.json({ error: 'Failed to fetch lab timeline' }, { status: 500 })
  }
}

function safeParseJSON(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
