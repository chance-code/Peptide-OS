// Lab Trajectory Engine — Expected Trajectory Predictions
// Predicts the expected direction and magnitude for markers at the next quarter
// based on current trajectory, protocol adherence, and known pharmacology.

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, type BiomarkerFlag, computeFlag } from '@/lib/lab-biomarker-contract'
import { computeTrajectory, adjustTrajectoryForPolarity } from './lab-longitudinal'
import { type MarkerDelta, type BiomarkerPoint, getDomainForBiomarker, BioDomain } from './lab-domains'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrajectoryPrediction {
  biomarkerKey: string
  displayName: string
  currentValue: number
  expectedDirection: 'increase' | 'decrease' | 'stable' | 'unknown'
  expectedRange?: { min: number; max: number }
  confidenceBasis: string[]
  status: 'ahead_of_expected' | 'on_track' | 'behind_expected' | 'unknown'
  statusExplanation: string
  whatWouldIncreaseConfidence: string
}

// ─── Known Dose-Response Expectations ───────────────────────────────────────

// Maps peptide/supplement canonical names to expected biomarker effects
// These are conservative estimates based on published literature
interface DoseResponseCurve {
  biomarkerKey: string
  expectedDirection: 'increase' | 'decrease'
  typicalEffectPercent: { min: number; max: number } // % change over 90 days at >80% adherence
  minDaysForEffect: number
  minAdherencePercent: number
  basis: string
}

