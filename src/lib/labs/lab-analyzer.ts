// Lab Analyzer — Cross-Biomarker Pattern Recognition Engine
// Detects clinically significant patterns across multiple biomarkers

import {
  BIOMARKER_REGISTRY,
  computeFlag,
  computeZone,
  type BiomarkerFlag,
} from '@/lib/lab-biomarker-contract'
import { computeHomaIR, computeTrigHDLRatio, computeFreeT3RT3Ratio } from './lab-validator'

// ─── Types ──────────────────────────────────────────────────────────────────

export type PatternSeverity = 'info' | 'attention' | 'action' | 'urgent'

export interface InvolvedBiomarker {
  key: string
  displayName: string
  value: number
  unit: string
  flag: BiomarkerFlag
  role: 'primary_driver' | 'supporting' | 'confirming'
  contribution: string
}

export interface LabPattern {
  patternKey: string
  patternName: string
  description: string
  severity: PatternSeverity
  involvedBiomarkers: InvolvedBiomarker[]
  insight: string
  mechanismExplanation: string
  recommendations: string[]
  confidence: number       // 0-1
  detected: boolean
}

// ─── Helper ─────────────────────────────────────────────────────────────────

type BiomarkerMap = Record<string, { value: number; unit: string; flag: BiomarkerFlag }>

function getVal(map: BiomarkerMap, key: string): number | undefined {
  return map[key]?.value
}

function has(map: BiomarkerMap, key: string): boolean {
  return key in map
}

function involved(
  map: BiomarkerMap,
  key: string,
  role: InvolvedBiomarker['role'],
  contribution: string
): InvolvedBiomarker | null {
  const entry = map[key]
  if (!entry) return null
  const def = BIOMARKER_REGISTRY[key]
  return {
    key,
    displayName: def?.displayName ?? key,
    value: entry.value,
    unit: entry.unit,
    flag: entry.flag,
    role,
    contribution,
  }
}

// ─── Dual-Threshold Evaluation ──────────────────────────────────────────────

interface DualResult {
  /** Exceeds standard clinical reference range */
  clinical: boolean
  /** Exceeds tighter longevity-optimized threshold */
  longevity: boolean
  /** Zone score from sigmoid scoring (0-100) */
  score: number
}

/**
 * Evaluate a biomarker against both clinical (reference range) and
 * longevity-optimized thresholds. Returns null if the marker is missing.
 *
 * direction: 'high' means we flag when value > threshold
 *            'low' means we flag when value < threshold
 */
function evaluateDual(
  map: BiomarkerMap,
  key: string,
  longevityThreshold: number,
  direction: 'high' | 'low',
): DualResult | null {
  const entry = map[key]
  if (!entry) return null
  const { value } = entry
  const def = BIOMARKER_REGISTRY[key]
  const zone = computeZone(key, value)
  const ref = def?.referenceRange

  let clinical = false
  if (ref) {
    clinical = direction === 'high' ? value > ref.max : value < ref.min
  }

  const longevity = direction === 'high'
    ? value > longevityThreshold
    : value < longevityThreshold

  return { clinical, longevity, score: zone.score }
}

// ─── Pattern Detectors ──────────────────────────────────────────────────────

function detectInsulinResistance(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'insulin_resistance_constellation',
    patternName: 'Metabolic Optimization Signal',
    description: 'Metabolic markers suggest room for insulin sensitivity optimization',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const glucose = getVal(map, 'fasting_glucose')
  const insulin = getVal(map, 'fasting_insulin')
  const triglycerides = getVal(map, 'triglycerides')
  const hdl = getVal(map, 'hdl_cholesterol')
  const hba1c = getVal(map, 'hba1c')

  // Dual thresholds: clinical (reference range) vs longevity-optimized
  const insulinD = evaluateDual(map, 'fasting_insulin', 6, 'high')
  const glucoseD = evaluateDual(map, 'fasting_glucose', 95, 'high')
  const trigD = evaluateDual(map, 'triglycerides', 100, 'high')
  const hdlD = evaluateDual(map, 'hdl_cholesterol', 50, 'low')
  const hba1cD = evaluateDual(map, 'hba1c', 5.4, 'high')

  const duals = [insulinD, glucoseD, trigD, hdlD, hba1cD].filter(Boolean) as DualResult[]
  const clinicalCount = duals.filter(d => d.clinical).length
  const longevityCount = duals.filter(d => d.longevity).length
  const totalPossible = duals.length

  // Build involved biomarkers for any that cross longevity thresholds
  if (insulinD?.longevity && insulin !== undefined) {
    const label = insulinD.clinical
      ? `Fasting insulin of ${insulin.toFixed(1)} µIU/mL is above the reference range`
      : `Fasting insulin of ${insulin.toFixed(1)} µIU/mL is above the longevity-optimized threshold of 6 µIU/mL`
    pattern.involvedBiomarkers.push(involved(map, 'fasting_insulin', 'primary_driver', label)!)
  }
  if (glucoseD?.longevity && glucose !== undefined) {
    const label = glucoseD.clinical
      ? `Fasting glucose of ${Math.round(glucose)} mg/dL is above the reference range (65–99)`
      : `Fasting glucose of ${Math.round(glucose)} mg/dL — longevity research suggests <95 mg/dL`
    pattern.involvedBiomarkers.push(involved(map, 'fasting_glucose', 'supporting', label)!)
  }
  if (trigD?.longevity && triglycerides !== undefined) {
    const label = trigD.clinical
      ? `Triglycerides of ${Math.round(triglycerides)} mg/dL are above the reference range (0–149)`
      : `Triglycerides of ${Math.round(triglycerides)} mg/dL — optimal is generally considered <100 mg/dL`
    pattern.involvedBiomarkers.push(involved(map, 'triglycerides', 'supporting', label)!)
  }
  if (hdlD?.longevity && hdl !== undefined) {
    const label = hdlD.clinical
      ? `HDL of ${Math.round(hdl)} mg/dL is below the reference range`
      : `HDL of ${Math.round(hdl)} mg/dL — longevity-optimized target is >50 mg/dL`
    pattern.involvedBiomarkers.push(involved(map, 'hdl_cholesterol', 'supporting', label)!)
  }
  if (hba1cD?.longevity && hba1c !== undefined) {
    const label = hba1cD.clinical
      ? `HbA1c of ${hba1c.toFixed(1)}% is above the reference range (4.0–5.6%)`
      : `HbA1c of ${hba1c.toFixed(1)}% — longevity research suggests <5.4% is optimal`
    pattern.involvedBiomarkers.push(involved(map, 'hba1c', 'confirming', label)!)
  }

  // Compute derived ratios
  let homaIR: number | undefined
  if (glucose !== undefined && insulin !== undefined) {
    const homaResult = computeHomaIR(glucose, insulin)
    if (homaResult) homaIR = homaResult.value
  }
  const trigHDL = computeTrigHDLRatio(triglycerides, hdl)

  // Detect: 3+ longevity signals or 2+ clinical signals
  if ((longevityCount >= 3 && totalPossible >= 3) || (clinicalCount >= 2 && totalPossible >= 2)) {
    pattern.detected = true
    pattern.confidence = Math.min(0.95, 0.4 + (longevityCount / Math.max(1, totalPossible)) * 0.5)

    // Severity: clinical signals → action/attention; longevity-only → info
    if (clinicalCount >= 3) pattern.severity = 'action'
    else if (clinicalCount >= 2) pattern.severity = 'attention'
    else pattern.severity = 'info'

    const homaStr = homaIR !== undefined ? ` HOMA-IR calculates to ${homaIR.toFixed(2)}.` : ''
    const trigHDLStr = trigHDL ? ` Triglyceride/HDL ratio is ${trigHDL.value.toFixed(1)}.` : ''

    if (clinicalCount >= 2) {
      pattern.insight = `Multiple metabolic markers are outside their reference ranges, which together may reflect reduced insulin sensitivity.${homaStr}${trigHDLStr} This is worth discussing with your provider to determine if further evaluation is appropriate.`
    } else {
      pattern.insight = `While within standard reference ranges, several metabolic markers are above longevity-optimized thresholds.${homaStr}${trigHDLStr} Optimization in this area may support long-term metabolic health.`
    }

    pattern.mechanismExplanation = 'Insulin resistance occurs when cells become less responsive to insulin signaling. The pancreas compensates by producing more insulin, which can drive triglyceride synthesis and lower HDL. The triglyceride/HDL ratio >2.0 is considered an early indicator by some clinicians. These markers should be interpreted in clinical context with your provider.'

    pattern.recommendations = [
      'Discuss these markers with your provider to determine if further metabolic testing is warranted',
      'Regular exercise and balanced nutrition support healthy insulin sensitivity',
      'Prioritize consistent sleep — sleep quality influences metabolic health',
    ]
  }

  return pattern
}

