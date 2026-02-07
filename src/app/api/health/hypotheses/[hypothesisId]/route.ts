import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

// GET /api/health/hypotheses/[hypothesisId] - Get hypothesis with computed results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hypothesisId: string }> }
) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult
    const { hypothesisId } = await params

    const hypothesis = await prisma.userHypothesis.findFirst({
      where: { id: hypothesisId, userId },
    })

    if (!hypothesis) {
      return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 })
    }

    let results = null

    // Compute results if active and enough data
    if (hypothesis.status === 'active') {
      const daysSinceCreation = (Date.now() - hypothesis.createdAt.getTime()) / 86400000

      if (daysSinceCreation >= 14) {
        if (hypothesis.interventionId) {
          // Protocol-linked: use existing causal inference engine
          try {
            const { runCausalAnalysis } = await import('@/lib/protocol-causal-inference')
            const causalResults = await runCausalAnalysis(userId, hypothesis.interventionId, hypothesis.metricType)

            if (causalResults && causalResults.length > 0) {
              const r = causalResults[0]
              const effectAligned = hypothesis.expectedDirection === 'increase'
                ? r.adjustedAPTE > 0
                : r.adjustedAPTE < 0

              results = {
                verdict: effectAligned
                  ? (Math.abs(r.adjustedAPTE) > 5 ? 'supported' : 'weak_support')
                  : 'not_supported',
                effectSize: r.unadjustedAPTE,
                adjustedEffect: r.adjustedAPTE,
                confidence: r.confidenceLevel,
                narrative: r.narrativeExplanation,
              }
            }
          } catch {
            // Causal analysis may not have enough data
          }
        }

        if (!results) {
          // Non-protocol or fallback: simple before/after comparison
          results = await computeSimpleComparison(userId, hypothesis)
        }
      } else {
        results = {
          verdict: 'too_early',
          effectSize: null,
          adjustedEffect: null,
          confidence: 'low',
          narrative: `${Math.ceil(14 - daysSinceCreation)} more days of data needed for initial analysis. Keep tracking consistently.`,
        }
      }
    } else if (hypothesis.resultSummary) {
      // Completed/abandoned: return stored results
      try {
        results = JSON.parse(hypothesis.resultSummary)
      } catch { /* ignore parse errors */ }
    }

    return NextResponse.json({
      hypothesis,
      results,
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('Hypothesis detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch hypothesis' }, { status: 500 })
  }
}

// PUT /api/health/hypotheses/[hypothesisId] - Update hypothesis
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ hypothesisId: string }> }
) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult
    const { hypothesisId } = await params

    const existing = await prisma.userHypothesis.findFirst({
      where: { id: hypothesisId, userId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 })
    }

    const body = await request.json()
    const { title, description, status, resultSummary } = body

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (status !== undefined) {
      updateData.status = status
      if (status === 'completed' || status === 'abandoned') {
        updateData.completedAt = new Date()
      }
    }
    if (resultSummary !== undefined) updateData.resultSummary = resultSummary

    const updated = await prisma.userHypothesis.update({
      where: { id: hypothesisId },
      data: updateData,
    })

    return NextResponse.json({ hypothesis: updated })
  } catch (error) {
    console.error('Hypothesis update error:', error)
    return NextResponse.json({ error: 'Failed to update hypothesis' }, { status: 500 })
  }
}

// DELETE /api/health/hypotheses/[hypothesisId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hypothesisId: string }> }
) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult
    const { hypothesisId } = await params

    const existing = await prisma.userHypothesis.findFirst({
      where: { id: hypothesisId, userId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 })
    }

    await prisma.userHypothesis.delete({ where: { id: hypothesisId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Hypothesis delete error:', error)
    return NextResponse.json({ error: 'Failed to delete hypothesis' }, { status: 500 })
  }
}

// ─── Simple Before/After Comparison ─────────────────────────────────────

async function computeSimpleComparison(
  userId: string,
  hypothesis: { metricType: string; expectedDirection: string; createdAt: Date },
) {
  const preStart = new Date(hypothesis.createdAt.getTime() - 30 * 86400000)

  const [preMetrics, postMetrics] = await Promise.all([
    prisma.healthMetric.findMany({
      where: {
        userId,
        metricType: hypothesis.metricType,
        recordedAt: { gte: preStart, lt: hypothesis.createdAt },
      },
      select: { value: true },
    }),
    prisma.healthMetric.findMany({
      where: {
        userId,
        metricType: hypothesis.metricType,
        recordedAt: { gte: hypothesis.createdAt },
      },
      select: { value: true },
    }),
  ])

  if (preMetrics.length < 5 || postMetrics.length < 5) {
    return {
      verdict: 'insufficient_data',
      effectSize: null,
      adjustedEffect: null,
      confidence: 'low',
      narrative: 'Not enough data points yet. Continue tracking for more reliable results.',
    }
  }

  const preMean = preMetrics.reduce((s, m) => s + m.value, 0) / preMetrics.length
  const postMean = postMetrics.reduce((s, m) => s + m.value, 0) / postMetrics.length

  if (preMean === 0) {
    return {
      verdict: 'insufficient_data',
      effectSize: null,
      adjustedEffect: null,
      confidence: 'low',
      narrative: 'Baseline data appears incomplete.',
    }
  }

  const pctChange = ((postMean - preMean) / Math.abs(preMean)) * 100
  const effectAligned = hypothesis.expectedDirection === 'increase' ? pctChange > 0 : pctChange < 0

  const confidence = Math.abs(pctChange) > 10 ? 'moderate' : Math.abs(pctChange) > 5 ? 'low' : 'very_low'

  const metricLabel = hypothesis.metricType.replace(/_/g, ' ')
  const direction = pctChange > 0 ? 'increased' : 'decreased'
  const absPct = Math.abs(pctChange).toFixed(1)

  return {
    verdict: effectAligned ? (Math.abs(pctChange) > 5 ? 'supported' : 'weak_support') : 'not_supported',
    effectSize: Math.round(pctChange * 10) / 10,
    adjustedEffect: null,
    confidence,
    narrative: `Your ${metricLabel} ${direction} by ${absPct}% since starting this intervention. ${effectAligned ? 'This aligns with your hypothesis.' : 'This suggests the intervention may not be having the expected effect.'} Consider continuing to track for more confidence.`,
  }
}