const KNOWN_DOSE_RESPONSE: Record<string, DoseResponseCurve[]> = {
  // Supplements (matched to Peptide.name lowercase)
  'vitamin d': [
    { biomarkerKey: 'vitamin_d', expectedDirection: 'increase', typicalEffectPercent: { min: 30, max: 80 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'Vitamin D3 supplementation typically raises 25-OH-D over 90 days — your provider can help determine appropriate dosing' },
  ],
  'vitamin d3': [
    { biomarkerKey: 'vitamin_d', expectedDirection: 'increase', typicalEffectPercent: { min: 30, max: 80 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'Vitamin D3 supplementation typically raises 25-OH-D over 90 days — your provider can help determine appropriate dosing' },
  ],
  'fish oil': [
    { biomarkerKey: 'triglycerides', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 30 }, minDaysForEffect: 60, minAdherencePercent: 80, basis: 'EPA/DHA supplementation may reduce triglycerides 15-30% over 8-12 weeks — your provider can help determine appropriate dosing' },
    { biomarkerKey: 'hs_crp', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 25 }, minDaysForEffect: 90, minAdherencePercent: 80, basis: 'Omega-3 supplementation may reduce hs-CRP over 3 months' },
    { biomarkerKey: 'omega_3_index', expectedDirection: 'increase', typicalEffectPercent: { min: 20, max: 60 }, minDaysForEffect: 90, minAdherencePercent: 80, basis: 'EPA/DHA supplementation increases omega-3 index over 3 months' },
  ],
  'omega-3': [
    { biomarkerKey: 'triglycerides', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 30 }, minDaysForEffect: 60, minAdherencePercent: 80, basis: 'EPA/DHA supplementation may reduce triglycerides 15-30% over 8-12 weeks — your provider can help determine appropriate dosing' },
    { biomarkerKey: 'hs_crp', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 25 }, minDaysForEffect: 90, minAdherencePercent: 80, basis: 'Omega-3 supplementation may reduce hs-CRP over 3 months' },
  ],
  'magnesium': [
    { biomarkerKey: 'magnesium', expectedDirection: 'increase', typicalEffectPercent: { min: 5, max: 15 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'Magnesium supplementation may improve serum Mg over 60 days — your provider can help determine appropriate dosing' },
    { biomarkerKey: 'rbc_magnesium', expectedDirection: 'increase', typicalEffectPercent: { min: 5, max: 15 }, minDaysForEffect: 90, minAdherencePercent: 70, basis: 'RBC magnesium responds more slowly than serum — 90+ days' },
  ],
  'berberine': [
    { biomarkerKey: 'hba1c', expectedDirection: 'decrease', typicalEffectPercent: { min: 5, max: 15 }, minDaysForEffect: 90, minAdherencePercent: 80, basis: 'Berberine supplementation may reduce HbA1c over 3 months — your provider can help determine appropriate dosing' },
    { biomarkerKey: 'fasting_glucose', expectedDirection: 'decrease', typicalEffectPercent: { min: 5, max: 20 }, minDaysForEffect: 60, minAdherencePercent: 80, basis: 'Berberine improves fasting glucose via AMPK activation' },
    { biomarkerKey: 'ldl_cholesterol', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 25 }, minDaysForEffect: 90, minAdherencePercent: 80, basis: 'Berberine reduces LDL via upregulation of LDL receptors' },
  ],
  'nac': [
    { biomarkerKey: 'alt', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 30 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'NAC supports glutathione production, reducing hepatic oxidative stress' },
    { biomarkerKey: 'ggt', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 25 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'NAC reduces GGT via glutathione pathway support' },
  ],
  'iron': [
    { biomarkerKey: 'ferritin', expectedDirection: 'increase', typicalEffectPercent: { min: 20, max: 60 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'Iron supplementation raises ferritin 10-30 ng/mL over 60 days' },
    { biomarkerKey: 'hemoglobin', expectedDirection: 'increase', typicalEffectPercent: { min: 5, max: 15 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'Iron supplementation improves hemoglobin over 6-8 weeks' },
  ],
  'b12': [
    { biomarkerKey: 'vitamin_b12', expectedDirection: 'increase', typicalEffectPercent: { min: 30, max: 100 }, minDaysForEffect: 60, minAdherencePercent: 70, basis: 'Methylcobalamin supplementation raises B12 levels significantly over 60 days' },
    { biomarkerKey: 'homocysteine', expectedDirection: 'decrease', typicalEffectPercent: { min: 10, max: 30 }, minDaysForEffect: 90, minAdherencePercent: 70, basis: 'B12 + folate reduce homocysteine via methylation pathway support' },
  ],
  // Peptides
  'bpc-157': [
    { biomarkerKey: 'hs_crp', expectedDirection: 'decrease', typicalEffectPercent: { min: 5, max: 20 }, minDaysForEffect: 60, minAdherencePercent: 80, basis: 'BPC-157 has anti-inflammatory properties that may reduce hs-CRP' },
  ],
  'thymosin alpha-1': [
    { biomarkerKey: 'wbc', expectedDirection: 'increase', typicalEffectPercent: { min: 5, max: 15 }, minDaysForEffect: 60, minAdherencePercent: 80, basis: 'Thymosin alpha-1 stimulates immune cell maturation' },
  ],
}

// ─── Prediction Generation ──────────────────────────────────────────────────

/**
 * Generate trajectory predictions for the next quarter.
 * Combines linear trend with protocol-based pharmacological expectations.
 */
export function generateTrajectoryPredictions(
  currentBiomarkers: BiomarkerPoint[],
  historicalPoints: Map<string, Array<{ date: Date; value: number }>>,
  activeProtocols: Array<{
    name: string
    type: string
    adherencePercent: number
    daysOnProtocol: number
  }>
): TrajectoryPrediction[] {
  const predictions: TrajectoryPrediction[] = []

  for (const biomarker of currentBiomarkers) {
    const def = BIOMARKER_REGISTRY[biomarker.biomarkerKey]
    if (!def) continue

    const history = historicalPoints.get(biomarker.biomarkerKey) ?? []
    const prediction = generateSinglePrediction(biomarker, history, activeProtocols, def)
    if (prediction) predictions.push(prediction)
  }

  // Sort: predictions with expectedRange first, then by confidence
  return predictions.sort((a, b) => {
    if (a.expectedRange && !b.expectedRange) return -1
    if (!a.expectedRange && b.expectedRange) return 1
    return b.confidenceBasis.length - a.confidenceBasis.length
  })
}

function generateSinglePrediction(
  biomarker: BiomarkerPoint,
  history: Array<{ date: Date; value: number }>,
  activeProtocols: Array<{ name: string; type: string; adherencePercent: number; daysOnProtocol: number }>,
  def: typeof BIOMARKER_REGISTRY[string]
): TrajectoryPrediction | null {
  const confidenceBasis: string[] = []

  // 1. Compute trend-based prediction (if ≥2 data points)
  let trendDirection: 'increase' | 'decrease' | 'stable' | 'unknown' = 'unknown'
  let trendVelocity = 0

  if (history.length >= 2) {
    const { trajectory, velocityPerMonth } = computeTrajectory(history)
    const adjusted = adjustTrajectoryForPolarity(trajectory, def.polarity)
    trendVelocity = velocityPerMonth
    trendDirection = velocityPerMonth > 0 ? 'increase' : velocityPerMonth < 0 ? 'decrease' : 'stable'
    if (Math.abs(velocityPerMonth) < 0.01) trendDirection = 'stable'
    confidenceBasis.push(`${history.length} prior data points`)
  }

  // 2. Check for protocol-based expectations
  const protocolExpectations: DoseResponseCurve[] = []
  for (const protocol of activeProtocols) {
    const name = protocol.name.toLowerCase()
    // Check all known dose-response entries
    for (const [drugName, curves] of Object.entries(KNOWN_DOSE_RESPONSE)) {
      if (name.includes(drugName)) {
        const matching = curves.filter(c =>
          c.biomarkerKey === biomarker.biomarkerKey &&
          protocol.daysOnProtocol >= c.minDaysForEffect &&
          protocol.adherencePercent >= c.minAdherencePercent
        )
        protocolExpectations.push(...matching)

        for (const curve of matching) {
          confidenceBasis.push(`${protocol.name} at ${protocol.adherencePercent}% adherence for ${protocol.daysOnProtocol} days`)
          confidenceBasis.push(curve.basis)
        }
      }
    }
  }

  // If no data at all, return null (not even a basic prediction)
  if (history.length < 2 && protocolExpectations.length === 0) {
    return null
  }

  // 3. Combine predictions
  let expectedDirection: TrajectoryPrediction['expectedDirection'] = trendDirection
  let expectedRange: { min: number; max: number } | undefined

  if (protocolExpectations.length > 0) {
    // Protocol-based prediction takes priority
    const primary = protocolExpectations[0]
    expectedDirection = primary.expectedDirection

    // Compute expected range based on dose-response
    const currentValue = biomarker.value
    const minEffect = currentValue * (primary.typicalEffectPercent.min / 100)
    const maxEffect = currentValue * (primary.typicalEffectPercent.max / 100)

    if (primary.expectedDirection === 'increase') {
      expectedRange = {
        min: Math.round((currentValue + minEffect) * 100) / 100,
        max: Math.round((currentValue + maxEffect) * 100) / 100,
      }
    } else {
      expectedRange = {
        min: Math.round((currentValue - maxEffect) * 100) / 100,
        max: Math.round((currentValue - minEffect) * 100) / 100,
      }
    }
  } else if (history.length >= 2 && trendDirection !== 'stable') {
    // Trend-only prediction: 3-month projection based on velocity
    const projected = biomarker.value + trendVelocity * 3
    const margin = Math.abs(trendVelocity * 1.5) // ±1.5 months of velocity as margin
    expectedRange = {
      min: Math.round((projected - margin) * 100) / 100,
      max: Math.round((projected + margin) * 100) / 100,
    }
    confidenceBasis.push('Linear projection based on current trend')
  }

  // 4. Determine status relative to expectation
  let status: TrajectoryPrediction['status'] = 'unknown'
  let statusExplanation = ''

  if (protocolExpectations.length > 0 && history.length >= 2) {
    // Compare actual trend vs expected direction
    if (trendDirection === expectedDirection) {
      status = 'on_track'
      statusExplanation = `Trend aligns with expected protocol effect (${expectedDirection}).`
    } else if (trendDirection === 'stable') {
      status = 'behind_expected'
      statusExplanation = `Expected ${expectedDirection} based on protocol, but marker is currently stable.`
    } else {
      status = 'behind_expected'
      statusExplanation = `Expected ${expectedDirection}, but marker is trending ${trendDirection}.`
    }
  } else if (history.length >= 2) {
    status = trendDirection === 'stable' ? 'on_track' : 'on_track'
    statusExplanation = `Based on trend alone: ${trendDirection === 'stable' ? 'stable trajectory' : `trending ${trendDirection}`}.`
  }

  // 5. What would increase confidence
  const whatWouldHelp: string[] = []
  if (history.length < 3) whatWouldHelp.push('more lab events')
  if (protocolExpectations.length === 0 && activeProtocols.length === 0) {
    whatWouldHelp.push('an active protocol targeting this marker')
  }
  if (protocolExpectations.length > 0) {
    const protocol = activeProtocols.find(p => {
      const name = p.name.toLowerCase()
      return Object.keys(KNOWN_DOSE_RESPONSE).some(d => name.includes(d))
    })
    if (protocol && protocol.adherencePercent < 80) {
      whatWouldHelp.push('higher protocol adherence (currently ' + protocol.adherencePercent + '%)')
    }
  }

  return {
    biomarkerKey: biomarker.biomarkerKey,
    displayName: def.displayName,
    currentValue: biomarker.value,
    expectedDirection,
    expectedRange,
    confidenceBasis,
    status,
    statusExplanation,
    whatWouldIncreaseConfidence: whatWouldHelp.join(', ') || 'Current data is sufficient for this prediction',
  }
}
