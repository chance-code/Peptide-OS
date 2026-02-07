/**
 * GET /api/health/evidence
 *
 * Premium Protocol Evidence Endpoint
 *
 * Provides statistically rigorous protocol effectiveness analysis with:
 * - Enhanced effect sizes with confidence intervals
 * - Welch's t-test for p-values
 * - Severity-weighted confound scoring
 * - Mechanism detection (which metrics move together)
 * - Robustness analysis (sensitivity testing)
 *
 * Query Parameters:
 *   protocolId?: string  - Specific protocol (default: all active)
 *   window?: 7|14|30|90  - Analysis window (default: auto based on days on protocol)
 *   details?: boolean    - Include full statistics (default: false)
 *   robustness?: boolean - Include sensitivity analysis (default: false)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { computePremiumEvidence, type PremiumProtocolEvidence } from '@/lib/health-evidence-engine'
import { findProtocolMechanism } from '@/lib/protocol-mechanisms'
import { getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const start = Date.now()
  try {
    // Authenticate user
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const protocolId = searchParams.get('protocolId') || undefined
    const windowDays = parseInt(searchParams.get('window') || '0') || undefined
    const includeDetails = searchParams.get('details') === 'true'
    const includeRobustness = searchParams.get('robustness') === 'true'

    // Validate window parameter if provided
    if (windowDays !== undefined && ![7, 14, 30, 90].includes(windowDays)) {
      return NextResponse.json(
        { error: 'Invalid window parameter. Must be one of: 7, 14, 30, 90' },
        { status: 400 }
      )
    }

    // Compute evidence
    const evidence = await computePremiumEvidence(userId, protocolId, {
      windowDays,
      includeNullFindings: includeDetails,
      includeRobustness,
    })

    // Enrich each evidence item with expectedTimeline from the mechanism database
    const enrichedEvidence = evidence.map(e => {
      const timeline = computeExpectedTimeline(e.protocolName, e.daysOnProtocol)
      return {
        ...e,
        expectedTimeline: timeline,
      }
    })

    // Generate summary for the response
    const summary = generateEvidenceSummary(enrichedEvidence)

    // Enrich with Brain snapshot data if available
    let brainProtocolEvidence: any[] | null = null
    let brainConfidence: string | null = null
    const snapshot = await getLatestSnapshot(userId)
    if (snapshot && isRecentSnapshot(snapshot.evaluatedAt, 5 * 60 * 1000)) {
      brainProtocolEvidence = snapshot.protocolEvidence ?? null
      brainConfidence = snapshot.systemConfidence?.level ?? null
    }

    const isEmpty = enrichedEvidence.length === 0

    console.log(`[health/evidence] userId=${userId} ${Date.now() - start}ms 200 protocols=${enrichedEvidence.length} empty=${isEmpty}`)

    return NextResponse.json(
      {
        evidence: enrichedEvidence,
        isEmpty,
        summary,
        meta: {
          protocolCount: enrichedEvidence.length,
          requestedProtocolId: protocolId || null,
          includesDetails: includeDetails,
          includesRobustness: includeRobustness,
          generatedAt: new Date().toISOString(),
        },
        brainProtocolEvidence,
        brainConfidence,
      },
      {
        headers: {
          // Evidence is expensive to compute, cache for 5 minutes
          'Cache-Control': 'private, max-age=300',
        },
      }
    )
  } catch (error) {
    console.error(`[health/evidence] ${Date.now() - start}ms 500`, error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to compute protocol evidence. Please try again.' },
      { status: 500 }
    )
  }
}

/**
 * Compute expected timeline data from the protocol mechanism database.
 *
 * Aggregates onset/peak/plateau windows across all expected effects for
 * a protocol, then determines which phase the user is currently in based
 * on how many days they have been on the protocol.
 */
function computeExpectedTimeline(
  protocolName: string,
  daysOnProtocol: number
): {
  onsetWeeks: number[]
  peakWeeks: number[]
  plateauWeeks: number[]
  currentDay: number
  currentPhaseLabel: string
} | null {
  const mechanism = findProtocolMechanism(protocolName)
  if (!mechanism) return null

  const effects = Object.values(mechanism.expectedEffects)
  if (effects.length === 0) return null

  // Aggregate timeline ranges across all expected effects
  // onsetWeeks = the range of earliest expected effect start times
  // peakWeeks  = the range of peak effect windows (end of each effect's timeline)
  // plateauWeeks = beyond peak, where effects stabilize (1.5x the max peak time)
  const allOnsetMin = effects.map(e => e.timelineWeeks[0])
  const allOnsetMax = effects.map(e => e.timelineWeeks[0])
  const allPeakMin = effects.map(e => e.timelineWeeks[1])
  const allPeakMax = effects.map(e => e.timelineWeeks[1])

  const onsetWeeks = [Math.min(...allOnsetMin), Math.max(...allOnsetMax)]
  const peakWeeks = [Math.min(...allPeakMin), Math.max(...allPeakMax)]
  // Plateau begins after the peak window ends, extending to ~1.5x the max peak
  const plateauWeeks = [Math.max(...allPeakMax), Math.round(Math.max(...allPeakMax) * 1.5)]

  // Convert to days for phase comparison
  const onsetStartDays = onsetWeeks[0] * 7
  const onsetEndDays = onsetWeeks[1] * 7
  const peakEndDays = peakWeeks[1] * 7
  const plateauEndDays = plateauWeeks[1] * 7

  // Determine current phase label
  let currentPhaseLabel: string
  if (daysOnProtocol < onsetStartDays) {
    currentPhaseLabel = 'Before expected onset'
  } else if (daysOnProtocol <= onsetEndDays) {
    currentPhaseLabel = 'In typical onset window'
  } else if (daysOnProtocol <= peakEndDays) {
    currentPhaseLabel = 'In peak effect window'
  } else if (daysOnProtocol <= plateauEndDays) {
    currentPhaseLabel = 'In sustained phase'
  } else {
    currentPhaseLabel = 'Beyond typical timeline'
  }

  return {
    onsetWeeks,
    peakWeeks,
    plateauWeeks,
    currentDay: daysOnProtocol,
    currentPhaseLabel,
  }
}