function detectSubclinicalHypothyroidism(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'subclinical_hypothyroidism',
    patternName: 'Thyroid Optimization Opportunity',
    description: 'Thyroid markers suggest room for optimization',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const tsh = getVal(map, 'tsh')
  const freeT3 = getVal(map, 'free_t3')
  const freeT4 = getVal(map, 'free_t4')
  const reverseT3 = getVal(map, 'reverse_t3')
  const tpo = getVal(map, 'tpo_antibodies')

  // Dual thresholds
  const tshD = evaluateDual(map, 'tsh', 2.5, 'high')
  const freeT3D = evaluateDual(map, 'free_t3', 3.0, 'low')
  const rT3D = evaluateDual(map, 'reverse_t3', 20, 'high')

  let clinicalCount = 0
  let longevityCount = 0

  if (tshD?.clinical) clinicalCount++
  if (tshD?.longevity) {
    longevityCount++
    const label = tshD.clinical
      ? `TSH of ${tsh!.toFixed(2)} mIU/L is above the reference range (0.45–4.5)`
      : `TSH of ${tsh!.toFixed(2)} mIU/L — longevity-optimized target is <2.5 mIU/L`
    pattern.involvedBiomarkers.push(involved(map, 'tsh', 'primary_driver', label)!)
  }

  if (freeT3D?.clinical) clinicalCount++
  if (freeT3D?.longevity) {
    longevityCount++
    const label = freeT3D.clinical
      ? `Free T3 of ${freeT3!.toFixed(1)} pg/mL is below the reference range (2.0–4.4)`
      : `Free T3 of ${freeT3!.toFixed(1)} pg/mL — optimal conversion target is >3.0 pg/mL`
    pattern.involvedBiomarkers.push(involved(map, 'free_t3', 'supporting', label)!)
  }

  if (rT3D?.clinical) clinicalCount++
  if (rT3D?.longevity) {
    longevityCount++
    const label = rT3D.clinical
      ? `Reverse T3 of ${reverseT3!.toFixed(1)} ng/dL is above the reference range (9.2–24.1)`
      : `Reverse T3 of ${reverseT3!.toFixed(1)} ng/dL — optimal is generally <20 ng/dL`
    pattern.involvedBiomarkers.push(involved(map, 'reverse_t3', 'supporting', label)!)
  }

  // Check T3/RT3 ratio
  if (freeT3 !== undefined && reverseT3 !== undefined) {
    const ratio = computeFreeT3RT3Ratio(freeT3, reverseT3)
    if (ratio && ratio.value < 0.2) longevityCount++
  }

  if (tpo !== undefined && tpo > 9) {
    clinicalCount++
    longevityCount++
    pattern.involvedBiomarkers.push(involved(map, 'tpo_antibodies', 'confirming', `Elevated TPO antibodies (${tpo.toFixed(0)} IU/mL) suggest autoimmune thyroid involvement`)!)
  }

  if (longevityCount >= 2 || clinicalCount >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.5 + longevityCount * 0.12)

    if (tpo !== undefined && tpo > 9) pattern.severity = 'action'
    else if (clinicalCount >= 2) pattern.severity = 'attention'
    else pattern.severity = 'info'

    if (clinicalCount >= 2) {
      pattern.insight = 'Your thyroid markers indicate values outside the standard reference range, which may reflect reduced thyroid function. This is worth evaluating with your provider, especially if you experience fatigue, unexplained weight changes, or cold intolerance.'
    } else {
      pattern.insight = 'While within standard reference ranges, your thyroid markers suggest room for optimization. Some practitioners target tighter thyroid ranges to support energy and metabolism.'
    }

    pattern.mechanismExplanation = 'The pituitary gland increases TSH production when it senses insufficient thyroid hormone. Elevated Reverse T3 occurs when the body preferentially converts T4 to the inactive form — sometimes triggered by stress, caloric restriction, or inflammation.'

    pattern.recommendations = [
      'Discuss these thyroid markers with your provider — an endocrinologist can provide a comprehensive evaluation',
      'If antibody testing has not been done, it can help determine if an autoimmune component is present',
      'Selenium and zinc are cofactors for thyroid hormone conversion and may be worth discussing with your provider',
    ]
  }

  return pattern
}

