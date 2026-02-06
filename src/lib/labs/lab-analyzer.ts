// Lab Analyzer — Cross-Biomarker Pattern Recognition Engine
// Detects clinically significant patterns across multiple biomarkers

import {
  BIOMARKER_REGISTRY,
  computeFlag,
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

// ─── Pattern Detectors ──────────────────────────────────────────────────────

function detectInsulinResistance(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'insulin_resistance_constellation',
    patternName: 'Insulin Resistance Constellation',
    description: 'Multiple markers suggest impaired insulin sensitivity',
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

  let signals = 0
  let totalPossible = 0

  if (insulin !== undefined) {
    totalPossible++
    if (insulin > 5) {
      signals++
      pattern.involvedBiomarkers.push(involved(map, 'fasting_insulin', 'primary_driver', `Fasting insulin of ${insulin.toFixed(1)} µIU/mL suggests pancreatic compensation for resistance`)!)
    }
  }

  if (glucose !== undefined) {
    totalPossible++
    if (glucose > 85) {
      signals++
      pattern.involvedBiomarkers.push(involved(map, 'fasting_glucose', 'supporting', `Fasting glucose of ${Math.round(glucose)} mg/dL is above the optimal threshold`)!)
    }
  }

  if (triglycerides !== undefined) {
    totalPossible++
    if (triglycerides > 100) {
      signals++
      pattern.involvedBiomarkers.push(involved(map, 'triglycerides', 'supporting', `Triglycerides of ${Math.round(triglycerides)} mg/dL reflect impaired lipid metabolism`)!)
    }
  }

  if (hdl !== undefined) {
    totalPossible++
    if (hdl < 50) {
      signals++
      pattern.involvedBiomarkers.push(involved(map, 'hdl_cholesterol', 'supporting', `HDL of ${Math.round(hdl)} mg/dL is below the protective threshold`)!)
    }
  }

  if (hba1c !== undefined) {
    totalPossible++
    if (hba1c > 5.4) {
      signals++
      pattern.involvedBiomarkers.push(involved(map, 'hba1c', 'confirming', `HbA1c of ${hba1c.toFixed(1)}% reflects elevated average blood sugar`)!)
    }
  }

  // Compute HOMA-IR if we have both glucose and insulin
  let homaIR: number | undefined
  if (glucose !== undefined && insulin !== undefined) {
    const homaResult = computeHomaIR(glucose, insulin)
    if (homaResult) {
      homaIR = homaResult.value
    }
  }

  // Compute TG/HDL ratio
  const trigHDL = computeTrigHDLRatio(triglycerides, hdl)

  if (signals >= 2 && totalPossible >= 3) {
    pattern.detected = true
    pattern.confidence = Math.min(0.95, 0.4 + (signals / totalPossible) * 0.5)
    pattern.severity = signals >= 4 ? 'action' : signals >= 3 ? 'attention' : 'info'

    const homaStr = homaIR !== undefined ? ` HOMA-IR calculates to ${homaIR.toFixed(2)}.` : ''
    const trigHDLStr = trigHDL ? ` Triglyceride/HDL ratio is ${trigHDL.value.toFixed(1)}.` : ''

    pattern.insight = `Your metabolic markers form a pattern consistent with early insulin resistance.${homaStr}${trigHDLStr} Even when individual values appear "normal" by standard lab ranges, this combination warrants attention — it often precedes metabolic syndrome by years.`

    pattern.mechanismExplanation = 'Insulin resistance occurs when cells become less responsive to insulin signaling. The pancreas compensates by producing more insulin (hyperinsulinemia), which drives triglyceride synthesis, lowers HDL via increased CETP activity, and gradually elevates fasting glucose as compensatory mechanisms fail. The triglyceride/HDL ratio >2.0 is a particularly sensitive early marker, often appearing before glucose elevates.'

    pattern.recommendations = [
      'Consider discussing insulin sensitivity testing (oral glucose tolerance test with insulin) with your provider',
      'Time-restricted eating and resistance training are the most evidence-backed interventions for improving insulin sensitivity',
      'Prioritize sleep quality — even one night of poor sleep can reduce insulin sensitivity by 25-30%',
    ]
  }

  return pattern
}

function detectSubclinicalHypothyroidism(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'subclinical_hypothyroidism',
    patternName: 'Subclinical Hypothyroidism',
    description: 'Thyroid markers suggest suboptimal thyroid function despite "normal" labs',
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

  let signals = 0

  if (tsh !== undefined && tsh > 2.0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'tsh', 'primary_driver', `TSH of ${tsh.toFixed(2)} mIU/L is above the functional optimal range of 0.5–2.0`)!)
  }

  if (freeT3 !== undefined && freeT3 < 3.0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'free_t3', 'supporting', `Free T3 of ${freeT3.toFixed(1)} pg/mL is in the lower portion of the range`)!)
  }

  if (reverseT3 !== undefined && reverseT3 > 20) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'reverse_t3', 'supporting', `Reverse T3 of ${reverseT3.toFixed(1)} ng/dL suggests impaired T4-to-T3 conversion`)!)
  }

  // Check T3/RT3 ratio
  if (freeT3 !== undefined && reverseT3 !== undefined) {
    const ratio = computeFreeT3RT3Ratio(freeT3, reverseT3)
    if (ratio && ratio.value < 0.2) {
      signals++
    }
  }

  if (tpo !== undefined && tpo > 9) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'tpo_antibodies', 'confirming', `Elevated TPO antibodies (${tpo.toFixed(0)} IU/mL) suggest autoimmune thyroid involvement`)!)
  }

  if (signals >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.5 + signals * 0.12)
    pattern.severity = tpo !== undefined && tpo > 9 ? 'action' : signals >= 3 ? 'attention' : 'info'

    pattern.insight = 'Your thyroid markers suggest suboptimal function that standard reference ranges may classify as "normal." Many people with a TSH above 2.0 and a low-normal Free T3 experience fatigue, weight gain, and cold intolerance that improves with thyroid optimization.'

    pattern.mechanismExplanation = 'The pituitary gland increases TSH production when it senses insufficient thyroid hormone. A TSH above 2.0 represents early compensatory effort. Elevated Reverse T3 occurs when the body preferentially converts T4 to the inactive reverse T3 instead of active T3 — often triggered by stress, caloric restriction, or inflammation. This creates a functional hypothyroid state even when total hormone levels appear adequate.'

    pattern.recommendations = [
      'Consider a comprehensive thyroid evaluation with an endocrinologist, including antibody testing if not already done',
      'Selenium (200 µg/day) and zinc support T4-to-T3 conversion and may reduce TPO antibodies',
      'Address underlying stressors that can drive reverse T3 elevation: caloric deficit, chronic stress, sleep deprivation',
    ]
  }

  return pattern
}

