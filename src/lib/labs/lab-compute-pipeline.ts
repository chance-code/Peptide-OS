// Lab Compute Pipeline — Orchestrates the full intelligence computation on each lab upload.
// This is the core "brain" that runs every time a new lab result arrives.
//
// Pipeline:
//   1. Fetch previous lab data + historical points
//   2. Compute marker deltas (current vs previous)
//   3. Compute domain summaries (10 biological domains)
//   4. Verify pending predictions from the evidence ledger
//   5. Generate new trajectory predictions
//   6. Score protocol effectiveness against lab truth
//   7. Generate new ledger entries (observations + attributions)
//   8. Compute verdict (headline, takeaways, focus area)
//   9. Persist everything to LabEventReview

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, computeFlag, type BiomarkerFlag } from '@/lib/lab-biomarker-contract'
import {
  computeMarkerDeltas,
  computeDomainSummaries,
  type BiomarkerPoint,
  type MarkerDelta,
  type DomainSummary,
  BioDomain,
  DOMAIN_CONFIGS,
} from './lab-domains'
import {
  verifyPendingPredictions,
  generateObservationEntries,
  generateAttributionEntries,
  generateSignificantDeltaEntries,
  computePredictionAccuracy,
  type EvidenceLedgerEntry,
} from './lab-evidence-ledger'
import { generateTrajectoryPredictions, type TrajectoryPrediction } from './lab-trajectory-engine'
import { scoreProtocolEffectiveness, getExpectedMarkersForProtocol, type ProtocolLabEffectiveness } from './lab-protocol-effectiveness'
import { analyzeLabPatterns } from './lab-analyzer'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComputePipelineResult {
  labEventReviewId: string
  domainSummaries: DomainSummary[]
  markerDeltas: MarkerDelta[]
  predictions: TrajectoryPrediction[]
  protocolScores: ProtocolLabEffectiveness[]
  evidenceLedger: EvidenceLedgerEntry[]
  verdictHeadline: string
  verdictTakeaways: string[]
  verdictFocus: string
  verdictConfidence: 'high' | 'medium' | 'low'
  trialCyclePhase: string
  isFirstLab: boolean
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function runComputePipeline(
  userId: string,
  labUploadId: string
): Promise<ComputePipelineResult> {
  // ── Step 0: Fetch the current upload + all uploads for this user ─────────
  const currentUpload = await prisma.labUpload.findUniqueOrThrow({
    where: { id: labUploadId },
    include: { biomarkers: true },
  })

  const allUploads = await prisma.labUpload.findMany({
    where: { userId },
    orderBy: { testDate: 'asc' },
    include: { biomarkers: true },
  })

  const labEventCount = allUploads.length
  const uploadIndex = allUploads.findIndex(u => u.id === labUploadId)
  const previousUpload = uploadIndex > 0 ? allUploads[uploadIndex - 1] : null
  const isFirstLab = previousUpload === null

  // ── Step 1: Build biomarker point arrays ─────────────────────────────────
  const currentBiomarkers: BiomarkerPoint[] = currentUpload.biomarkers.map(bm => ({
    biomarkerKey: bm.biomarkerKey,
    value: bm.value,
    unit: bm.unit,
    flag: computeFlag(bm.biomarkerKey, bm.value),
    date: currentUpload.testDate,
  }))

  const previousBiomarkers: BiomarkerPoint[] = previousUpload
    ? previousUpload.biomarkers.map(bm => ({
        biomarkerKey: bm.biomarkerKey,
        value: bm.value,
        unit: bm.unit,
        flag: computeFlag(bm.biomarkerKey, bm.value),
        date: previousUpload.testDate,
      }))
    : []

  // Build historical points map (all uploads) for velocity computation
  const historicalPoints = new Map<string, Array<{ date: Date; value: number }>>()
  for (const upload of allUploads) {
    for (const bm of upload.biomarkers) {
      if (!historicalPoints.has(bm.biomarkerKey)) {
        historicalPoints.set(bm.biomarkerKey, [])
      }
      historicalPoints.get(bm.biomarkerKey)!.push({
        date: upload.testDate,
        value: bm.value,
      })
    }
  }

  // ── Step 2: Compute marker deltas ────────────────────────────────────────
  const markerDeltas = isFirstLab
    ? []
    : computeMarkerDeltas(currentBiomarkers, previousBiomarkers, historicalPoints)

  // ── Step 3: Compute domain summaries ─────────────────────────────────────
  const domainSummaries = computeDomainSummaries(currentBiomarkers, markerDeltas, labEventCount)

  // ── Step 4: Verify pending predictions ───────────────────────────────────
  const currentBiomarkerMap = new Map<string, { value: number; flag: BiomarkerFlag }>(
    currentBiomarkers.map(b => [b.biomarkerKey, { value: b.value, flag: b.flag }])
  )

  // Load existing evidence ledger from previous reviews
  let existingLedger: EvidenceLedgerEntry[] = []
  const previousReviews = await prisma.labEventReview.findMany({
    where: { userId },
    orderBy: { labDate: 'desc' },
  })

  for (const review of previousReviews) {
    try {
      const entries: EvidenceLedgerEntry[] = JSON.parse(review.evidenceLedger)
      existingLedger.push(...entries)
    } catch { /* skip malformed */ }
  }

  const pendingEntries = existingLedger.filter(
    e => e.prediction && e.prediction.outcome === 'pending'
  )
  const verifiedEntries = verifyPendingPredictions(
    pendingEntries,
    currentBiomarkerMap,
    labUploadId
  )

  // ── Step 5: Generate trajectory predictions ──────────────────────────────
  // Fetch active protocols for prediction context
  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: { in: ['active', 'paused'] },
      startDate: { lte: currentUpload.testDate },
    },
    include: {
      peptide: true,
      doseLogs: {
        where: { scheduledDate: { lte: currentUpload.testDate } },
      },
    },
  })

  const activeProtocols = protocols.map(p => {
    const totalDoses = p.doseLogs.length
    const completedDoses = p.doseLogs.filter(d => d.status === 'completed').length
    const adherencePercent = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0
    const daysOnProtocol = Math.floor((currentUpload.testDate.getTime() - p.startDate.getTime()) / (24 * 60 * 60 * 1000))
    return {
      id: p.id,
      name: p.peptide.name,
      type: p.peptide.type,
      adherencePercent,
      daysOnProtocol,
      startDate: p.startDate,
      expectedMarkers: getExpectedMarkersForProtocol(p.peptide.name).map(e => e.biomarkerKey),
    }
  })

  const predictions = generateTrajectoryPredictions(
    currentBiomarkers,
    historicalPoints,
    activeProtocols
  )

  // ── Step 6: Score protocol effectiveness ─────────────────────────────────
  const protocolScores: ProtocolLabEffectiveness[] = []
  for (const protocol of activeProtocols) {
    const score = scoreProtocolEffectiveness(
      {
        id: protocol.id,
        name: protocol.name,
        type: protocol.type,
        startDate: protocol.startDate,
        adherencePercent: protocol.adherencePercent,
      },
      markerDeltas,
      currentBiomarkerMap
    )
    protocolScores.push(score)
  }

  // Sort: adverse/not_working first
  const verdictOrder: Record<string, number> = {
    possible_adverse: 0, not_working: 1, working: 2, early_signal: 3, unclear: 4,
  }
  protocolScores.sort((a, b) => (verdictOrder[a.labVerdict] ?? 4) - (verdictOrder[b.labVerdict] ?? 4))

  // ── Step 7: Generate new ledger entries ──────────────────────────────────
  const labDateStr = currentUpload.testDate.toISOString().split('T')[0]
  const prevDateStr = previousUpload
    ? previousUpload.testDate.toISOString().split('T')[0]
    : labDateStr

  const observationEntries = generateObservationEntries(labUploadId, markerDeltas, labDateStr)

  const attributionEntries = generateAttributionEntries(
    labUploadId,
    markerDeltas,
    activeProtocols.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      adherencePercent: p.adherencePercent,
      daysOnProtocol: p.daysOnProtocol,
      startDate: prevDateStr,
      expectedMarkers: p.expectedMarkers,
    })),
    labDateStr,
    prevDateStr
  )

  const significantDeltaEntries = generateSignificantDeltaEntries(
    labUploadId,
    markerDeltas,
    attributionEntries,
    activeProtocols.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      adherencePercent: p.adherencePercent,
      daysOnProtocol: p.daysOnProtocol,
    })),
    labDateStr,
    prevDateStr
  )

  // Build prediction entries from trajectory predictions
  const predictionEntries: EvidenceLedgerEntry[] = predictions
    .filter(p => p.expectedDirection !== 'unknown' && p.expectedRange)
    .slice(0, 5)  // Top 5 most confident predictions
    .map(pred => ({
      id: `led_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      labEventId: labUploadId,
      claim: `Predicted: ${pred.displayName} will ${pred.expectedDirection} to ${pred.expectedRange!.min}–${pred.expectedRange!.max} ${BIOMARKER_REGISTRY[pred.biomarkerKey]?.unit ?? ''} over the next quarter.`,
      claimType: 'prediction' as const,
      evidence: {
        markers: [{
          biomarkerKey: pred.biomarkerKey,
          value: pred.currentValue,
          flag: computeFlag(pred.biomarkerKey, pred.currentValue),
        }],
        protocols: [],
        timeWindow: { from: labDateStr, to: labDateStr },
      },
      confounds: [],
      confidence: pred.confidenceBasis.length >= 3 ? 'medium' as const : 'low' as const,
      strengthScore: Math.min(1, pred.confidenceBasis.length * 0.25),
      prediction: {
        marker: pred.biomarkerKey,
        expectedDirection: pred.expectedDirection as 'increase' | 'decrease' | 'stable',
        expectedRange: pred.expectedRange,
        timeframe: '90 days',
        outcome: 'pending' as const,
      },
    }))

  // Combine all ledger entries for this event
  const newLedgerEntries: EvidenceLedgerEntry[] = [
    ...verifiedEntries.filter(e => e.prediction?.outcome !== 'pending'),
    ...observationEntries,
    ...attributionEntries,
    ...significantDeltaEntries,
    ...predictionEntries,
  ]

  // ── Step 8: Compute verdict ──────────────────────────────────────────────
  const { verdictHeadline, verdictTakeaways, verdictFocus, verdictConfidence } =
    computeVerdict(domainSummaries, markerDeltas, protocolScores, predictions, isFirstLab, labEventCount)

  // ── Step 9: Determine trial cycle phase ──────────────────────────────────
  const trialCyclePhase = determineTrialCyclePhase(activeProtocols, isFirstLab, labEventCount)

  // ── Step 10: Persist to LabEventReview ───────────────────────────────────
  const review = await prisma.labEventReview.upsert({
    where: { labUploadId },
    create: {
      userId,
      labUploadId,
      labDate: currentUpload.testDate,
      domainSummaries: JSON.stringify(domainSummaries),
      markerDeltas: JSON.stringify(markerDeltas),
      predictions: JSON.stringify(predictions),
      protocolScores: JSON.stringify(protocolScores),
      evidenceLedger: JSON.stringify(newLedgerEntries),
      trialCyclePhase,
      verdictHeadline,
      verdictTakeaways: JSON.stringify(verdictTakeaways),
      verdictFocus,
      verdictConfidence,
    },
    update: {
      domainSummaries: JSON.stringify(domainSummaries),
      markerDeltas: JSON.stringify(markerDeltas),
      predictions: JSON.stringify(predictions),
      protocolScores: JSON.stringify(protocolScores),
      evidenceLedger: JSON.stringify(newLedgerEntries),
      trialCyclePhase,
      verdictHeadline,
      verdictTakeaways: JSON.stringify(verdictTakeaways),
      verdictFocus,
      verdictConfidence,
    },
  })

  return {
    labEventReviewId: review.id,
    domainSummaries,
    markerDeltas,
    predictions,
    protocolScores,
    evidenceLedger: newLedgerEntries,
    verdictHeadline,
    verdictTakeaways,
    verdictFocus,
    verdictConfidence,
    trialCyclePhase,
    isFirstLab,
  }
}

// ─── Verdict Generation ────────────────────────────────────────────────────

function computeVerdict(
  domains: DomainSummary[],
  deltas: MarkerDelta[],
  protocolScores: ProtocolLabEffectiveness[],
  predictions: TrajectoryPrediction[],
  isFirstLab: boolean,
  labEventCount: number
): {
  verdictHeadline: string
  verdictTakeaways: string[]
  verdictFocus: string
  verdictConfidence: 'high' | 'medium' | 'low'
} {
  const takeaways: string[] = []
  let headline = ''
  let focus = ''
  let confidence: 'high' | 'medium' | 'low' = 'low'

  if (isFirstLab) {
    // First lab — baseline establishment
    const needsAttention = domains.filter(d => d.status === 'needs_attention')
    const optimal = domains.filter(d => d.status === 'stable' || d.status === 'improving')

    headline = needsAttention.length > 0
      ? `Baseline established. ${needsAttention.length} domain${needsAttention.length > 1 ? 's' : ''} to watch.`
      : 'Strong baseline. All domains within range.'

    if (needsAttention.length > 0) {
      focus = needsAttention[0].displayName
      for (const domain of needsAttention) {
        takeaways.push(`${domain.displayName}: ${domain.narrative}`)
      }
    } else {
      focus = 'Maintaining current trajectory'
      takeaways.push('All domains within range — a strong starting point.')
    }

    takeaways.push('Upload your next lab in 90 days to unlock trend analysis and predictions.')
    confidence = 'low'

  } else {
    // Subsequent labs — trend + effectiveness analysis
    const improving = domains.filter(d => d.status === 'improving')
    const needsAttention = domains.filter(d => d.status === 'needs_attention')
    const significantDeltas = deltas.filter(d => d.isSignificant)
    const worseningDeltas = significantDeltas.filter(d => d.flagTransition === 'worsened')
    const improvingDeltas = significantDeltas.filter(d => d.flagTransition === 'improved')

    // Protocol-based takeaways
    const workingProtocols = protocolScores.filter(p => p.labVerdict === 'working')
    const notWorkingProtocols = protocolScores.filter(p => p.labVerdict === 'not_working')
    const adverseProtocols = protocolScores.filter(p => p.labVerdict === 'possible_adverse')

    // Headline
    if (adverseProtocols.length > 0) {
      headline = `Attention needed: ${adverseProtocols[0].protocolName} may be causing adverse effects.`
    } else if (worseningDeltas.length > improvingDeltas.length && worseningDeltas.length >= 3) {
      headline = `${worseningDeltas.length} markers moving in the wrong direction. Time to reassess.`
    } else if (improvingDeltas.length > worseningDeltas.length && improvingDeltas.length >= 2) {
      headline = `Positive momentum: ${improvingDeltas.length} markers improving${workingProtocols.length > 0 ? `, ${workingProtocols.length} protocol${workingProtocols.length > 1 ? 's' : ''} working` : ''}.`
    } else if (workingProtocols.length > 0) {
      const hasOvershoot = workingProtocols.some(p => p.recommendation === 'decrease' || p.recommendation === 'discuss_with_clinician')
      if (hasOvershoot) {
        headline = `${workingProtocols[0].protocolName} is working — but some markers need attention.`
      } else {
        headline = `${workingProtocols[0].protocolName} is showing lab-verified results.`
      }
    } else {
      headline = `${significantDeltas.length} significant changes since last labs.`
    }

    // Takeaways — include recommendation context for actionable protocols
    for (const p of workingProtocols.slice(0, 2)) {
      const overshootMarkers = p.targetMarkers.filter((m: { overshoot?: boolean }) => m.overshoot)
      if (overshootMarkers.length > 0) {
        const names = overshootMarkers.map((m: { displayName: string }) => m.displayName).join(', ')
        takeaways.push(`${p.protocolName}: Working, but ${names} now above optimal. ${p.recommendationRationale}`)
      } else {
        takeaways.push(`${p.protocolName}: ${p.labVerdictExplanation}`)
      }
    }
    for (const p of adverseProtocols) {
      takeaways.push(`${p.protocolName}: ${p.labVerdictExplanation} ${p.recommendationRationale}`)
    }
    for (const p of notWorkingProtocols.slice(0, 1)) {
      takeaways.push(`${p.protocolName}: ${p.labVerdictExplanation}`)
    }

    // Check for significant improving deltas not covered by any protocol's target markers
    const allTargetMarkerKeys = new Set<string>()
    for (const ps of protocolScores) {
      for (const tm of ps.targetMarkers) {
        allTargetMarkerKeys.add(tm.biomarkerKey)
      }
    }

    const unmappedImprovingDeltas = significantDeltas.filter(
      d => d.absoluteDelta > 0 && !allTargetMarkerKeys.has(d.biomarkerKey)
    )
    const activeProtocolNames = protocolScores.filter(
      p => p.labVerdict === 'working' || p.labVerdict === 'early_signal' || p.labVerdict === 'unclear'
    )

    if (unmappedImprovingDeltas.length > 0 && activeProtocolNames.length > 0) {
      for (const delta of unmappedImprovingDeltas.slice(0, 2)) {
        const protocolName = activeProtocolNames[0].protocolName
        takeaways.push(`Notable: ${delta.displayName} increased ${Math.abs(delta.percentDelta).toFixed(1)}% while ${protocolName} was active.`)
      }
    }

    if (improvingDeltas.length > 0) {
      const topImprovement = improvingDeltas[0]
      takeaways.push(`Top improvement: ${topImprovement.displayName} moved from ${topImprovement.previousFlag} to ${topImprovement.currentFlag}.`)
    }
    if (worseningDeltas.length > 0) {
      const topConcern = worseningDeltas[0]
      takeaways.push(`Watch: ${topConcern.displayName} moved from ${topConcern.previousFlag} to ${topConcern.currentFlag}.`)
    }

    // Focus
    const overshootProtocols = workingProtocols.filter(p => p.recommendation === 'decrease')
    const clinicianProtocols = protocolScores.filter(p => p.recommendation === 'discuss_with_clinician')
    if (clinicianProtocols.length > 0) {
      focus = `Discuss ${clinicianProtocols[0].protocolName} dosing with your clinician`
    } else if (overshootProtocols.length > 0) {
      focus = `Consider reducing ${overshootProtocols[0].protocolName} dose`
    } else if (adverseProtocols.length > 0) {
      focus = `Discuss ${adverseProtocols[0].protocolName} with your clinician`
    } else if (needsAttention.length > 0) {
      focus = needsAttention[0].displayName
    } else if (improving.length > 0) {
      focus = `Continue momentum in ${improving[0].displayName}`
    } else {
      focus = 'Maintain current protocols'
    }

    // Confidence
    if (labEventCount >= 3 && deltas.length >= 5) {
      confidence = 'high'
    } else if (labEventCount >= 2 && deltas.length >= 3) {
      confidence = 'medium'
    }
  }

  // Ensure at least one takeaway
  if (takeaways.length === 0) {
    takeaways.push('No significant changes detected. Continue current approach.')
  }

  return { verdictHeadline: headline, verdictTakeaways: takeaways, verdictFocus: focus, verdictConfidence: confidence }
}

// ─── Trial Cycle Phase ─────────────────────────────────────────────────────

function determineTrialCyclePhase(
  activeProtocols: Array<{ daysOnProtocol: number; adherencePercent: number }>,
  isFirstLab: boolean,
  labEventCount: number
): string {
  if (isFirstLab) return 'baseline'
  if (activeProtocols.length === 0) return 'plan'

  const avgDays = activeProtocols.reduce((s, p) => s + p.daysOnProtocol, 0) / activeProtocols.length

  if (avgDays < 30) return 'execute_early'
  if (avgDays < 90) return 'execute'
  return 'verify'
}