function detectCardiovascularRisk(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'cardiovascular_risk_beyond_ldl',
    patternName: 'Cardiovascular Longevity Signal',
    description: 'Advanced lipid markers suggest cardiovascular optimization opportunities',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const apoB = getVal(map, 'apolipoprotein_b')
  const lpa = getVal(map, 'lipoprotein_a')
  const ldlP = getVal(map, 'ldl_particle_number')
  const hsCRP = getVal(map, 'hs_crp')
  const homocysteine = getVal(map, 'homocysteine')
  const ldl = getVal(map, 'ldl_cholesterol')

  // Dual thresholds
  const apoBD = evaluateDual(map, 'apolipoprotein_b', 80, 'high')
  const ldlPD = evaluateDual(map, 'ldl_particle_number', 1000, 'high')
  const crpD = evaluateDual(map, 'hs_crp', 1.0, 'high')
  const hcyD = evaluateDual(map, 'homocysteine', 9, 'high')

  let clinicalCount = 0
  let longevityCount = 0

  if (apoBD?.longevity && apoB !== undefined) {
    longevityCount++
    if (apoBD.clinical) clinicalCount++
    const label = apoBD.clinical
      ? `ApoB of ${Math.round(apoB)} mg/dL is above the reference range (<130)`
      : `ApoB of ${Math.round(apoB)} mg/dL — longevity-optimized target is <80 mg/dL`
    pattern.involvedBiomarkers.push(involved(map, 'apolipoprotein_b', 'primary_driver', label)!)
  }

  // ApoB/LDL-C discordance check
  if (apoB !== undefined && ldl !== undefined) {
    const expectedApoB = ldl * 0.8  // rough concordance
    if (apoB > expectedApoB * 1.2) {
      pattern.involvedBiomarkers.push(involved(map, 'apolipoprotein_b', 'supporting',
        `ApoB is discordantly high relative to LDL-C — particle number exceeds what cholesterol content suggests`)!)
    }
  }

  if (lpa !== undefined && lpa > 75) {
    longevityCount++
    clinicalCount++
    pattern.involvedBiomarkers.push(involved(map, 'lipoprotein_a', 'primary_driver', `Lp(a) of ${Math.round(lpa)} nmol/L is above the risk threshold — this is genetically determined`)!)
  }

  if (ldlPD?.longevity && ldlP !== undefined) {
    longevityCount++
    if (ldlPD.clinical) clinicalCount++
    const label = ldlPD.clinical
      ? `LDL particle number of ${Math.round(ldlP)} nmol/L is above the reference range`
      : `LDL particle number of ${Math.round(ldlP)} nmol/L — longevity target is <1000 nmol/L`
    pattern.involvedBiomarkers.push(involved(map, 'ldl_particle_number', 'supporting', label)!)
  }

  if (crpD?.longevity && hsCRP !== undefined) {
    longevityCount++
    if (crpD.clinical) clinicalCount++
    const label = crpD.clinical
      ? `hs-CRP of ${hsCRP.toFixed(2)} mg/L is above the reference range (>3.0)`
      : `hs-CRP of ${hsCRP.toFixed(2)} mg/L — cardiovascular longevity target is <1.0 mg/L`
    pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'supporting', label)!)
  }

  if (hcyD?.longevity && homocysteine !== undefined) {
    longevityCount++
    if (hcyD.clinical) clinicalCount++
    const label = hcyD.clinical
      ? `Homocysteine of ${homocysteine.toFixed(1)} µmol/L is above the reference range (0–15)`
      : `Homocysteine of ${homocysteine.toFixed(1)} µmol/L — longevity target is <9 µmol/L`
    pattern.involvedBiomarkers.push(involved(map, 'homocysteine', 'confirming', label)!)
  }

  if (longevityCount >= 2 || clinicalCount >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.95, 0.5 + longevityCount * 0.12)

    if ((lpa !== undefined && lpa > 75) || clinicalCount >= 3) pattern.severity = 'action'
    else if (clinicalCount >= 2) pattern.severity = 'attention'
    else pattern.severity = 'info'

    if (clinicalCount >= 2) {
      pattern.insight = 'Your advanced lipid markers show values outside reference ranges that may indicate elevated cardiovascular risk. These markers provide additional context beyond a standard cholesterol panel and are worth reviewing with your provider.'
    } else {
      pattern.insight = 'While within standard reference ranges, your advanced lipid markers suggest opportunities for cardiovascular longevity optimization. Longevity-focused practitioners often target tighter thresholds for these markers.'
    }

    pattern.mechanismExplanation = 'ApoB represents the total number of atherogenic particles (LDL, VLDL, IDL, Lp(a)). Lp(a) is genetically determined and is an independent risk factor. hs-CRP reflects systemic inflammation that can amplify vascular risk. These markers are increasingly used in cardiovascular risk stratification.'

    pattern.recommendations = [
      'Review these advanced lipid markers with a cardiologist or lipidologist for personalized risk assessment',
      'If Lp(a) is elevated, your provider may recommend more aggressive management of modifiable risk factors',
      'If homocysteine is elevated, methylfolate and B12 supplementation can be discussed with your provider',
    ]
  }

  return pattern
}

