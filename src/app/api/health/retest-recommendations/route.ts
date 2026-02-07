import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY } from '@/lib/lab-biomarker-contract'

interface RetestRecommendation {
  biomarkerKey: string
  displayName: string
  reason: string
  urgency: 'high' | 'medium' | 'low'
  lastValue: number | null
  lastDate: string | null
  daysSinceLastTest: number | null
  thresholdRisk: number | null
}

// GET /api/health/retest-recommendations - Lab retest recommendations
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const recommendations: RetestRecommendation[] = []

    // Fetch personal baselines (staleness source)
    const baselines = await prisma.personalBaseline.findMany({
      where: { userId },
    })

    // Fetch GP predictions (threshold crossing source)
    const predictions = await prisma.healthPrediction.findMany({
      where: { userId },
    })

    // Find latest lab upload date
    const latestUpload = await prisma.labUpload.findFirst({
      where: { userId },
      orderBy: { testDate: 'desc' },
    })

    const lastDrawDate = latestUpload?.testDate ?? null
    const daysSinceLastDraw = lastDrawDate
      ? Math.round((Date.now() - lastDrawDate.getTime()) / (1000 * 60 * 60 * 24))
      : null

    // 1. Stale baselines — biomarkers not tested recently
    for (const baseline of baselines) {
      const daysSince = baseline.lastLabDate
        ? Math.round((Date.now() - baseline.lastLabDate.getTime()) / (1000 * 60 * 60 * 24))
        : null

      if (daysSince && daysSince > 180) {
        const def = BIOMARKER_REGISTRY[baseline.biomarkerKey]
        recommendations.push({
          biomarkerKey: baseline.biomarkerKey,
          displayName: def?.displayName ?? baseline.biomarkerKey,
          reason: `Last tested ${Math.round(daysSince / 30)} months ago`,
          urgency: daysSince > 365 ? 'high' : 'medium',
          lastValue: baseline.lastLabValue,
          lastDate: baseline.lastLabDate?.toISOString() ?? null,
          daysSinceLastTest: daysSince,
          thresholdRisk: null,
        })
      }
    }

    // 2. GP threshold crossing risk — biomarkers predicted to leave reference range
    for (const pred of predictions) {
      if (pred.thresholdCrossProb && pred.thresholdCrossProb > 0.3) {
        const def = BIOMARKER_REGISTRY[pred.biomarkerKey]
        const existing = recommendations.find(r => r.biomarkerKey === pred.biomarkerKey)

        if (existing) {
          // Upgrade urgency and add threshold info
          if (pred.thresholdCrossProb > 0.6) existing.urgency = 'high'
          existing.thresholdRisk = pred.thresholdCrossProb
          existing.reason += ` — ${Math.round(pred.thresholdCrossProb * 100)}% chance of reaching ${pred.thresholdType ?? 'reference limit'} in 6 months`
        } else {
          recommendations.push({
            biomarkerKey: pred.biomarkerKey,
            displayName: def?.displayName ?? pred.biomarkerKey,
            reason: `${Math.round(pred.thresholdCrossProb * 100)}% chance of reaching ${pred.thresholdType ?? 'reference limit'} in 6 months`,
            urgency: pred.thresholdCrossProb > 0.6 ? 'high' : 'medium',
            lastValue: pred.currentEstimate,
            lastDate: pred.computedAt.toISOString(),
            daysSinceLastTest: null,
            thresholdRisk: pred.thresholdCrossProb,
          })
        }
      }
    }

    // 3. Active protocols without baseline labs
    const activeProtocols = await prisma.protocol.findMany({
      where: { userId, status: 'active' },
      include: { peptide: true },
    })

    for (const proto of activeProtocols) {
      const daysOn = Math.round((Date.now() - new Date(proto.startDate).getTime()) / (1000 * 60 * 60 * 24))
      // Recommend labs at 8-12 weeks on protocol if no recent lab
      if (daysOn >= 56 && daysOn <= 120) {
        const hasRecentLab = lastDrawDate && (Date.now() - lastDrawDate.getTime()) < 60 * 24 * 60 * 60 * 1000
        if (!hasRecentLab) {
          recommendations.push({
            biomarkerKey: `protocol_${proto.id}`,
            displayName: `${proto.peptide?.name ?? 'Protocol'} monitoring`,
            reason: `${daysOn} days on ${proto.peptide?.name ?? 'protocol'} — midpoint labs recommended`,
            urgency: 'medium',
            lastValue: null,
            lastDate: null,
            daysSinceLastTest: daysSinceLastDraw,
            thresholdRisk: null,
          })
        }
      }
    }

    // Sort: high urgency first
    const urgencyOrder = { high: 0, medium: 1, low: 2 }
    recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])

    return NextResponse.json({
      recommendations,
      labStaleness: daysSinceLastDraw
        ? (daysSinceLastDraw > 180 ? 'stale' : daysSinceLastDraw > 90 ? 'aging' : 'recent')
        : 'no_labs',
      lastDrawDate: lastDrawDate?.toISOString() ?? null,
    }, {
      headers: { 'Cache-Control': 'private, max-age=1800' },
    })
  } catch (error) {
    console.error('Retest recommendations API error:', error)
    return NextResponse.json(
      { error: 'Failed to compute retest recommendations' },
      { status: 500 }
    )
  }
}
