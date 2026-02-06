// Lab Protocol Effectiveness — Score protocols against lab-verified outcomes
// Bridges wearable-level evidence (health-evidence-engine.ts) with lab truth.

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, type BiomarkerFlag, computeFlag } from '@/lib/lab-biomarker-contract'
import { type MarkerDelta, getDomainForBiomarker, BioDomain } from './lab-domains'

// ─── Types ──────────────────────────────────────────────────────────────────

export type LabVerdict = 'working' | 'early_signal' | 'unclear' | 'not_working' | 'possible_adverse'

export interface TargetMarkerResult {
  biomarkerKey: string
  displayName: string
  expectedEffect: string
  actualEffect: string
  effectMatch: 'matched' | 'partial' | 'no_effect' | 'opposite'
}

export interface ProtocolLabEffectiveness {
  protocolId: string
  protocolName: string
  protocolType: 'peptide' | 'supplement'

  labVerdict: LabVerdict
  labVerdictExplanation: string
  labVerdictConfidence: 'high' | 'medium' | 'low'

  targetMarkers: TargetMarkerResult[]

  adherencePercent: number
  daysOnProtocol: number
  adherenceNote: string

  wearableVerdictId?: string
  wearableAlignment: 'aligned' | 'mixed' | 'contradictory' | 'no_wearable_data'

  recommendation: 'continue' | 'increase' | 'decrease' | 'pause' | 'discuss_with_clinician'
  recommendationRationale: string
  nextCheckpoint: string
}

// ─── Protocol → Expected Markers Mapping ────────────────────────────────────

// Maps protocol/supplement names (lowercase) to the biomarker keys they're expected to affect
// and what direction the effect should be.
interface ExpectedMarkerEffect {
  biomarkerKey: string
  expectedDirection: 'increase' | 'decrease'
  description: string
}

const PROTOCOL_MARKER_MAP: Record<string, ExpectedMarkerEffect[]> = {
  'vitamin d': [
    { biomarkerKey: 'vitamin_d', expectedDirection: 'increase', description: 'raise 25-OH-D levels' },
  ],
  'vitamin d3': [
    { biomarkerKey: 'vitamin_d', expectedDirection: 'increase', description: 'raise 25-OH-D levels' },
  ],
  'fish oil': [
    { biomarkerKey: 'triglycerides', expectedDirection: 'decrease', description: 'reduce triglycerides' },
    { biomarkerKey: 'hs_crp', expectedDirection: 'decrease', description: 'reduce inflammation' },
    { biomarkerKey: 'omega_3_index', expectedDirection: 'increase', description: 'raise omega-3 index' },
  ],
  'omega-3': [
    { biomarkerKey: 'triglycerides', expectedDirection: 'decrease', description: 'reduce triglycerides' },
    { biomarkerKey: 'hs_crp', expectedDirection: 'decrease', description: 'reduce inflammation' },
  ],
  'magnesium': [
    { biomarkerKey: 'magnesium', expectedDirection: 'increase', description: 'raise serum magnesium' },
    { biomarkerKey: 'rbc_magnesium', expectedDirection: 'increase', description: 'raise RBC magnesium' },
  ],
  'berberine': [
    { biomarkerKey: 'hba1c', expectedDirection: 'decrease', description: 'reduce HbA1c' },
    { biomarkerKey: 'fasting_glucose', expectedDirection: 'decrease', description: 'reduce fasting glucose' },
    { biomarkerKey: 'ldl_cholesterol', expectedDirection: 'decrease', description: 'reduce LDL' },
  ],
  'nac': [
    { biomarkerKey: 'alt', expectedDirection: 'decrease', description: 'reduce liver enzymes' },
    { biomarkerKey: 'ggt', expectedDirection: 'decrease', description: 'reduce GGT' },
  ],
  'iron': [
    { biomarkerKey: 'ferritin', expectedDirection: 'increase', description: 'raise ferritin stores' },
    { biomarkerKey: 'hemoglobin', expectedDirection: 'increase', description: 'raise hemoglobin' },
  ],
  'b12': [
    { biomarkerKey: 'vitamin_b12', expectedDirection: 'increase', description: 'raise B12 levels' },
    { biomarkerKey: 'homocysteine', expectedDirection: 'decrease', description: 'reduce homocysteine' },
  ],
  'selenium': [
    { biomarkerKey: 'tpo_antibodies', expectedDirection: 'decrease', description: 'reduce thyroid antibodies' },
    { biomarkerKey: 'free_t3', expectedDirection: 'increase', description: 'support T4-to-T3 conversion' },
  ],
  'zinc': [
    { biomarkerKey: 'zinc', expectedDirection: 'increase', description: 'raise serum zinc' },
    { biomarkerKey: 'free_testosterone', expectedDirection: 'increase', description: 'support testosterone production' },
  ],
  'bpc-157': [
    { biomarkerKey: 'hs_crp', expectedDirection: 'decrease', description: 'reduce systemic inflammation' },
  ],
  'thymosin alpha-1': [
    { biomarkerKey: 'wbc', expectedDirection: 'increase', description: 'support immune cell production' },
  ],
}

