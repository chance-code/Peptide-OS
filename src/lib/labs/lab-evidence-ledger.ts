// Lab Evidence Ledger — The Memory of ARC's Reasoning
// Every insight, prediction, or recommendation becomes a ledger entry.
// Future lab events verify past predictions, making ARC smarter over time.

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, type BiomarkerFlag, computeFlag } from '@/lib/lab-biomarker-contract'
import { type MarkerDelta, type DomainSummary, BioDomain } from './lab-domains'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EvidenceLedgerEntry {
  id: string
  createdAt: string
  labEventId: string

  claim: string
  claimType: 'prediction' | 'attribution' | 'recommendation' | 'observation'

  evidence: {
    markers: Array<{
      biomarkerKey: string
      value: number
      flag: BiomarkerFlag
      trend?: 'improving' | 'stable' | 'declining'
    }>
    protocols: Array<{
      protocolId: string
      protocolName: string
      adherencePercent: number
      daysOnProtocol: number
    }>
    wearableSignals?: Array<{
      metricType: string
      recentAvg: number
      trend: string
    }>
    timeWindow: {
      from: string
      to: string
    }
  }

  confounds: string[]
  confidence: 'high' | 'medium' | 'low' | 'speculative'
  strengthScore: number

  prediction?: {
    marker: string
    expectedDirection: 'increase' | 'decrease' | 'stable'
    expectedRange?: { min: number; max: number }
    timeframe: string
    falsifiedBy?: string
    verifiedBy?: string
    outcome?: 'confirmed' | 'partially_confirmed' | 'falsified' | 'inconclusive' | 'pending'
    outcomeExplanation?: string
  }
}

export interface PredictionAccuracy {
  totalPredictions: number
  confirmed: number
  partiallyConfirmed: number
  falsified: number
  inconclusive: number
  pending: number
  accuracyPercent: number
}

// ─── Prediction Verification ────────────────────────────────────────────────

/**
 * Verify pending predictions against new lab data.
 * Returns updated ledger entries with outcomes filled in.
 */
export function verifyPendingPredictions(
  pendingEntries: EvidenceLedgerEntry[],
  currentBiomarkers: Map<string, { value: number; flag: BiomarkerFlag }>,
  currentLabEventId: string
): EvidenceLedgerEntry[] {
  return pendingEntries.map(entry => {
    if (!entry.prediction || entry.prediction.outcome !== 'pending') return entry

    const pred = entry.prediction
    const current = currentBiomarkers.get(pred.marker)

    if (!current) {
      // Marker not in this lab panel — keep pending
      return entry
    }

    const prevMarker = entry.evidence.markers.find(m => m.biomarkerKey === pred.marker)
    if (!prevMarker) return entry

    const prevValue = prevMarker.value
    const currValue = current.value
    const actualDirection = currValue > prevValue ? 'increase' : currValue < prevValue ? 'decrease' : 'stable'
    const directionMatch = actualDirection === pred.expectedDirection

    let outcome: 'confirmed' | 'partially_confirmed' | 'falsified' | 'inconclusive' | 'pending'
    let outcomeExplanation: string

    if (directionMatch && pred.expectedRange) {
      if (currValue >= pred.expectedRange.min && currValue <= pred.expectedRange.max) {
        outcome = 'confirmed'
        outcomeExplanation = `${BIOMARKER_REGISTRY[pred.marker]?.displayName ?? pred.marker} moved to ${currValue}, within the predicted range of ${pred.expectedRange.min}–${pred.expectedRange.max}.`
      } else {
        outcome = 'partially_confirmed'
        outcomeExplanation = `Direction was correct (${actualDirection}), but value of ${currValue} was ${currValue < pred.expectedRange.min ? 'below' : 'above'} the expected range of ${pred.expectedRange.min}–${pred.expectedRange.max}.`
      }
    } else if (directionMatch) {
      outcome = 'confirmed'
      outcomeExplanation = `Predicted ${pred.expectedDirection}, actual: ${actualDirection}. ${BIOMARKER_REGISTRY[pred.marker]?.displayName ?? pred.marker}: ${prevValue} → ${currValue}.`
    } else if (actualDirection === 'stable' && pred.expectedDirection !== 'stable') {
      outcome = 'inconclusive'
      outcomeExplanation = `Predicted ${pred.expectedDirection}, but value remained essentially stable (${prevValue} → ${currValue}).`
    } else {
      outcome = 'falsified'
      outcomeExplanation = `Predicted ${pred.expectedDirection}, but value actually ${actualDirection}d (${prevValue} → ${currValue}).`
    }

    return {
      ...entry,
      prediction: {
        ...pred,
        outcome,
        outcomeExplanation,
        [outcome === 'falsified' ? 'falsifiedBy' : 'verifiedBy']: currentLabEventId,
      },
    }
  })
}

// ─── Generate New Ledger Entries ────────────────────────────────────────────

/**
 * Generate observation entries from significant marker deltas.
 */