function detectCardiovascularRisk(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'cardiovascular_risk_beyond_ldl',
    patternName: 'Advanced Cardiovascular Risk',
    description: 'Advanced lipid markers indicate cardiovascular risk beyond standard LDL',
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

  let signals = 0

  if (apoB !== undefined && apoB > 80) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'apolipoprotein_b', 'primary_driver', `ApoB of ${Math.round(apoB)} mg/dL indicates elevated atherogenic particle burden`)!)
  }

  if (lpa !== undefined && lpa > 75) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'lipoprotein_a', 'primary_driver', `Lp(a) of ${Math.round(lpa)} nmol/L is a genetically determined risk factor — this cannot be changed through lifestyle alone`)!)
  }

  if (ldlP !== undefined && ldlP > 1000) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ldl_particle_number', 'supporting', `LDL particle number of ${Math.round(ldlP)} nmol/L exceeds the optimal threshold`)!)
  }

  if (hsCRP !== undefined && hsCRP > 1.0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'supporting', `hs-CRP of ${hsCRP.toFixed(2)} mg/L indicates inflammatory burden amplifying vascular risk`)!)
  }

  if (homocysteine !== undefined && homocysteine > 10) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'homocysteine', 'confirming', `Homocysteine of ${homocysteine.toFixed(1)} µmol/L suggests methylation insufficiency contributing to endothelial damage`)!)
  }

  if (signals >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.95, 0.5 + signals * 0.12)
    pattern.severity = (lpa !== undefined && lpa > 75) || signals >= 4 ? 'action' : 'attention'

    pattern.insight = 'Your advanced lipid markers reveal cardiovascular risk that a standard cholesterol panel would miss. Standard LDL alone misses approximately 50% of cardiac events — these markers provide a more complete picture of your vascular risk.'

    pattern.mechanismExplanation = 'ApoB represents the total number of atherogenic particles (LDL, VLDL, IDL, Lp(a)) — each particle can enter the arterial wall and initiate plaque formation. Lp(a) is genetically determined and carries both a cholesterol payload and a prothrombotic component. When combined with systemic inflammation (elevated hs-CRP) and endothelial damage (elevated homocysteine), the atherosclerotic process accelerates significantly.'

    pattern.recommendations = [
      'Discuss these advanced markers with a cardiologist or lipidologist — standard guidelines may not adequately address elevated ApoB or Lp(a)',
      'If Lp(a) is elevated, aggressive LDL/ApoB reduction is recommended to offset the fixed genetic risk',
      'Methylfolate and B12 supplementation may address elevated homocysteine via the methylation pathway',
    ]
  }

  return pattern
}