// ─── Score Protocol Effectiveness ───────────────────────────────────────────

export function getExpectedMarkersForProtocol(protocolName: string): ExpectedMarkerEffect[] {
  const name = protocolName.toLowerCase()
  for (const [key, effects] of Object.entries(PROTOCOL_MARKER_MAP)) {
    if (name.includes(key)) return effects
  }
  return []
}

/**
 * Score a single protocol's effectiveness against lab data.
 */
export function scoreProtocolEffectiveness(
  protocol: {
    id: string
    name: string
    type: string
    startDate: Date
    adherencePercent: number
  },
  markerDeltas: MarkerDelta[],
  currentBiomarkers: Map<string, { value: number; flag: BiomarkerFlag }>
): ProtocolLabEffectiveness {
  const expectedEffects = getExpectedMarkersForProtocol(protocol.name)
  const deltaMap = new Map(markerDeltas.map(d => [d.biomarkerKey, d]))
  const daysOnProtocol = Math.floor((Date.now() - protocol.startDate.getTime()) / (24 * 60 * 60 * 1000))

  const targetMarkers: TargetMarkerResult[] = []
  let matchCount = 0
  let oppositeCount = 0
  let noEffectCount = 0
  let testedCount = 0

  for (const expected of expectedEffects) {
    const delta = deltaMap.get(expected.biomarkerKey)
    const current = currentBiomarkers.get(expected.biomarkerKey)
    const def = BIOMARKER_REGISTRY[expected.biomarkerKey]

    if (!delta || !current || !def) {
      // Marker not in this lab panel — can't evaluate
      continue
    }

    testedCount++
    const actualDirection = delta.absoluteDelta > 0 ? 'increase' : delta.absoluteDelta < 0 ? 'decrease' : 'stable'
    const directionMatch = actualDirection === expected.expectedDirection
    const significantChange = Math.abs(delta.percentDelta) >= 5

    let effectMatch: TargetMarkerResult['effectMatch']
    if (directionMatch && significantChange) {
      effectMatch = 'matched'
      matchCount++
    } else if (directionMatch && !significantChange) {
      effectMatch = 'partial'
    } else if (!significantChange) {
      effectMatch = 'no_effect'
      noEffectCount++
    } else {
      effectMatch = 'opposite'
      oppositeCount++
    }

    const actualEffect = `${actualDirection === 'stable' ? 'unchanged' : actualDirection + 'd'} ${Math.abs(delta.percentDelta).toFixed(1)}%`

    targetMarkers.push({
      biomarkerKey: expected.biomarkerKey,
      displayName: def.displayName,
      expectedEffect: expected.description,
      actualEffect,
      effectMatch,
    })
  }

  // Compute verdict
  const { verdict, explanation, confidence } = computeVerdict(
    matchCount, oppositeCount, noEffectCount, testedCount,
    protocol.adherencePercent, daysOnProtocol, expectedEffects.length
  )

  // Compute adherence note
  const adherenceNote = protocol.adherencePercent >= 80
    ? `${protocol.adherencePercent}% adherence over ${daysOnProtocol} days — sufficient for expected effect.`
    : protocol.adherencePercent >= 50
      ? `${protocol.adherencePercent}% adherence over ${daysOnProtocol} days — moderate. Higher adherence may improve results.`
      : `${protocol.adherencePercent}% adherence over ${daysOnProtocol} days — low adherence limits interpretation.`

  // Compute recommendation
  const recommendation = computeRecommendation(verdict, protocol.adherencePercent, daysOnProtocol)

  return {
    protocolId: protocol.id,
    protocolName: protocol.name,
    protocolType: protocol.type as 'peptide' | 'supplement',
    labVerdict: verdict,
    labVerdictExplanation: explanation,
    labVerdictConfidence: confidence,
    targetMarkers,
    adherencePercent: protocol.adherencePercent,
    daysOnProtocol,
    adherenceNote,
    wearableAlignment: 'no_wearable_data', // Set by caller if wearable data available
    recommendation: recommendation.recommendation,
    recommendationRationale: recommendation.rationale,
    nextCheckpoint: `Retest in ${verdict === 'early_signal' ? '60' : '90'} days to ${verdict === 'early_signal' ? 'confirm emerging trend' : 'verify continued effect'}.`,
  }
}

// ─── Verdict Computation ────────────────────────────────────────────────────