function detectInflammationCascade(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'inflammation_cascade',
    patternName: 'Inflammatory Balance Signal',
    description: 'Inflammatory markers suggest opportunities for balance optimization',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const hsCRP = getVal(map, 'hs_crp')
  const esr = getVal(map, 'esr')
  const ferritin = getVal(map, 'ferritin')
  const homocysteine = getVal(map, 'homocysteine')

  let signals = 0

  if (hsCRP !== undefined && hsCRP > 3.0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'primary_driver', `hs-CRP of ${hsCRP.toFixed(2)} mg/L is above the reference range (0–3.0)`)!)
  }

  if (esr !== undefined && esr > 20) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'esr', 'supporting', `ESR of ${Math.round(esr)} mm/hr is above the reference range (0–20)`)!)
  }

  if (ferritin !== undefined && ferritin > 300) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'supporting', `Ferritin of ${ferritin.toFixed(0)} ng/mL is significantly elevated — ferritin can be elevated by inflammation (it's an acute phase reactant)`)!)
  }

  if (homocysteine !== undefined && homocysteine > 15) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'homocysteine', 'confirming', `Homocysteine of ${homocysteine.toFixed(1)} µmol/L is above the reference range (0–15)`)!)
  }

  // Context-aware gating: require ≥2 concordant markers to reduce false positives
  // Single elevated hs-CRP alone is likely acute (infection, exercise, etc.)
  if (signals >= 2) {
    pattern.detected = true

    const isAcute = hsCRP !== undefined && hsCRP > 5.0

    // Context gating: if hs-CRP is the only elevated marker among inflammatory set,
    // note it may be acute and reduce confidence
    const isIsolatedCRP = signals === 1 && hsCRP !== undefined && hsCRP > 3.0
    if (isIsolatedCRP) {
      // Should not reach here (signals >= 2 required), but guard anyway
      pattern.detected = false
      return pattern
    }

    // Check for hs-CRP biological variation context
    const crpCV = BIOMARKER_REGISTRY['hs_crp']?.biologicalVariation?.withinSubjectCV
    let crpNote = ''
    if (crpCV && crpCV > 30 && hsCRP !== undefined && hsCRP < 5.0) {
      crpNote = ' Note: hs-CRP has high biological variation (>40% within-subject) — a single reading should be confirmed with a repeat test.'
    }

    pattern.confidence = Math.min(0.9, 0.45 + signals * 0.15)
    pattern.severity = isAcute ? 'action' : signals >= 3 ? 'attention' : 'info'

    pattern.insight = isAcute
      ? 'Your hs-CRP is significantly elevated (>5.0 mg/L), which often indicates an acute process such as a recent infection, injury, or illness. Consider retesting in 2-4 weeks once any acute cause has resolved.'
      : `Multiple inflammatory markers are above their reference ranges. This may reflect chronic inflammation and is worth discussing with your provider to identify potential underlying causes.${crpNote}`

    pattern.mechanismExplanation = 'hs-CRP is produced by the liver in response to inflammatory cytokines. It is the most widely used marker of systemic inflammation. When ferritin is elevated alongside CRP, it typically reflects inflammation rather than iron overload, since ferritin is an acute phase reactant. ESR rises with inflammation as well. The clinical significance depends on context and should be evaluated by your provider.'

    pattern.recommendations = [
      'Discuss these inflammatory markers with your provider to investigate potential underlying causes',
      'Omega-3 fatty acids (EPA/DHA), adequate sleep (7-9 hours), and regular exercise all support healthy inflammatory balance',
      'If hs-CRP is persistently elevated, your provider may recommend additional workup',
    ]
  }

  return pattern
}

function detectNutrientDepletion(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'nutrient_depletion',
    patternName: 'Nutrient Optimization Opportunity',
    description: 'Multiple nutrient markers suggest optimization potential',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const vitD = getVal(map, 'vitamin_d')
  const b12 = getVal(map, 'vitamin_b12')
  const ferritin = getVal(map, 'ferritin')
  const omega3 = getVal(map, 'omega_3_index')
  const magnesium = getVal(map, 'magnesium') ?? getVal(map, 'rbc_magnesium')
  const zinc = getVal(map, 'zinc')

  // Dual thresholds
  const vitDD = evaluateDual(map, 'vitamin_d', 50, 'low')
  const b12D = evaluateDual(map, 'vitamin_b12', 500, 'low')
  const ferritinD = evaluateDual(map, 'ferritin', 75, 'low')
  const omega3D = evaluateDual(map, 'omega_3_index', 8, 'low')

  let clinicalCount = 0
  let longevityCount = 0

  if (vitDD?.longevity && vitD !== undefined) {
    longevityCount++
    if (vitDD.clinical) clinicalCount++
    const label = vitDD.clinical
      ? `Vitamin D of ${vitD.toFixed(0)} ng/mL is below the reference range (30–100)`
      : `Vitamin D of ${vitD.toFixed(0)} ng/mL — longevity-optimized target is >50 ng/mL`
    pattern.involvedBiomarkers.push(involved(map, 'vitamin_d', 'primary_driver', label)!)
  }

  if (b12D?.longevity && b12 !== undefined) {
    longevityCount++
    if (b12D.clinical) clinicalCount++
    const label = b12D.clinical
      ? `B12 of ${b12.toFixed(0)} pg/mL is below the reference range (232–1245)`
      : `B12 of ${b12.toFixed(0)} pg/mL — optimal neurological function target is >500 pg/mL`
    pattern.involvedBiomarkers.push(involved(map, 'vitamin_b12', 'supporting', label)!)
  }

  if (ferritinD?.longevity && ferritin !== undefined) {
    longevityCount++
    if (ferritinD.clinical) clinicalCount++
    const label = ferritinD.clinical
      ? `Ferritin of ${ferritin.toFixed(0)} ng/mL is below the reference range (30–400)`
      : `Ferritin of ${ferritin.toFixed(0)} ng/mL — optimal for energy and exercise is >75 ng/mL`
    pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'supporting', label)!)
  }

  if (omega3D?.longevity && omega3 !== undefined) {
    longevityCount++
    if (omega3D.clinical) clinicalCount++
    const label = omega3D.clinical
      ? `Omega-3 index of ${omega3.toFixed(1)}% is low`
      : `Omega-3 index of ${omega3.toFixed(1)}% — cardioprotective target is >8%`
    pattern.involvedBiomarkers.push(involved(map, 'omega_3_index', 'supporting', label)!)
  }

  if (magnesium !== undefined) {
    const mgKey = has(map, 'rbc_magnesium') ? 'rbc_magnesium' : 'magnesium'
    const mgLow = mgKey === 'rbc_magnesium' ? magnesium < 4.0 : magnesium < 1.6
    if (mgLow) {
      longevityCount++
      clinicalCount++
      pattern.involvedBiomarkers.push(involved(map, mgKey, 'supporting', `Magnesium is below the reference range`)!)
    }
  }

  if (zinc !== undefined && zinc < 56) {
    longevityCount++
    clinicalCount++
    pattern.involvedBiomarkers.push(involved(map, 'zinc', 'confirming', `Zinc of ${zinc.toFixed(0)} µg/dL is below the reference range (56–134)`)!)
  }

  if (longevityCount >= 3 || clinicalCount >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.4 + longevityCount * 0.1)

    if (clinicalCount >= 4) pattern.severity = 'action'
    else if (clinicalCount >= 2) pattern.severity = 'attention'
    else pattern.severity = 'info'

    if (clinicalCount >= 2) {
      pattern.insight = 'Multiple nutrient markers are below their reference ranges. Nutrient deficiencies can have wide-ranging effects on energy, immune function, and overall health. Discuss supplementation strategies with your provider.'
    } else {
      pattern.insight = 'While within standard reference ranges, several nutrient markers are below longevity-optimized levels. Targeted optimization may support energy, recovery, and long-term health.'
    }

    pattern.mechanismExplanation = 'Nutrient depletion can stem from dietary intake, absorption issues, increased demand from exercise or stress, or medication interactions. These nutrients serve as cofactors for many enzymatic reactions. Deficiencies are common and generally straightforward to address with targeted supplementation.'

    pattern.recommendations = [
      'Discuss targeted supplementation with your provider based on which nutrients are below optimal levels',
      'If supplementation does not improve levels after 3 months, consider evaluation for absorption issues',
      'Retest in 3 months to confirm levels are improving',
    ]
  }

  return pattern
}