/**
 * Generate a human-readable summary of the evidence
 */
function generateEvidenceSummary(evidence: PremiumProtocolEvidence[]): {
  overallStatus: string
  highlights: string[]
  concerns: string[]
  recommendations: string[]
} {
  if (evidence.length === 0) {
    return {
      overallStatus: 'No active protocols to evaluate',
      highlights: [],
      concerns: [],
      recommendations: ['Add a protocol to start tracking evidence.'],
    }
  }

  const highlights: string[] = []
  const concerns: string[] = []
  const recommendations: string[] = []

  // Count verdict types
  const strongPositive = evidence.filter(e => e.verdict === 'strong_positive')
  const likelyPositive = evidence.filter(e => e.verdict === 'likely_positive')
  const weakPositive = evidence.filter(e => e.verdict === 'weak_positive')
  const noEffect = evidence.filter(e => e.verdict === 'no_detectable_effect')
  const negative = evidence.filter(e => e.verdict === 'possible_negative')
  const tooEarly = evidence.filter(e => e.verdict === 'too_early' || e.verdict === 'accumulating')
  const confounded = evidence.filter(e => e.verdict === 'confounded')

  // Determine overall status
  let overallStatus: string
  if (strongPositive.length > 0) {
    overallStatus = 'Strong evidence of protocol effectiveness'
  } else if (likelyPositive.length > 0) {
    overallStatus = 'Good indicators of protocol effectiveness'
  } else if (weakPositive.length > 0) {
    overallStatus = 'Early positive signals detected'
  } else if (tooEarly.length === evidence.length) {
    overallStatus = 'Protocols still accumulating data'
  } else if (noEffect.length > 0 && negative.length === 0) {
    overallStatus = 'No significant changes detected'
  } else if (negative.length > 0) {
    overallStatus = 'Some protocols may need adjustment'
  } else if (confounded.length > 0) {
    overallStatus = 'Analysis affected by confounding factors'
  } else {
    overallStatus = 'Protocols under evaluation'
  }

  // Generate highlights
  for (const e of strongPositive) {
    if (e.effects.primary) {
      highlights.push(
        `${e.protocolName}: ${e.effects.primary.metricName} improved ${Math.abs(e.effects.primary.change.percent).toFixed(0)}% (strong evidence)`
      )
    }
  }

  for (const e of likelyPositive) {
    if (e.effects.primary) {
      highlights.push(
        `${e.protocolName}: ${e.effects.primary.metricName} improved ${Math.abs(e.effects.primary.change.percent).toFixed(0)}%`
      )
    }
  }

  // Add mechanism highlights
  const mechanismsDetected = evidence.flatMap(e =>
    e.effects.mechanisms.filter(m => m.confidence === 'high')
  )
  for (const mechanism of mechanismsDetected.slice(0, 2)) {
    highlights.push(`Detected: ${mechanism.name}`)
  }

  // Generate concerns
  for (const e of negative) {
    if (e.effects.adverse.length > 0) {
      const topAdverse = e.effects.adverse[0]
      concerns.push(
        `${e.protocolName}: ${topAdverse.metricName} moved ${topAdverse.change.percent > 0 ? 'up' : 'down'} ${Math.abs(topAdverse.change.percent).toFixed(0)}%`
      )
    }
  }

  for (const e of confounded) {
    concerns.push(
      `${e.protocolName}: ${e.confounds.totalDays} confounding days limit analysis reliability`
    )
  }

  // Generate recommendations
  for (const e of strongPositive.concat(likelyPositive)) {
    recommendations.push(`Continue ${e.protocolName} - evidence supports effectiveness`)
  }

  for (const e of negative) {
    recommendations.push(`Review ${e.protocolName} dosing or timing`)
  }

  for (const e of tooEarly) {
    recommendations.push(`${e.protocolName}: Check back after ${Math.max(7, 14 - e.daysOnProtocol)} more days`)
  }

  for (const e of noEffect) {
    if (e.daysOnProtocol >= 30) {
      recommendations.push(`${e.protocolName}: Consider whether to continue (no effect after ${e.daysOnProtocol} days)`)
    }
  }

  return {
    overallStatus,
    highlights: highlights.slice(0, 5),
    concerns: concerns.slice(0, 3),
    recommendations: recommendations.slice(0, 4),
  }
}