function computeVerdict(
  matchCount: number,
  oppositeCount: number,
  noEffectCount: number,
  testedCount: number,
  adherencePercent: number,
  daysOnProtocol: number,
  totalExpectedMarkers: number
): { verdict: LabVerdict; explanation: string; confidence: 'high' | 'medium' | 'low' } {
  // If we can't test any markers, verdict is unclear
  if (testedCount === 0) {
    return {
      verdict: 'unclear',
      explanation: totalExpectedMarkers === 0
        ? 'No known target markers for this protocol in the biomarker registry.'
        : 'Target markers were not included in this lab panel.',
      confidence: 'low',
    }
  }

  // Possible adverse: any target marker moved opposite AND worsened by ≥1 flag level
  if (oppositeCount > 0 && daysOnProtocol >= 60) {
    return {
      verdict: 'possible_adverse',
      explanation: `${oppositeCount} target marker(s) moved in the opposite direction of expected effect.`,
      confidence: adherencePercent >= 70 ? 'medium' : 'low',
    }
  }

  // Working: good adherence, sufficient time, markers match
  if (matchCount >= 1 && adherencePercent >= 70 && daysOnProtocol >= 60) {
    const confidence: 'high' | 'medium' | 'low' = matchCount >= 2 && adherencePercent >= 80 && daysOnProtocol >= 90 ? 'high' : 'medium'
    return {
      verdict: 'working',
      explanation: `${matchCount} of ${testedCount} target markers moved in the expected direction with meaningful change.`,
      confidence,
    }
  }

  // Early signal: some positive movement but early
  if (matchCount >= 1 && daysOnProtocol < 60) {
    return {
      verdict: 'early_signal',
      explanation: `Positive signals emerging after ${daysOnProtocol} days, but still early. More time needed to confirm.`,
      confidence: 'low',
    }
  }

  // Not working: sufficient time + adherence but no effect
  if (noEffectCount >= testedCount && adherencePercent >= 70 && daysOnProtocol >= 90) {
    return {
      verdict: 'not_working',
      explanation: `After ${daysOnProtocol} days at ${adherencePercent}% adherence, no meaningful change in target markers.`,
      confidence: adherencePercent >= 80 ? 'medium' : 'low',
    }
  }

  // Low adherence or too early — unclear
  return {
    verdict: 'unclear',
    explanation: adherencePercent < 50
      ? `Adherence of ${adherencePercent}% is too low to evaluate effectiveness.`
      : `Only ${daysOnProtocol} days on protocol — more time needed for definitive assessment.`,
    confidence: 'low',
  }
}

function computeRecommendation(
  verdict: LabVerdict,
  adherencePercent: number,
  daysOnProtocol: number
): { recommendation: ProtocolLabEffectiveness['recommendation']; rationale: string } {
  switch (verdict) {
    case 'working':
      return {
        recommendation: 'continue',
        rationale: 'Lab data confirms expected effect. Continue current protocol.',
      }
    case 'early_signal':
      return {
        recommendation: 'continue',
        rationale: 'Early positive signals. Continue and retest to confirm.',
      }
    case 'unclear':
      if (adherencePercent < 50) {
        return {
          recommendation: 'continue',
          rationale: 'Increase adherence to at least 70% before evaluating effectiveness.',
        }
      }
      return {
        recommendation: 'continue',
        rationale: 'More time needed before making changes. Continue for at least 90 days with consistent adherence.',
      }
    case 'not_working':
      return {
        recommendation: 'pause',
        rationale: 'No lab-verified effect after sufficient time and adherence. Consider pausing or switching to an alternative.',
      }
    case 'possible_adverse':
      return {
        recommendation: 'discuss_with_clinician',
        rationale: 'One or more markers moved in an unexpected direction. Discuss with your healthcare provider before continuing.',
      }
  }
}

// ─── Batch Scoring ──────────────────────────────────────────────────────────

/**
 * Score all active protocols against lab data.
 */
export async function scoreAllProtocols(
  userId: string,
  markerDeltas: MarkerDelta[],
  currentBiomarkers: Map<string, { value: number; flag: BiomarkerFlag }>,
  labDate: Date
): Promise<ProtocolLabEffectiveness[]> {
  // Fetch active protocols with adherence data
  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: { in: ['active', 'paused'] },
      startDate: { lte: labDate },
    },
    include: {
      peptide: true,
      doseLogs: {
        where: {
          scheduledDate: { lte: labDate },
        },
      },
    },
  })

  const results: ProtocolLabEffectiveness[] = []

  for (const protocol of protocols) {
    const totalDoses = protocol.doseLogs.length
    const completedDoses = protocol.doseLogs.filter(d => d.status === 'completed').length
    const adherencePercent = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0

    const effectiveness = scoreProtocolEffectiveness(
      {
        id: protocol.id,
        name: protocol.peptide.name,
        type: protocol.peptide.type,
        startDate: protocol.startDate,
        adherencePercent,
      },
      markerDeltas,
      currentBiomarkers
    )

    results.push(effectiveness)
  }

  // Sort by verdict priority
  const verdictOrder: Record<LabVerdict, number> = {
    possible_adverse: 0,
    not_working: 1,
    working: 2,
    early_signal: 3,
    unclear: 4,
  }
  return results.sort((a, b) => verdictOrder[a.labVerdict] - verdictOrder[b.labVerdict])
}
