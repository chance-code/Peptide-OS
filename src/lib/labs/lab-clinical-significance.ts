// Clinical Significance Scoring Engine
// Weights biomarkers by consequence severity, actionability, rate of change, and interaction effects.
// Used by the Health Brain to prioritize narratives, actions, and notifications.

import {
  BIOMARKER_REGISTRY,
  computeZone,
  type BiomarkerFlag,
  type ClinicalSignificance,
} from '@/lib/lab-biomarker-contract'
import type { PersonalBaselineRecord } from '@/lib/health-personal-baselines'
import type { LabPattern } from '@/lib/labs/lab-analyzer'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClinicalWeight {
  biomarkerKey: string
  displayName: string
  severityWeight: number       // 0-10
  actionabilityWeight: number  // 0-10
  rateOfChangeWeight: number   // 0-10
  interactionWeight: number    // 0-10
  compositeScore: number       // weighted sum
  priorityTier: 'critical' | 'high' | 'medium' | 'low' | 'informational'
}

// ─── Actionability Tiers ────────────────────────────────────────────────────
// Higher = more actionable (can be changed through behavior, supplements, or medication)

const ACTIONABILITY_TIERS: Record<string, number> = {
  // Highly actionable (lifestyle + supplementation)
  vitamin_d: 9, magnesium: 9, omega_3_index: 9, zinc: 9, vitamin_b12: 8,
  ferritin: 8, iron: 8, folate: 8,
  // Highly actionable (diet + exercise)
  fasting_insulin: 9, fasting_glucose: 8, hba1c: 8, triglycerides: 8,
  homa_ir: 8, trig_hdl_ratio: 8,
  // Moderately actionable (medication + lifestyle)
  apolipoprotein_b: 7, ldl_cholesterol: 7, hdl_cholesterol: 6,
  total_cholesterol: 5, non_hdl_cholesterol: 6,
  hs_crp: 7, homocysteine: 7,
  // Moderately actionable (hormonal)
  total_testosterone: 6, free_testosterone: 6, estradiol: 5,
  tsh: 6, free_t3: 6, free_t4: 5, cortisol: 5, dhea_s: 6,
  // Less actionable (genetic or structural)
  lipoprotein_a: 2, // genetically determined
  egfr: 3, creatinine: 3,
}

// ─── Severity Mapping ───────────────────────────────────────────────────────

function clinicalSignificanceToWeight(cs: ClinicalSignificance): number {
  switch (cs) {
    case 'urgent': return 10
    case 'significant': return 7
    case 'notable': return 4
    case 'routine': return 1
  }
}

// ─── Core Scoring ───────────────────────────────────────────────────────────

/**
 * Score clinical significance for a set of biomarkers.
 * Returns weighted priority scores for narrative/notification ordering.
 */
export function scoreClinicalSignificance(
  biomarkers: Array<{ biomarkerKey: string; value: number; flag: BiomarkerFlag }>,
  personalBaselines?: PersonalBaselineRecord[],
  patterns?: LabPattern[]
): ClinicalWeight[] {
  const baselineMap = new Map<string, PersonalBaselineRecord>()
  if (personalBaselines) {
    for (const b of personalBaselines) {
      baselineMap.set(b.biomarkerKey, b)
    }
  }

  // Count pattern involvement per biomarker
  const patternInvolvement = new Map<string, number>()
  if (patterns) {
    for (const p of patterns) {
      if (!p.detected) continue
      for (const bm of p.involvedBiomarkers) {
        patternInvolvement.set(bm.key, (patternInvolvement.get(bm.key) ?? 0) + 1)
      }
    }
  }

  const results: ClinicalWeight[] = []

  for (const bm of biomarkers) {
    const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
    if (!def) continue

    const zone = computeZone(bm.biomarkerKey, bm.value)

    // 1. Severity weight (35%) — from zone's clinical significance
    const severityWeight = clinicalSignificanceToWeight(zone.clinicalSignificance)

    // 2. Actionability weight (25%) — from hardcoded tiers
    const actionabilityWeight = ACTIONABILITY_TIERS[bm.biomarkerKey] ?? 3

    // 3. Rate of change weight (25%) — from personal baselines
    let rateOfChangeWeight = 0
    const baseline = baselineMap.get(bm.biomarkerKey)
    if (baseline && baseline.isPrimary) {
      // Weight by trend direction relative to polarity
      if (baseline.trend === 'declining' && def.polarity === 'higher_better') {
        rateOfChangeWeight = Math.round(baseline.trendConfidence * 10)
      } else if (baseline.trend === 'declining' && def.polarity === 'lower_better') {
        // Declining for lower_better = improving, low weight
        rateOfChangeWeight = 1
      } else if (baseline.trend === 'improving' && def.polarity === 'lower_better') {
        // Improving for lower_better means value is going down = good
        rateOfChangeWeight = 1
      } else if (baseline.trend === 'improving' && def.polarity === 'higher_better') {
        rateOfChangeWeight = 1
      } else {
        rateOfChangeWeight = 2 // stable
      }
    }

    // 4. Interaction weight (15%) — count of patterns involving this biomarker
    const patternCount = patternInvolvement.get(bm.biomarkerKey) ?? 0
    const interactionWeight = Math.min(10, patternCount * 3)

    // Composite score: weighted sum
    const compositeScore = Math.round(
      (severityWeight * 0.35 +
       actionabilityWeight * 0.25 +
       rateOfChangeWeight * 0.25 +
       interactionWeight * 0.15) * 100
    ) / 100

    // Priority tier from composite
    let priorityTier: ClinicalWeight['priorityTier']
    if (compositeScore >= 7) priorityTier = 'critical'
    else if (compositeScore >= 5) priorityTier = 'high'
    else if (compositeScore >= 3) priorityTier = 'medium'
    else if (compositeScore >= 1.5) priorityTier = 'low'
    else priorityTier = 'informational'

    results.push({
      biomarkerKey: bm.biomarkerKey,
      displayName: def.displayName,
      severityWeight,
      actionabilityWeight,
      rateOfChangeWeight,
      interactionWeight,
      compositeScore,
      priorityTier,
    })
  }

  // Sort by composite score descending
  return results.sort((a, b) => b.compositeScore - a.compositeScore)
}

/**
 * Get the top N priority biomarkers from a scored list.
 */
export function getTopPriorityBiomarkers(
  weights: ClinicalWeight[],
  limit: number = 5
): ClinicalWeight[] {
  return weights.slice(0, limit)
}