function detectInflammationCascade(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'inflammation_cascade',
    patternName: 'Systemic Inflammation',
    description: 'Multiple inflammatory markers are elevated, suggesting chronic systemic inflammation',
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

  if (hsCRP !== undefined && hsCRP > 1.0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'primary_driver', `hs-CRP of ${hsCRP.toFixed(2)} mg/L indicates active systemic inflammation`)!)
  }

  if (esr !== undefined && esr > 10) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'esr', 'supporting', `ESR of ${Math.round(esr)} mm/hr supports the inflammatory picture`)!)
  }

  if (ferritin !== undefined && ferritin > 200) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'supporting', `Ferritin of ${ferritin.toFixed(0)} ng/mL — elevated ferritin can reflect inflammation (acute phase reactant) rather than true iron overload`)!)
  }

  if (homocysteine !== undefined && homocysteine > 10) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'homocysteine', 'confirming', `Homocysteine of ${homocysteine.toFixed(1)} µmol/L contributes to oxidative stress and vascular inflammation`)!)
  }

  if (signals >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.45 + signals * 0.15)
    const isAcute = hsCRP !== undefined && hsCRP > 5.0
    pattern.severity = isAcute ? 'action' : signals >= 3 ? 'attention' : 'info'

    pattern.insight = isAcute
      ? 'Your hs-CRP is significantly elevated, which may indicate an acute inflammatory process (recent infection, injury, or illness). Consider retesting in 2-4 weeks if you were recently ill.'
      : 'Multiple inflammatory markers are elevated, suggesting chronic low-grade systemic inflammation. This accelerates aging, impairs recovery, and increases disease risk across multiple domains.'

    pattern.mechanismExplanation = 'Chronic inflammation creates a self-reinforcing cycle: inflammatory cytokines impair mitochondrial function, disrupt gut barrier integrity, promote insulin resistance, and accelerate oxidative damage. hs-CRP (produced by the liver in response to IL-6) is the most sensitive marker. When ferritin is elevated alongside CRP, it typically reflects inflammation rather than iron overload — ferritin is an acute phase reactant.'

    pattern.recommendations = [
      'Identify and address root causes: gut health, food sensitivities, chronic infections, environmental toxins, excessive visceral fat',
      'Anti-inflammatory nutrition: omega-3 fatty acids (EPA/DHA), curcumin, and reducing refined carbohydrates and seed oils',
      'Ensure adequate sleep (7-9 hours) — sleep deprivation directly elevates inflammatory markers',
    ]
  }

  return pattern
}

