import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { BIOMARKER_REGISTRY, computeFlag, type BiomarkerFlag } from '@/lib/lab-biomarker-contract'
import { computeTrajectory, adjustTrajectoryForPolarity } from '@/lib/labs/lab-longitudinal'

// GET /api/health/labs/marker-trend?marker=vitamin_d — Deep dive on a single marker
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const markerKey = searchParams.get('marker')

    if (!markerKey) {
      return NextResponse.json({ error: 'marker parameter is required' }, { status: 400 })
    }

    const def = BIOMARKER_REGISTRY[markerKey]
    if (!def) {
      return NextResponse.json({ error: `Unknown biomarker: ${markerKey}` }, { status: 400 })
    }

    // Fetch all data points for this marker across uploads
    const uploads = await prisma.labUpload.findMany({
      where: { userId },
      orderBy: { testDate: 'asc' },
      include: {
        biomarkers: {
          where: { biomarkerKey: markerKey },
        },
      },
    })

    const points = uploads
      .filter(u => u.biomarkers.length > 0)
      .map(u => ({
        date: u.testDate.toISOString(),
        value: u.biomarkers[0].value,
        unit: u.biomarkers[0].unit,
        flag: computeFlag(markerKey, u.biomarkers[0].value),
        uploadId: u.id,
        labName: u.labName,
      }))

    if (points.length === 0) {
      return NextResponse.json({
        error: `No data found for ${def.displayName}`,
      }, { status: 404 })
    }

    // Compute trajectory
    let trajectory: 'improving' | 'stable' | 'declining' = 'stable'
    let velocityPerMonth = 0
    if (points.length >= 2) {
      const result = computeTrajectory(
        points.map(p => ({ date: new Date(p.date), value: p.value }))
      )
      trajectory = adjustTrajectoryForPolarity(result.trajectory, def.polarity)
      velocityPerMonth = result.velocityPerMonth
    }

    // Find prediction for this marker from latest review
    let prediction = null
    const latestReview = await prisma.labEventReview.findFirst({
      where: { userId },
      orderBy: { labDate: 'desc' },
    })

    if (latestReview) {
      try {
        const predictions: Array<{
          biomarkerKey: string
          expectedDirection: string
          expectedRange?: { min: number; max: number }
          confidenceBasis: string[]
          status: string
          statusExplanation: string
        }> = JSON.parse(latestReview.predictions)
        const match = predictions.find(p => p.biomarkerKey === markerKey)
        if (match) prediction = match
      } catch { /* skip */ }
    }

    // Find evidence ledger entries related to this marker
    const ledgerEntries: Array<{
      claim: string
      claimType: string
      confidence: string
      prediction?: { outcome?: string; outcomeExplanation?: string }
    }> = []

    const allReviews = await prisma.labEventReview.findMany({
      where: { userId },
      select: { evidenceLedger: true },
    })

    for (const review of allReviews) {
      try {
        const entries: Array<{
          claim: string
          claimType: string
          confidence: string
          evidence: { markers: Array<{ biomarkerKey: string }> }
          prediction?: { marker?: string; outcome?: string; outcomeExplanation?: string }
        }> = JSON.parse(review.evidenceLedger)
        for (const entry of entries) {
          const involves = entry.evidence?.markers?.some(m => m.biomarkerKey === markerKey) ||
            entry.prediction?.marker === markerKey
          if (involves) {
            ledgerEntries.push({
              claim: entry.claim,
              claimType: entry.claimType,
              confidence: entry.confidence,
              prediction: entry.prediction ? {
                outcome: entry.prediction.outcome,
                outcomeExplanation: entry.prediction.outcomeExplanation,
              } : undefined,
            })
          }
        }
      } catch { /* skip */ }
    }

    // Reference ranges
    const referenceRange = def.referenceRange
      ? { min: def.referenceRange.min, max: def.referenceRange.max }
      : null
    const optimalRange = def.optimalRange
      ? { min: def.optimalRange.min, max: def.optimalRange.max, optimal: def.optimalRange.optimal }
      : null

    return NextResponse.json({
      biomarkerKey: markerKey,
      displayName: def.displayName,
      shortName: def.shortName ?? def.displayName,
      category: def.category,
      unit: def.unit,
      polarity: def.polarity,
      points,
      trajectory,
      velocityPerMonth,
      percentChange: points.length >= 2
        ? Math.round(((points[points.length - 1].value - points[0].value) / points[0].value) * 1000) / 10
        : 0,
      referenceRange,
      optimalRange,
      prediction,
      evidenceHistory: ledgerEntries.slice(0, 10),
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('Error fetching marker trend:', error)
    return NextResponse.json({ error: 'Failed to fetch marker trend' }, { status: 500 })
  }
}