export function generateObservationEntries(
  labEventId: string,
  deltas: MarkerDelta[],
  labDate: string
): EvidenceLedgerEntry[] {
  const entries: EvidenceLedgerEntry[] = []

  for (const delta of deltas.filter(d => d.isSignificant)) {
    const def = BIOMARKER_REGISTRY[delta.biomarkerKey]
    if (!def) continue

    const direction = delta.absoluteDelta > 0 ? 'increased' : 'decreased'
    const claim = `${def.displayName} ${direction} ${Math.abs(delta.percentDelta).toFixed(1)}% (${def.format(delta.previousValue)} → ${def.format(delta.currentValue)}).`

    entries.push({
      id: generateId(),
      createdAt: new Date().toISOString(),
      labEventId,
      claim,
      claimType: 'observation',
      evidence: {
        markers: [{
          biomarkerKey: delta.biomarkerKey,
          value: delta.currentValue,
          flag: delta.currentFlag,
          trend: delta.flagTransition === 'improved' ? 'improving' : delta.flagTransition === 'worsened' ? 'declining' : 'stable',
        }],
        protocols: [],
        timeWindow: { from: labDate, to: labDate },
      },
      confounds: [],
      confidence: Math.abs(delta.percentDelta) >= 15 ? 'high' : 'medium',
      strengthScore: Math.min(1, Math.abs(delta.percentDelta) / 30),
    })
  }

  return entries
}

/**
 * Generate attribution entries connecting protocol adherence to marker changes.
 */
export function generateAttributionEntries(
  labEventId: string,
  deltas: MarkerDelta[],
  protocols: Array<{
    id: string
    name: string
    type: string
    adherencePercent: number
    daysOnProtocol: number
    startDate: string
    expectedMarkers: string[]
  }>,
  labDate: string,
  previousLabDate: string
): EvidenceLedgerEntry[] {
  const entries: EvidenceLedgerEntry[] = []
  const deltaMap = new Map(deltas.map(d => [d.biomarkerKey, d]))

  for (const protocol of protocols) {
    if (protocol.daysOnProtocol < 30 || protocol.adherencePercent < 30) continue

    const affectedDeltas = protocol.expectedMarkers
      .map(key => deltaMap.get(key))
      .filter((d): d is MarkerDelta => d !== undefined && d.isSignificant)

    if (affectedDeltas.length === 0) continue

    for (const delta of affectedDeltas) {
      const def = BIOMARKER_REGISTRY[delta.biomarkerKey]
      if (!def) continue

      const direction = delta.absoluteDelta > 0 ? 'increased' : 'decreased'
      const claim = `${def.displayName} ${direction} ${Math.abs(delta.percentDelta).toFixed(1)}%. Likely attribution: ${protocol.name} (${protocol.adherencePercent}% adherence, ${protocol.daysOnProtocol} days).`

      const confounds: string[] = []
      if (protocol.adherencePercent < 70) confounds.push('Low adherence may limit observed effect')
      if (protocol.daysOnProtocol < 60) confounds.push('Short time on protocol — effect may not be fully realized')

      // Confidence based on adherence + duration + signal strength
      let confidence: EvidenceLedgerEntry['confidence'] = 'speculative'
      if (protocol.adherencePercent >= 80 && protocol.daysOnProtocol >= 90 && Math.abs(delta.percentDelta) >= 15) {
        confidence = 'high'
      } else if (protocol.adherencePercent >= 70 && protocol.daysOnProtocol >= 60) {
        confidence = 'medium'
      } else if (protocol.adherencePercent >= 50 && protocol.daysOnProtocol >= 30) {
        confidence = 'low'
      }

      entries.push({
        id: generateId(),
        createdAt: new Date().toISOString(),
        labEventId,
        claim,
        claimType: 'attribution',
        evidence: {
          markers: [{
            biomarkerKey: delta.biomarkerKey,
            value: delta.currentValue,
            flag: delta.currentFlag,
          }],
          protocols: [{
            protocolId: protocol.id,
            protocolName: protocol.name,
            adherencePercent: protocol.adherencePercent,
            daysOnProtocol: protocol.daysOnProtocol,
          }],
          timeWindow: { from: previousLabDate, to: labDate },
        },
        confounds,
        confidence,
        strengthScore: computeStrengthScore(protocol.adherencePercent, protocol.daysOnProtocol, Math.abs(delta.percentDelta)),
      })
    }
  }

  return entries
}

// ─── Prediction Accuracy ────────────────────────────────────────────────────

export function computePredictionAccuracy(allEntries: EvidenceLedgerEntry[]): PredictionAccuracy {
  const predictions = allEntries.filter(e => e.prediction)
  const confirmed = predictions.filter(e => e.prediction?.outcome === 'confirmed').length
  const partial = predictions.filter(e => e.prediction?.outcome === 'partially_confirmed').length
  const falsified = predictions.filter(e => e.prediction?.outcome === 'falsified').length
  const inconclusive = predictions.filter(e => e.prediction?.outcome === 'inconclusive').length
  const pending = predictions.filter(e => e.prediction?.outcome === 'pending').length

  const resolved = confirmed + partial + falsified
  const accuracyPercent = resolved > 0 ? Math.round(((confirmed + partial * 0.5) / resolved) * 100) : 0

  return {
    totalPredictions: predictions.length,
    confirmed,
    partiallyConfirmed: partial,
    falsified,
    inconclusive,
    pending,
    accuracyPercent,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `led_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function computeStrengthScore(adherencePercent: number, daysOnProtocol: number, percentDelta: number): number {
  const adherenceScore = Math.min(1, adherencePercent / 100)
  const durationScore = Math.min(1, daysOnProtocol / 120)
  const signalScore = Math.min(1, percentDelta / 25)
  return Math.round((adherenceScore * 0.3 + durationScore * 0.3 + signalScore * 0.4) * 100) / 100
}