function detectLiverStress(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'liver_stress',
    patternName: 'Hepatic Health Signal',
    description: 'Liver enzyme markers suggest monitoring opportunity',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const alt = getVal(map, 'alt')
  const ast = getVal(map, 'ast')
  const ggt = getVal(map, 'ggt')
  const ferritin = getVal(map, 'ferritin')

  // Dual thresholds: longevity-optimized ALT/AST <30, GGT <25
  const altD = evaluateDual(map, 'alt', 30, 'high')
  const astD = evaluateDual(map, 'ast', 30, 'high')
  const ggtD = evaluateDual(map, 'ggt', 25, 'high')

  let clinicalCount = 0
  let longevityCount = 0

  if (altD?.longevity && alt !== undefined) {
    longevityCount++
    if (altD.clinical) clinicalCount++
    const label = altD.clinical
      ? `ALT of ${Math.round(alt)} U/L is above the reference range (0–44) — ALT is liver-specific`
      : `ALT of ${Math.round(alt)} U/L — longevity-optimized target is <30 U/L`
    pattern.involvedBiomarkers.push(involved(map, 'alt', 'primary_driver', label)!)
  }

  if (astD?.longevity && ast !== undefined) {
    longevityCount++
    if (astD.clinical) clinicalCount++
    const label = astD.clinical
      ? `AST of ${Math.round(ast)} U/L is above the reference range (0–40) — note AST can also be elevated from intense exercise`
      : `AST of ${Math.round(ast)} U/L — longevity target is <30 U/L (note: exercise can elevate AST)`
    pattern.involvedBiomarkers.push(involved(map, 'ast', 'supporting', label)!)
  }

  if (ggtD?.longevity && ggt !== undefined) {
    longevityCount++
    if (ggtD.clinical) clinicalCount++
    const label = ggtD.clinical
      ? `GGT of ${Math.round(ggt)} U/L is above the reference range (0–65)`
      : `GGT of ${Math.round(ggt)} U/L — longevity-optimized target is <25 U/L`
    pattern.involvedBiomarkers.push(involved(map, 'ggt', 'primary_driver', label)!)
  }

  if (ferritin !== undefined && ferritin > 200) {
    longevityCount++
    pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'confirming', `Ferritin of ${ferritin.toFixed(0)} ng/mL — in the context of elevated liver enzymes, this may reflect hepatic inflammation`)!)
  }

  if (longevityCount >= 2 || clinicalCount >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.85, 0.4 + longevityCount * 0.15)

    if ((alt !== undefined && alt > 100) || (ggt !== undefined && ggt > 130)) pattern.severity = 'action'
    else if (clinicalCount >= 2) pattern.severity = 'attention'
    else pattern.severity = 'info'

    if (clinicalCount >= 2) {
      pattern.insight = 'Multiple liver enzyme markers are above their reference ranges. This may indicate hepatic stress and is worth evaluating with your provider. Common causes include fatty liver, medications, alcohol, or recent intense exercise (for AST).'
    } else {
      pattern.insight = 'While within standard reference ranges, your liver enzymes are above longevity-optimized thresholds. Research suggests lower enzyme levels correlate with better long-term liver health outcomes.'
    }

    pattern.mechanismExplanation = 'ALT is liver-specific and its elevation indicates hepatocyte stress. AST can come from both liver and muscle tissue. GGT is involved in glutathione metabolism and is a sensitive marker of liver health. Common causes of elevation include non-alcoholic fatty liver disease (NAFLD), alcohol, medications, viral hepatitis, or metabolic dysfunction.'

    pattern.recommendations = [
      'Discuss these results with your provider — they may recommend imaging or additional testing',
      'If you exercise intensely, AST elevation may be exercise-related rather than liver-related',
      'Reducing alcohol and processed food intake supports liver health',
    ]
  }

  return pattern
}