function detectNutrientDepletion(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'nutrient_depletion',
    patternName: 'Nutrient Depletion Pattern',
    description: 'Multiple nutrient markers are below optimal, creating compounding deficiency',
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
  const folate = getVal(map, 'folate')

  let signals = 0

  if (vitD !== undefined && vitD < 40) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'vitamin_d', 'primary_driver', `Vitamin D of ${vitD.toFixed(0)} ng/mL is below the functional optimal threshold of 40-60`)!)
  }

  if (b12 !== undefined && b12 < 500) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'vitamin_b12', 'supporting', `B12 of ${b12.toFixed(0)} pg/mL — functional deficiency begins below 500 despite "normal" lab ranges`)!)
  }

  if (ferritin !== undefined && ferritin < 50) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'supporting', `Ferritin of ${ferritin.toFixed(0)} ng/mL indicates depleted iron stores`)!)
  }

  if (omega3 !== undefined && omega3 < 8) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'omega_3_index', 'supporting', `Omega-3 index of ${omega3.toFixed(1)}% is below the cardioprotective threshold of 8%`)!)
  }

  if (magnesium !== undefined) {
    const mgKey = has(map, 'rbc_magnesium') ? 'rbc_magnesium' : 'magnesium'
    const mgLow = mgKey === 'rbc_magnesium' ? magnesium < 5.0 : magnesium < 2.0
    if (mgLow) {
      signals++
      pattern.involvedBiomarkers.push(involved(map, mgKey, 'supporting', 'Magnesium is below optimal — a common deficiency that impacts sleep, recovery, and cardiac function')!)
    }
  }

  if (zinc !== undefined && zinc < 80) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'zinc', 'confirming', `Zinc of ${zinc.toFixed(0)} µg/dL is below the functional optimal range`)!)
  }

  if (signals >= 3) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.4 + signals * 0.1)
    pattern.severity = signals >= 5 ? 'action' : signals >= 4 ? 'attention' : 'info'

    pattern.insight = 'Multiple nutrient markers are below optimal levels. These deficiencies compound each other — B12 affects methylation which affects homocysteine which affects cardiovascular risk. Vitamin D impacts immune function, which interacts with inflammation markers. Addressing the nutrient foundation often improves multiple downstream markers simultaneously.'

    pattern.mechanismExplanation = 'Nutrient depletion typically stems from inadequate dietary intake, impaired absorption (gut dysfunction), increased demand (exercise, stress), or medication interactions. These nutrients are cofactors for hundreds of enzymatic reactions: magnesium alone is required for 300+ enzyme systems. Low omega-3 impairs cell membrane fluidity, reducing receptor sensitivity for hormones and neurotransmitters. Low ferritin limits oxygen delivery capacity even before anemia develops.'

    pattern.recommendations = [
      'Start with the most impactful deficiencies first: vitamin D (with K2 for calcium routing) and magnesium (glycinate or threonate form)',
      'Consider a comprehensive nutrient evaluation to identify absorption issues if supplementation does not improve levels',
      'Retest in 3 months to confirm levels are improving with supplementation',
    ]
  }

  return pattern
}

