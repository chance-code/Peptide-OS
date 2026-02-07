import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { computePremiumEvidence } from '@/lib/health-evidence-engine'
import { detectProtocolChangepoints } from '@/lib/protocol-changepoint-detection'
import { runCausalAnalysis } from '@/lib/protocol-causal-inference'
import { forecastAllBiomarkers } from '@/lib/health-lab-forecasting'

// GET /api/health/protocol-lab-evidence/[protocolId] - Deep protocol analysis
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ protocolId: string }> }
) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult
    const { protocolId } = await params

    // Run all engines in parallel
    const [evidence, changepoints, causal, forecasts] = await Promise.all([
      computePremiumEvidence(userId).then(
        results => results.find(e => e.protocolId === protocolId) ?? null
      ).catch(() => null),
      detectProtocolChangepoints(userId, protocolId).catch(() => null),
      runCausalAnalysis(userId, protocolId).catch(() => null),
      forecastAllBiomarkers(userId).catch(() => null),
    ])

    // Filter forecasts to biomarkers relevant to this protocol
    const relevantForecasts = forecasts?.forecasts?.filter(f =>
      f.protocolAdjustments.length > 0
    ) ?? []

    return NextResponse.json({
      protocolId,
      evidence,
      changepoints,
      causal,
      forecasts: relevantForecasts,
    }, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    console.error('Protocol lab evidence API error:', error)
    return NextResponse.json(
      { error: 'Failed to compute protocol lab evidence' },
      { status: 500 }
    )
  }
}