function detectHormonalImbalanceMale(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'hormonal_imbalance_male',
    patternName: 'Hormonal Optimization Opportunity',
    description: 'Testosterone-estradiol-SHBG balance suggests optimization potential',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const freeT = getVal(map, 'free_testosterone')
  const estradiol = getVal(map, 'estradiol')
  const shbg = getVal(map, 'shbg')
  const totalT = getVal(map, 'total_testosterone')

  // Dual thresholds: longevity targets for male hormones
  const freeTD = evaluateDual(map, 'free_testosterone', 15, 'low')
  const totalTD = evaluateDual(map, 'total_testosterone', 600, 'low')
  const estradiolD = evaluateDual(map, 'estradiol', 40, 'high')

  let clinicalCount = 0
  let longevityCount = 0

  if (freeTD?.longevity && freeT !== undefined) {
    longevityCount++
    if (freeTD.clinical) clinicalCount++
    const label = freeTD.clinical
      ? `Free testosterone of ${freeT.toFixed(1)} pg/mL is below the reference range (5.0–21.0)`
      : `Free testosterone of ${freeT.toFixed(1)} pg/mL — optimization target is >15 pg/mL`
    pattern.involvedBiomarkers.push(involved(map, 'free_testosterone', 'primary_driver', label)!)
  }

  if (estradiolD?.longevity && estradiol !== undefined) {
    longevityCount++
    if (estradiolD.clinical) clinicalCount++
    const label = estradiolD.clinical
      ? `Estradiol of ${estradiol.toFixed(1)} pg/mL is above the reference range (7.6–42.6)`
      : `Estradiol of ${estradiol.toFixed(1)} pg/mL — optimal T/E2 balance target is <40 pg/mL`
    pattern.involvedBiomarkers.push(involved(map, 'estradiol', 'supporting', label)!)
  }

  if (shbg !== undefined && shbg > 55.9) {
    longevityCount++
    clinicalCount++
    pattern.involvedBiomarkers.push(involved(map, 'shbg', 'supporting', `SHBG of ${shbg.toFixed(1)} nmol/L is above the reference range (16.5–55.9)`)!)
  }

  if (totalTD?.longevity && totalT !== undefined) {
    longevityCount++
    if (totalTD.clinical) clinicalCount++
    const label = totalTD.clinical
      ? `Total testosterone of ${Math.round(totalT)} ng/dL is below the reference range (264–916)`
      : `Total testosterone of ${Math.round(totalT)} ng/dL — optimization target is >600 ng/dL`
    pattern.involvedBiomarkers.push(involved(map, 'total_testosterone', 'confirming', label)!)
  }

  if (longevityCount >= 2 || clinicalCount >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.85, 0.4 + longevityCount * 0.15)

    if (clinicalCount >= 3) pattern.severity = 'action'
    else if (clinicalCount >= 2) pattern.severity = 'attention'
    else pattern.severity = 'info'

    if (clinicalCount >= 2) {
      pattern.insight = 'Your hormonal markers show values outside reference ranges, which may indicate a hormonal imbalance worth evaluating. The balance between testosterone, estradiol, and SHBG influences many aspects of health.'
    } else {
      pattern.insight = 'While within standard reference ranges, your hormonal markers suggest room for optimization. Lifestyle factors and targeted interventions can support hormonal balance.'
    }

    pattern.mechanismExplanation = 'SHBG binds testosterone, reducing the bioavailable fraction. Aromatase enzyme converts testosterone to estradiol, and this conversion increases with adipose tissue. High SHBG can be influenced by liver function, thyroid status, and age. These markers should be interpreted together by a provider.'

    pattern.recommendations = [
      'Discuss these results with an endocrinologist or men\'s health specialist for a comprehensive evaluation',
      'Resistance training and adequate sleep support healthy hormone levels',
      'Body composition influences hormone balance — your provider can advise on a holistic approach',
    ]
  }

  return pattern
}

function detectThyroidMetabolicConnection(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'thyroid_metabolic_connection',
    patternName: 'Thyroid-Metabolic Link',
    description: 'Thyroid markers may be influencing lipid metabolism',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const tsh = getVal(map, 'tsh')
  const totalChol = getVal(map, 'total_cholesterol')
  const ldl = getVal(map, 'ldl_cholesterol')

  // Dual thresholds: longevity TSH >2.5, TC >200, LDL >100
  const tshD = evaluateDual(map, 'tsh', 2.5, 'high')
  const tcD = evaluateDual(map, 'total_cholesterol', 200, 'high')
  const ldlD = evaluateDual(map, 'ldl_cholesterol', 100, 'high')

  const tshElevated = tshD?.longevity
  const lipidsElevated = tcD?.longevity || ldlD?.longevity
  const clinicalTSH = tshD?.clinical
  const clinicalLipids = tcD?.clinical || ldlD?.clinical

  if (tshElevated && lipidsElevated) {
    pattern.detected = true

    if (clinicalTSH && clinicalLipids) {
      pattern.confidence = 0.75
      pattern.severity = 'attention'
    } else {
      pattern.confidence = 0.6
      pattern.severity = 'info'
    }

    if (tsh !== undefined) {
      const label = clinicalTSH
        ? `TSH of ${tsh.toFixed(2)} mIU/L is above the reference range`
        : `TSH of ${tsh.toFixed(2)} mIU/L — longevity target is <2.5 mIU/L`
      pattern.involvedBiomarkers.push(involved(map, 'tsh', 'primary_driver', label)!)
    }
    if (totalChol !== undefined && tcD?.longevity) {
      const label = tcD.clinical
        ? `Total cholesterol of ${Math.round(totalChol)} mg/dL is elevated and may have a thyroid component`
        : `Total cholesterol of ${Math.round(totalChol)} mg/dL — longevity target is <200 mg/dL`
      pattern.involvedBiomarkers.push(involved(map, 'total_cholesterol', 'supporting', label)!)
    }
    if (ldl !== undefined && ldlD?.longevity) {
      const label = ldlD.clinical
        ? `LDL of ${Math.round(ldl)} mg/dL is elevated — thyroid function influences LDL clearance`
        : `LDL of ${Math.round(ldl)} mg/dL — longevity target is <100 mg/dL; thyroid function influences clearance`
      pattern.involvedBiomarkers.push(involved(map, 'ldl_cholesterol', 'supporting', label)!)
    }

    if (clinicalTSH) {
      pattern.insight = 'Your elevated cholesterol may have a thyroid component. Hypothyroidism can slow LDL receptor expression, reducing clearance. Your provider may want to evaluate and address thyroid function as part of your lipid management plan.'
    } else {
      pattern.insight = 'Your TSH and lipid markers are both above longevity-optimized thresholds. Thyroid function influences LDL clearance, so optimizing thyroid health may also support lipid goals.'
    }

    pattern.mechanismExplanation = 'Thyroid hormone (T3) regulates LDL receptor expression in the liver. When T3 is insufficient, LDL clearance slows, which can elevate blood lipid levels. This is a recognized cause of secondary hyperlipidemia.'

    pattern.recommendations = [
      'Discuss the thyroid-lipid connection with your provider',
      'If thyroid function is addressed, retesting lipids afterward can help determine independent lipid status',
    ]
  }

  return pattern
}