function detectLiverStress(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'liver_stress',
    patternName: 'Liver Stress Signal',
    description: 'Liver enzyme markers suggest hepatic stress',
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

  let signals = 0

  if (alt !== undefined && alt > 25) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'alt', 'primary_driver', `ALT of ${Math.round(alt)} U/L exceeds the optimal threshold — ALT is liver-specific`)!)
  }

  if (ast !== undefined && ast > 25) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ast', 'supporting', `AST of ${Math.round(ast)} U/L is elevated — note AST can also come from muscle damage`)!)
  }

  if (ggt !== undefined && ggt > 25) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ggt', 'primary_driver', `GGT of ${Math.round(ggt)} U/L is the most sensitive early marker of liver stress and oxidative burden`)!)
  }

  if (ferritin !== undefined && ferritin > 200) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'confirming', `Ferritin of ${ferritin.toFixed(0)} ng/mL — in the context of liver stress, this may reflect hepatic inflammation`)!)
  }

  if (signals >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.85, 0.4 + signals * 0.15)
    pattern.severity = (alt !== undefined && alt > 50) || (ggt !== undefined && ggt > 50) ? 'action' : 'attention'

    pattern.insight = 'Your liver enzymes suggest hepatic stress. GGT is often the earliest and most sensitive indicator — it reflects oxidative stress and phase II detoxification burden. When combined with elevated ALT, this pattern warrants investigation into root causes.'

    pattern.mechanismExplanation = 'GGT is a membrane-bound enzyme involved in glutathione metabolism. Its elevation reflects increased oxidative stress demand on the liver. ALT is liver-specific and its elevation indicates hepatocyte damage. Common causes include non-alcoholic fatty liver disease (NAFLD), alcohol, medications, viral hepatitis, or metabolic dysfunction. The combination of elevated GGT + ferritin often points to NAFLD or hepatic iron loading.'

    pattern.recommendations = [
      'Consider a liver ultrasound or FibroScan to assess for fatty liver disease',
      'Reduce alcohol consumption, fructose intake, and hepatotoxic medications if applicable',
      'N-Acetyl Cysteine (NAC) and milk thistle support glutathione production and liver detoxification',
    ]
  }

  return pattern
}

function detectHormonalImbalanceMale(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'hormonal_imbalance_male',
    patternName: 'Hormonal Imbalance',
    description: 'Testosterone-estradiol-SHBG balance is suboptimal',
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

  let signals = 0

  if (freeT !== undefined && freeT < 10) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'free_testosterone', 'primary_driver', `Free testosterone of ${freeT.toFixed(1)} pg/mL is below the functional optimal threshold`)!)
  }

  if (estradiol !== undefined && estradiol > 35) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'estradiol', 'supporting', `Estradiol of ${estradiol.toFixed(1)} pg/mL is elevated — the testosterone/estradiol ratio matters more than either alone`)!)
  }

  if (shbg !== undefined && shbg > 50) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'shbg', 'supporting', `SHBG of ${shbg.toFixed(1)} nmol/L is elevated, binding more testosterone and reducing bioavailable fraction`)!)
  }

  if (totalT !== undefined && totalT < 500) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'total_testosterone', 'confirming', `Total testosterone of ${Math.round(totalT)} ng/dL is below the functional optimal range`)!)
  }

  if (signals >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.85, 0.4 + signals * 0.15)
    pattern.severity = signals >= 3 ? 'action' : 'attention'

    pattern.insight = 'Your hormonal markers suggest a suboptimal testosterone-estradiol balance. The ratio between free testosterone and estradiol determines downstream effects more than absolute values. This pattern impacts body composition, recovery capacity, cognitive function, and metabolic health.'

    pattern.mechanismExplanation = 'When SHBG is elevated, it binds more testosterone, reducing the bioavailable fraction. Aromatase enzyme (concentrated in adipose tissue) converts testosterone to estradiol. This creates a feedback loop: low free testosterone → less muscle/more fat → more aromatase → more estradiol → further testosterone suppression. High SHBG can be driven by liver stress, thyroid dysfunction, or age.'

    pattern.recommendations = [
      'Consider a comprehensive hormonal evaluation with an endocrinologist or men\'s health specialist',
      'Resistance training and adequate sleep (7-9 hours) are the strongest natural testosterone optimizers',
      'Address body composition — reducing excess adipose tissue directly reduces aromatase-mediated estrogen conversion',
    ]
  }

  return pattern
}