function detectIronDysregulation(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'iron_dysregulation',
    patternName: 'Iron Balance Signal',
    description: 'Iron metabolism markers suggest monitoring or optimization',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const ferritin = getVal(map, 'ferritin')
  const iron = getVal(map, 'iron')
  const tibc = getVal(map, 'tibc')
  const tsat = getVal(map, 'transferrin_saturation')
  const hemoglobin = getVal(map, 'hemoglobin')
  const hsCRP = getVal(map, 'hs_crp')

  // Detect iron deficiency pattern
  const deficiencySignals: string[] = []
  if (ferritin !== undefined && ferritin < 30) deficiencySignals.push('low ferritin')
  if (iron !== undefined && iron < 38) deficiencySignals.push('low serum iron')
  if (tibc !== undefined && tibc > 450) deficiencySignals.push('elevated TIBC')
  if (tsat !== undefined && tsat < 15) deficiencySignals.push('low transferrin saturation')
  if (hemoglobin !== undefined && hemoglobin < 12.6) deficiencySignals.push('low hemoglobin')

  // Detect iron overload pattern
  const overloadSignals: string[] = []
  if (ferritin !== undefined && ferritin > 300) overloadSignals.push('high ferritin')
  if (tsat !== undefined && tsat > 45) overloadSignals.push('high transferrin saturation')
  if (iron !== undefined && iron > 170) overloadSignals.push('high serum iron')

  // Ferritin + CRP cross-check: if both high, likely inflammation not iron overload
  const inflammatoryFerritin = ferritin !== undefined && ferritin > 300 &&
    hsCRP !== undefined && hsCRP > 3.0 &&
    (tsat === undefined || tsat <= 45)

  if (deficiencySignals.length >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.5 + deficiencySignals.length * 0.1)
    pattern.severity = hemoglobin !== undefined && hemoglobin < 10 ? 'action' : 'attention'

    if (ferritin !== undefined && ferritin < 30) pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'primary_driver', `Ferritin of ${ferritin.toFixed(0)} ng/mL is below the reference range (30–400)`)!)
    if (iron !== undefined && iron < 38) pattern.involvedBiomarkers.push(involved(map, 'iron', 'supporting', `Serum iron of ${Math.round(iron)} µg/dL is below the reference range (38–169)`)!)
    if (tibc !== undefined && tibc > 450) pattern.involvedBiomarkers.push(involved(map, 'tibc', 'confirming', `TIBC of ${Math.round(tibc)} µg/dL is above the reference range`)!)
    if (hemoglobin !== undefined && hemoglobin < 12.6) pattern.involvedBiomarkers.push(involved(map, 'hemoglobin', 'confirming', `Hemoglobin of ${hemoglobin.toFixed(1)} g/dL is below the reference range (12.6–17.7)`)!)

    pattern.insight = 'Multiple iron-related markers are below their reference ranges, suggesting iron deficiency. This is a common and treatable condition that can affect energy and exercise capacity. Discuss with your provider.'

    pattern.mechanismExplanation = 'Iron deficiency progresses in stages: first, ferritin (storage iron) drops. Then serum iron falls while TIBC rises. Finally, hemoglobin drops. Low ferritin with elevated TIBC is the classic deficiency pattern. Common causes include dietary insufficiency, blood loss, or absorption issues.'

    pattern.recommendations = [
      'Iron supplementation may help — discuss with your provider, who can recommend the right form and dosing for you',
      'Your provider may want to investigate the underlying cause of iron depletion',
      'Retesting in 8-12 weeks would help confirm whether your current approach is working',
    ]
  } else if (inflammatoryFerritin) {
    // Ferritin high + CRP high + transferrin sat normal = inflammation, not iron overload
    pattern.detected = true
    pattern.confidence = 0.65
    pattern.severity = 'info'

    if (ferritin !== undefined) pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'primary_driver', `Ferritin of ${ferritin.toFixed(0)} ng/mL is elevated, but CRP is also elevated — likely reflects inflammation rather than iron overload`)!)
    if (hsCRP !== undefined) pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'confirming', `hs-CRP of ${hsCRP.toFixed(2)} mg/L — elevated ferritin in the context of inflammation is expected (ferritin is an acute phase reactant)`)!)

    pattern.insight = 'Your ferritin is elevated alongside inflammatory markers. This pattern typically reflects inflammation rather than true iron overload. Ferritin is an acute phase reactant — it rises during inflammation regardless of iron stores. Once the inflammatory process resolves, retesting can clarify your true iron status.'

    pattern.mechanismExplanation = 'Ferritin serves a dual role: it stores iron and acts as an acute phase reactant. During inflammation, the liver increases ferritin production. When ferritin is elevated but transferrin saturation is normal, inflammation is the more likely explanation. True iron overload typically shows both elevated ferritin AND elevated transferrin saturation.'

    pattern.recommendations = [
      'Address inflammation first — retesting ferritin once CRP normalizes will give a clearer picture of iron status',
      'Discuss these markers with your provider for proper interpretation in clinical context',
    ]
  } else if (overloadSignals.length >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.85, 0.5 + overloadSignals.length * 0.1)
    pattern.severity = 'action'

    if (ferritin !== undefined && ferritin > 300) pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'primary_driver', `Ferritin of ${ferritin.toFixed(0)} ng/mL is significantly elevated`)!)
    if (tsat !== undefined && tsat > 45) pattern.involvedBiomarkers.push(involved(map, 'transferrin_saturation', 'confirming', `Transferrin saturation of ${tsat.toFixed(0)}% confirms excessive iron loading`)!)

    pattern.insight = 'Your iron markers suggest iron overload, which is distinct from and opposite to iron deficiency. Excess iron generates free radicals via the Fenton reaction, causing oxidative damage to the liver, heart, and pancreas. This is worth discussing with your provider promptly.'

    pattern.mechanismExplanation = 'Iron overload occurs when iron intake exceeds the body\'s capacity to regulate it. The most common genetic cause is hereditary hemochromatosis (HFE gene mutations). Excess iron catalyzes free radical production through the Fenton reaction (Fe²⁺ + H₂O₂ → Fe³⁺ + OH• + OH⁻), causing oxidative damage. High ferritin with high transferrin saturation distinguishes true iron overload from inflammatory ferritin elevation.'

    pattern.recommendations = [
      'Discuss iron overload testing with your provider, including HFE gene testing for hereditary hemochromatosis',
      'Avoid iron supplements, iron-fortified foods, and vitamin C with meals (which enhances iron absorption)',
      'Therapeutic phlebotomy (blood donation) is the primary treatment — discuss with your provider',
    ]
  }

  return pattern
}

function detectAutoimmunePre(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'autoimmune_pre_signal',
    patternName: 'Immune Monitoring Signal',
    description: 'Immune markers suggest monitoring opportunity',
    severity: 'info',
    involvedBiomarkers: [],
    insight: '',
    mechanismExplanation: '',
    recommendations: [],
    confidence: 0,
    detected: false,
  }

  const ana = getVal(map, 'ana_screen')
  const tpo = getVal(map, 'tpo_antibodies')
  const hsCRP = getVal(map, 'hs_crp')
  const rf = getVal(map, 'rheumatoid_factor')
  const esr = getVal(map, 'esr')

  // Count autoantibody markers (primary concordant markers)
  let autoantibodyCount = 0
  let supportingCount = 0

  if (ana !== undefined && ana > 0) {
    autoantibodyCount++
    pattern.involvedBiomarkers.push(involved(map, 'ana_screen', 'primary_driver', 'ANA screen is positive — present in ~15% of the healthy population, but warrants context')!)
  }

  if (tpo !== undefined && tpo > 9) {
    autoantibodyCount++
    pattern.involvedBiomarkers.push(involved(map, 'tpo_antibodies', 'supporting', `TPO antibodies of ${tpo.toFixed(0)} IU/mL suggest thyroid-targeted autoimmunity`)!)
  }

  if (rf !== undefined && rf > 14) {
    autoantibodyCount++
    pattern.involvedBiomarkers.push(involved(map, 'rheumatoid_factor', 'supporting', `Rheumatoid factor of ${rf.toFixed(1)} IU/mL is elevated`)!)
  }

  if (hsCRP !== undefined && hsCRP > 1.0) {
    supportingCount++
    pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'confirming', `Elevated hs-CRP of ${hsCRP.toFixed(2)} mg/L supports an inflammatory/autoimmune process`)!)
  }

  if (esr !== undefined && esr > 15) {
    supportingCount++
    pattern.involvedBiomarkers.push(involved(map, 'esr', 'confirming', `ESR of ${Math.round(esr)} mm/hr supports systemic inflammation`)!)
  }

  // Require 2+ concordant autoantibody markers (not just ANA + inflammatory)
  // This prevents a single positive ANA + elevated CRP from triggering
  const totalSignals = autoantibodyCount + supportingCount
  if (autoantibodyCount >= 2 || (autoantibodyCount >= 1 && supportingCount >= 1 && totalSignals >= 3)) {
    pattern.detected = true
    pattern.confidence = Math.min(0.75, 0.3 + totalSignals * 0.12)
    pattern.severity = autoantibodyCount >= 3 ? 'attention' : 'info'

    pattern.insight = 'Some autoimmune-related markers are elevated. A positive ANA alone is common (found in ~15% of healthy people) and does not mean autoimmune disease is present. However, in combination with other markers, it may be worth monitoring over time with your provider.'

    pattern.mechanismExplanation = 'Autoantibodies (ANA, TPO, RF) can be found in healthy individuals. However, when multiple autoimmune markers are elevated alongside inflammatory markers, it may warrant monitoring. Clinical correlation with symptoms is essential for interpretation.'

    pattern.recommendations = [
      'Discuss these markers with your provider to determine if further evaluation is appropriate',
      'If you experience symptoms such as joint pain, fatigue, or skin changes, report them to your provider',
      'Periodic monitoring (annually or as your provider advises) can help track any changes',
    ]
  }

  return pattern
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Analyze a set of lab biomarkers for clinically significant cross-biomarker patterns.
 * @param biomarkers - Array of { biomarkerKey, value, unit, flag }
 * @returns Array of detected patterns with insights and recommendations
 */
export function analyzeLabPatterns(
  biomarkers: Array<{ biomarkerKey: string; value: number; unit: string; flag: BiomarkerFlag }>
): LabPattern[] {
  // Build a lookup map
  const map: BiomarkerMap = {}
  for (const b of biomarkers) {
    map[b.biomarkerKey] = { value: b.value, unit: b.unit, flag: b.flag }
  }

  // Run all pattern detectors
  const allPatterns = [
    detectInsulinResistance(map),
    detectSubclinicalHypothyroidism(map),
    detectCardiovascularRisk(map),
    detectInflammationCascade(map),
    detectNutrientDepletion(map),
    detectLiverStress(map),
    detectHormonalImbalanceMale(map),
    detectThyroidMetabolicConnection(map),
    detectIronDysregulation(map),
    detectAutoimmunePre(map),
  ]

  // Return only detected patterns, sorted by severity
  const severityOrder: Record<PatternSeverity, number> = { urgent: 0, action: 1, attention: 2, info: 3 }
  return allPatterns
    .filter(p => p.detected)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