function detectThyroidMetabolicConnection(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'thyroid_metabolic_connection',
    patternName: 'Thyroid-Metabolic Connection',
    description: 'Suboptimal thyroid function may be driving elevated cholesterol',
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

  if (tsh !== undefined && tsh > 2.0 && ((totalChol !== undefined && totalChol > 200) || (ldl !== undefined && ldl > 100))) {
    pattern.detected = true
    pattern.confidence = 0.7

    if (tsh > 2.0) pattern.involvedBiomarkers.push(involved(map, 'tsh', 'primary_driver', `TSH of ${tsh.toFixed(2)} mIU/L indicates suboptimal thyroid function`)!)
    if (totalChol !== undefined && totalChol > 200) pattern.involvedBiomarkers.push(involved(map, 'total_cholesterol', 'supporting', `Total cholesterol of ${Math.round(totalChol)} mg/dL may be thyroid-driven`)!)
    if (ldl !== undefined && ldl > 100) pattern.involvedBiomarkers.push(involved(map, 'ldl_cholesterol', 'supporting', `LDL of ${Math.round(ldl)} mg/dL may reflect slowed hepatic clearance from thyroid dysfunction`)!)

    pattern.severity = 'attention'
    pattern.insight = 'Your elevated cholesterol may have a thyroid component. Hypothyroidism slows LDL receptor expression on liver cells, reducing clearance and elevating blood levels. Optimizing thyroid function often improves lipid panels without requiring statins.'

    pattern.mechanismExplanation = 'Thyroid hormone (T3) directly regulates LDL receptor gene expression in hepatocytes. When T3 is insufficient, fewer LDL receptors are expressed on liver cell surfaces, slowing LDL particle clearance from the bloodstream. This is why subclinical hypothyroidism is a common and underdiagnosed cause of elevated LDL. Treating the thyroid dysfunction often normalizes lipids within 3-6 months.'

    pattern.recommendations = [
      'Discuss thyroid optimization with your provider before starting cholesterol-lowering medication',
      'Retest both thyroid and lipid panels after thyroid optimization to assess independent lipid status',
    ]
  }

  return pattern
}

function detectIronDysregulation(map: BiomarkerMap): LabPattern {
  const pattern: LabPattern = {
    patternKey: 'iron_dysregulation',
    patternName: 'Iron Dysregulation',
    description: 'Iron metabolism markers suggest either deficiency or overload',
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

  // Detect iron deficiency pattern
  const deficiencySignals: string[] = []
  if (ferritin !== undefined && ferritin < 50) deficiencySignals.push('low ferritin')
  if (iron !== undefined && iron < 60) deficiencySignals.push('low serum iron')
  if (tibc !== undefined && tibc > 370) deficiencySignals.push('elevated TIBC')
  if (tsat !== undefined && tsat < 20) deficiencySignals.push('low transferrin saturation')
  if (hemoglobin !== undefined && hemoglobin < 13) deficiencySignals.push('low hemoglobin')

  // Detect iron overload pattern
  const overloadSignals: string[] = []
  if (ferritin !== undefined && ferritin > 300) overloadSignals.push('high ferritin')
  if (tsat !== undefined && tsat > 45) overloadSignals.push('high transferrin saturation')
  if (iron !== undefined && iron > 170) overloadSignals.push('high serum iron')

  if (deficiencySignals.length >= 2) {
    pattern.detected = true
    pattern.confidence = Math.min(0.9, 0.5 + deficiencySignals.length * 0.1)
    pattern.severity = hemoglobin !== undefined && hemoglobin < 12 ? 'action' : 'attention'

    if (ferritin !== undefined) pattern.involvedBiomarkers.push(involved(map, 'ferritin', 'primary_driver', `Ferritin of ${ferritin.toFixed(0)} ng/mL indicates depleted iron stores`)!)
    if (iron !== undefined && iron < 60) pattern.involvedBiomarkers.push(involved(map, 'iron', 'supporting', `Serum iron of ${Math.round(iron)} µg/dL is below optimal`)!)
    if (tibc !== undefined && tibc > 370) pattern.involvedBiomarkers.push(involved(map, 'tibc', 'confirming', `Elevated TIBC of ${Math.round(tibc)} µg/dL confirms the body is actively seeking more iron`)!)
    if (hemoglobin !== undefined && hemoglobin < 13) pattern.involvedBiomarkers.push(involved(map, 'hemoglobin', 'confirming', `Hemoglobin of ${hemoglobin.toFixed(1)} g/dL — iron deficiency is impacting red blood cell production`)!)

    pattern.insight = 'Your iron markers form a deficiency pattern. Iron deficiency impacts energy, exercise capacity, and cognitive function — often before anemia develops. The heart compensates for reduced oxygen-carrying capacity by beating faster, which you may notice as an elevated resting heart rate.'

    pattern.mechanismExplanation = 'Iron deficiency progresses in stages: first, ferritin (storage iron) drops. Then serum iron falls while TIBC rises (the body upregulates iron transport capacity). Finally, hemoglobin drops as iron is insufficient for red blood cell production. Low ferritin with elevated TIBC is the classic deficiency pattern. Common causes include inadequate dietary iron, blood loss, celiac disease, or intense exercise (footstrike hemolysis in runners).'

    pattern.recommendations = [
      'Consider iron supplementation — iron bisglycinate is the best-tolerated form with good absorption',
      'Take iron with vitamin C on an empty stomach for optimal absorption; avoid coffee/tea within 2 hours',
      'Investigate underlying causes: GI blood loss, celiac disease, heavy menstruation, or intense endurance training',
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
    patternName: 'Autoimmune Pre-Signal',
    description: 'Early autoimmune markers detected — warrants monitoring',
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

  let signals = 0

  if (ana !== undefined && ana > 0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'ana_screen', 'primary_driver', 'ANA screen is positive — present in ~15% of the healthy population, but warrants context')!)
  }

  if (tpo !== undefined && tpo > 9) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'tpo_antibodies', 'supporting', `TPO antibodies of ${tpo.toFixed(0)} IU/mL suggest thyroid-targeted autoimmunity`)!)
  }

  if (rf !== undefined && rf > 14) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'rheumatoid_factor', 'supporting', `Rheumatoid factor of ${rf.toFixed(1)} IU/mL is elevated`)!)
  }

  if (hsCRP !== undefined && hsCRP > 1.0) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'hs_crp', 'confirming', `Elevated hs-CRP of ${hsCRP.toFixed(2)} mg/L supports an inflammatory/autoimmune process`)!)
  }

  if (esr !== undefined && esr > 15) {
    signals++
    pattern.involvedBiomarkers.push(involved(map, 'esr', 'confirming', `ESR of ${Math.round(esr)} mm/hr supports systemic inflammation`)!)
  }

  if (signals >= 2 && (ana !== undefined && ana > 0 || tpo !== undefined && tpo > 9)) {
    pattern.detected = true
    pattern.confidence = Math.min(0.75, 0.3 + signals * 0.12)
    pattern.severity = signals >= 3 ? 'attention' : 'info'

    pattern.insight = 'Your markers show early signs consistent with autoimmune activation. A positive ANA is common and does not mean you have autoimmune disease — but in combination with other markers, it suggests your immune system may be producing antibodies against your own tissues. This is worth tracking over time.'

    pattern.mechanismExplanation = 'Autoimmune conditions develop over years before clinical symptoms appear. Early markers include autoantibodies (ANA, TPO, RF) combined with elevated inflammatory markers. The concept of "pre-clinical autoimmunity" recognizes that these markers can predict disease 5-10 years before diagnosis. Environmental triggers (gut permeability, infections, toxins, stress) interact with genetic susceptibility to break immune tolerance.'

    pattern.recommendations = [
      'Increase monitoring frequency — retest autoimmune markers every 6 months to track trajectory',
      'Optimize gut health: gut permeability ("leaky gut") is implicated in triggering autoimmune cascades',
      'Discuss with a rheumatologist or immunologist if symptoms develop (joint pain, fatigue, skin changes)',
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
