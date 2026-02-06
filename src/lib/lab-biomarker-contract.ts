// Lab Biomarker Contract — Single Source of Truth
// Defines biomarker definitions, reference ranges, and normalization logic
// Foundation for the entire labs integration system

// ─── Types ──────────────────────────────────────────────────────────────────

export type BiomarkerCategory =
  | 'hormones_male'
  | 'hormones_female'
  | 'hormones_thyroid'
  | 'hormones_adrenal'
  | 'metabolic'
  | 'lipids'
  | 'vitamins'
  | 'minerals'
  | 'inflammation'
  | 'liver'
  | 'kidney'
  | 'blood_counts'
  | 'toxins'
  | 'autoimmunity'

export type HealthDomain =
  | 'sleep'
  | 'recovery'
  | 'energy'
  | 'body_composition'
  | 'cardiovascular'
  | 'cognitive'
  | 'immune'
  | 'hormonal'

export interface WearableCorrelation {
  metric: string                       // Arc metric type key: "hrv", "rhr", "deep_sleep"
  relationship: 'direct' | 'inverse' | 'modulating'
  mechanism: string                    // Human-readable explanation
}

export interface BiomarkerDefinition {
  key: string                          // Canonical name: "total_testosterone"
  displayName: string                  // "Total Testosterone"
  shortName?: string                   // For compact UI: "ApoB", "HbA1c", "hs-CRP"
  aliases: string[]                    // ["testosterone", "T", "Test Total"]
  category: BiomarkerCategory
  unit: string                         // "ng/dL"
  polarity: 'higher_better' | 'lower_better' | 'optimal_range' | 'categorical'
  optimalRange?: { min: number; optimal: number; max: number }
  referenceRange: { min: number; max: number }
  absoluteBounds?: { min: number; max: number }  // Parsing sanity check — outside = error
  criticalLow?: number                 // Below this = critical flag
  criticalHigh?: number                // Above this = critical flag
  unitAliases?: Record<string, number> // Conversion factors: { "mmol/L": 18.018 } means value * 18.018 → canonical
  healthDomains: HealthDomain[]        // ['hormonal', 'recovery']
  relatedMetrics?: string[]            // ['deep_sleep', 'hrv']
  wearableCorrelations?: WearableCorrelation[]
  sexSpecific?: boolean                // Different ranges for M/F
  format: (value: number) => string
}

export type BiomarkerFlag = 'low' | 'normal' | 'optimal' | 'high' | 'critical_low' | 'critical_high'

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtDefault(value: number): string {
  return value.toFixed(1)
}

function fmtInteger(value: number): string {
  return Math.round(value).toString()
}

function fmtPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtNgDL(value: number): string {
  return `${value.toFixed(0)} ng/dL`
}

function fmtPgML(value: number): string {
  return `${value.toFixed(1)} pg/mL`
}

function fmtNmolL(value: number): string {
  return `${value.toFixed(1)} nmol/L`
}

function fmtMIUML(value: number): string {
  return `${value.toFixed(2)} mIU/L`
}

function fmtMgDL(value: number): string {
  return `${value.toFixed(0)} mg/dL`
}

function fmtNgML(value: number): string {
  return `${value.toFixed(1)} ng/mL`
}

function fmtPgDL(value: number): string {
  return `${value.toFixed(1)} pg/dL`
}

function fmtUL(value: number): string {
  return `${value.toFixed(0)} U/L`
}

function fmtMgL(value: number): string {
  return `${value.toFixed(2)} mg/L`
}

function fmtUmolL(value: number): string {
  return `${value.toFixed(1)} umol/L`
}

function fmtUIU(value: number): string {
  return `${value.toFixed(1)} uIU/mL`
}

function fmtMlMinCr(value: number): string {
  return `${Math.round(value)} mL/min/1.73m2`
}

function fmtUgDL(value: number): string {
  return `${value.toFixed(0)} µg/dL`
}

function fmtUgL(value: number): string {
  return `${value.toFixed(1)} µg/L`
}

function fmtGDL(value: number): string {
  return `${value.toFixed(1)} g/dL`
}

function fmtMmHr(value: number): string {
  return `${Math.round(value)} mm/hr`
}

function fmtIUML(value: number): string {
  return `${value.toFixed(1)} IU/mL`
}

function fmtThousandUL(value: number): string {
  return `${value.toFixed(1)} 10³/µL`
}

function fmtMillionUL(value: number): string {
  return `${value.toFixed(2)} 10⁶/µL`
}

function fmtFL(value: number): string {
  return `${value.toFixed(1)} fL`
}

function fmtNmolLAlt(value: number): string {
  return `${Math.round(value)} nmol/L`
}

function fmtUgMLAlt(value: number): string {
  return `${value.toFixed(1)} µg/mL`
}

function fmtNmolLDecimal(value: number): string {
  return `${value.toFixed(1)} nmol/L`
}

// ─── Biomarker Registry ─────────────────────────────────────────────────────

export const BIOMARKER_REGISTRY: Record<string, BiomarkerDefinition> = {
  // ── Hormones - Male ───────────────────────────────────────────────────────
  total_testosterone: {
    key: 'total_testosterone',
    displayName: 'Total Testosterone',
    shortName: 'Total T',
    aliases: ['testosterone', 'T', 'Test Total', 'Total T', 'Testosterone, Total', 'Serum Testosterone'],
    category: 'hormones_male',
    unit: 'ng/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 600, optimal: 800, max: 1000 },
    referenceRange: { min: 264, max: 916 },
    absoluteBounds: { min: 0, max: 3000 },
    unitAliases: { 'nmol/L': 28.818 },
    sexSpecific: true,
    healthDomains: ['hormonal', 'energy', 'body_composition', 'recovery', 'cognitive'],
    relatedMetrics: ['deep_sleep', 'hrv', 'lean_body_mass', 'body_fat_percentage'],
    wearableCorrelations: [
      { metric: 'deep_sleep', relationship: 'direct', mechanism: 'Testosterone supports restorative sleep architecture and growth hormone release during deep sleep' },
      { metric: 'lean_body_mass', relationship: 'direct', mechanism: 'Testosterone directly drives muscle protein synthesis and lean mass accretion' },
    ],
    format: fmtNgDL,
  },
  free_testosterone: {
    key: 'free_testosterone',
    displayName: 'Free Testosterone',
    shortName: 'Free T',
    aliases: ['Free T', 'FT', 'Testosterone Free', 'Direct Free Testosterone'],
    category: 'hormones_male',
    unit: 'pg/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 15, optimal: 20, max: 25 },
    referenceRange: { min: 5.0, max: 21.0 },
    absoluteBounds: { min: 0, max: 100 },
    sexSpecific: true,
    healthDomains: ['hormonal', 'energy', 'body_composition', 'recovery'],
    relatedMetrics: ['deep_sleep', 'hrv', 'lean_body_mass'],
    format: fmtPgML,
  },
  estradiol: {
    key: 'estradiol',
    displayName: 'Estradiol',
    shortName: 'E2',
    aliases: ['E2', 'Estradiol E2', 'Oestradiol', 'Sensitive Estradiol'],
    category: 'hormones_male',
    unit: 'pg/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 20, optimal: 30, max: 40 },
    referenceRange: { min: 7.6, max: 42.6 },
    healthDomains: ['hormonal', 'cardiovascular', 'cognitive', 'body_composition'],
    relatedMetrics: ['body_fat_percentage', 'rhr'],
    format: fmtPgML,
  },
  shbg: {
    key: 'shbg',
    displayName: 'SHBG',
    shortName: 'SHBG',
    aliases: ['Sex Hormone Binding Globulin', 'Sex Hormone-Binding Globulin'],
    category: 'hormones_male',
    unit: 'nmol/L',
    polarity: 'optimal_range',
    optimalRange: { min: 20, optimal: 35, max: 50 },
    referenceRange: { min: 16.5, max: 55.9 },
    healthDomains: ['hormonal', 'body_composition'],
    relatedMetrics: ['body_fat_percentage'],
    format: fmtNmolL,
  },

  // ── Hormones - Thyroid ────────────────────────────────────────────────────
  tsh: {
    key: 'tsh',
    displayName: 'TSH',
    shortName: 'TSH',
    aliases: ['Thyroid Stimulating Hormone', 'Thyrotropin', 'TSH 3rd Generation'],
    category: 'hormones_thyroid',
    unit: 'mIU/L',
    polarity: 'optimal_range',
    optimalRange: { min: 0.5, optimal: 1.5, max: 2.5 },
    referenceRange: { min: 0.45, max: 4.5 },
    healthDomains: ['energy', 'body_composition', 'cognitive'],
    relatedMetrics: ['rhr', 'body_fat_percentage', 'weight'],
    format: fmtMIUML,
  },
  free_t3: {
    key: 'free_t3',
    displayName: 'Free T3',
    aliases: ['FT3', 'Triiodothyronine Free', 'Free Triiodothyronine', 'T3 Free', 'T3, Free'],
    category: 'hormones_thyroid',
    unit: 'pg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 3.0, optimal: 3.5, max: 4.0 },
    referenceRange: { min: 2.0, max: 4.4 },
    healthDomains: ['energy', 'body_composition', 'cognitive'],
    relatedMetrics: ['rhr', 'active_calories', 'body_fat_percentage'],
    format: fmtPgDL,
  },
  free_t4: {
    key: 'free_t4',
    displayName: 'Free T4',
    aliases: ['FT4', 'Thyroxine Free', 'Free Thyroxine', 'T4 Free', 'T4, Free'],
    category: 'hormones_thyroid',
    unit: 'ng/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 1.1, optimal: 1.3, max: 1.5 },
    referenceRange: { min: 0.82, max: 1.77 },
    healthDomains: ['energy', 'body_composition', 'cognitive'],
    relatedMetrics: ['rhr', 'body_fat_percentage'],
    format: (v) => `${v.toFixed(2)} ng/dL`,
  },

  // ── Hormones - Adrenal ────────────────────────────────────────────────────
  cortisol: {
    key: 'cortisol',
    displayName: 'Cortisol',
    aliases: ['Cortisol AM', 'Cortisol Morning', 'Serum Cortisol', 'Cortisol Total'],
    category: 'hormones_adrenal',
    unit: 'ug/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 10, optimal: 14, max: 18 },
    referenceRange: { min: 6.2, max: 19.4 },
    healthDomains: ['energy', 'recovery', 'sleep', 'immune'],
    relatedMetrics: ['hrv', 'deep_sleep', 'sleep_duration'],
    format: (v) => `${v.toFixed(1)} ug/dL`,
  },
  dhea_s: {
    key: 'dhea_s',
    displayName: 'DHEA-S',
    aliases: ['DHEA Sulfate', 'Dehydroepiandrosterone Sulfate', 'DHEAS'],
    category: 'hormones_adrenal',
    unit: 'ug/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 250, optimal: 350, max: 500 },
    referenceRange: { min: 88.9, max: 427 },
    healthDomains: ['hormonal', 'energy', 'immune', 'cognitive'],
    relatedMetrics: ['hrv', 'recovery_score'],
    format: (v) => `${v.toFixed(0)} ug/dL`,
  },

  // ── Metabolic ─────────────────────────────────────────────────────────────
  fasting_glucose: {
    key: 'fasting_glucose',
    displayName: 'Fasting Glucose',
    shortName: 'Glucose',
    aliases: ['Glucose', 'Blood Glucose', 'FBG', 'Fasting Blood Glucose', 'Glucose Fasting'],
    category: 'metabolic',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 70, optimal: 85, max: 95 },
    referenceRange: { min: 65, max: 99 },
    absoluteBounds: { min: 20, max: 600 },
    criticalLow: 40,
    criticalHigh: 400,
    unitAliases: { 'mmol/L': 18.018 },
    healthDomains: ['energy', 'body_composition', 'cardiovascular'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtMgDL,
  },
  hba1c: {
    key: 'hba1c',
    displayName: 'HbA1c',
    shortName: 'HbA1c',
    aliases: ['Hemoglobin A1c', 'A1C', 'Glycated Hemoglobin', 'Glycohemoglobin'],
    category: 'metabolic',
    unit: '%',
    polarity: 'lower_better',
    optimalRange: { min: 4.5, optimal: 5.0, max: 5.4 },
    referenceRange: { min: 4.0, max: 5.6 },
    absoluteBounds: { min: 3, max: 20 },
    criticalHigh: 10,
    // mmol/mol → %: (mmol_mol / 10.929) + 2.15
    healthDomains: ['body_composition', 'cardiovascular', 'energy'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtPercent,
  },
  fasting_insulin: {
    key: 'fasting_insulin',
    displayName: 'Fasting Insulin',
    shortName: 'Insulin',
    aliases: ['Insulin', 'Insulin Fasting', 'Serum Insulin'],
    category: 'metabolic',
    unit: 'uIU/mL',
    polarity: 'lower_better',
    optimalRange: { min: 2, optimal: 4, max: 6 },
    referenceRange: { min: 2.6, max: 24.9 },
    absoluteBounds: { min: 0, max: 300 },
    criticalHigh: 50,
    healthDomains: ['body_composition', 'energy', 'cardiovascular'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    wearableCorrelations: [
      { metric: 'hrv', relationship: 'inverse', mechanism: 'Hyperinsulinemia drives sympathetic dominance, suppressing parasympathetic tone and HRV' },
    ],
    format: fmtUIU,
  },

  // ── Lipids ────────────────────────────────────────────────────────────────
  total_cholesterol: {
    key: 'total_cholesterol',
    displayName: 'Total Cholesterol',
    shortName: 'TC',
    aliases: ['Cholesterol', 'TC', 'Cholesterol Total'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 150, optimal: 180, max: 200 },
    referenceRange: { min: 100, max: 199 },
    absoluteBounds: { min: 50, max: 600 },
    unitAliases: { 'mmol/L': 38.67 },
    healthDomains: ['cardiovascular', 'hormonal'],
    relatedMetrics: ['rhr', 'body_fat_percentage'],
    format: fmtMgDL,
  },
  ldl_cholesterol: {
    key: 'ldl_cholesterol',
    displayName: 'LDL Cholesterol',
    shortName: 'LDL',
    aliases: ['LDL', 'LDL-C', 'Low Density Lipoprotein', 'LDL Direct', 'LDL Cholesterol Calc'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'lower_better',
    optimalRange: { min: 50, optimal: 70, max: 100 },
    referenceRange: { min: 0, max: 99 },
    absoluteBounds: { min: 0, max: 500 },
    unitAliases: { 'mmol/L': 38.67 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr', 'body_fat_percentage'],
    format: fmtMgDL,
  },
  hdl_cholesterol: {
    key: 'hdl_cholesterol',
    displayName: 'HDL Cholesterol',
    shortName: 'HDL',
    aliases: ['HDL', 'HDL-C', 'High Density Lipoprotein'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'higher_better',
    optimalRange: { min: 50, optimal: 65, max: 90 },
    referenceRange: { min: 39, max: 200 },
    absoluteBounds: { min: 5, max: 200 },
    unitAliases: { 'mmol/L': 38.67 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr', 'vo2_max'],
    format: fmtMgDL,
  },
  triglycerides: {
    key: 'triglycerides',
    displayName: 'Triglycerides',
    shortName: 'TG',
    aliases: ['TG', 'Trigs', 'Triglyceride'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'lower_better',
    optimalRange: { min: 40, optimal: 70, max: 100 },
    referenceRange: { min: 0, max: 149 },
    absoluteBounds: { min: 0, max: 2000 },
    criticalHigh: 500,
    unitAliases: { 'mmol/L': 88.57 },
    healthDomains: ['cardiovascular', 'body_composition'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtMgDL,
  },

  // ── Vitamins ──────────────────────────────────────────────────────────────
  vitamin_d: {
    key: 'vitamin_d',
    displayName: 'Vitamin D',
    shortName: 'Vit D',
    aliases: ['25-OH Vitamin D', 'Vitamin D 25-Hydroxy', '25-Hydroxyvitamin D', 'Vitamin D, 25-OH', 'Vit D'],
    category: 'vitamins',
    unit: 'ng/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 50, optimal: 70, max: 90 },
    referenceRange: { min: 30, max: 100 },
    absoluteBounds: { min: 0, max: 200 },
    unitAliases: { 'nmol/L': 0.4006 },
    healthDomains: ['immune', 'hormonal', 'body_composition', 'cognitive'],
    relatedMetrics: ['sleep_score', 'recovery_score'],
    wearableCorrelations: [
      { metric: 'sleep_score', relationship: 'direct', mechanism: 'Vitamin D receptors in the brainstem regulate sleep-wake cycles and melatonin production' },
    ],
    format: fmtNgML,
  },
  vitamin_b12: {
    key: 'vitamin_b12',
    displayName: 'Vitamin B12',
    aliases: ['B12', 'Cobalamin', 'Cyanocobalamin'],
    category: 'vitamins',
    unit: 'pg/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 500, optimal: 800, max: 1200 },
    referenceRange: { min: 232, max: 1245 },
    healthDomains: ['energy', 'cognitive', 'immune'],
    relatedMetrics: ['energy', 'sleep_score'],
    format: fmtPgML,
  },
  folate: {
    key: 'folate',
    displayName: 'Folate',
    aliases: ['Folic Acid', 'Vitamin B9', 'Serum Folate'],
    category: 'vitamins',
    unit: 'ng/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 15, optimal: 20, max: 30 },
    referenceRange: { min: 2.7, max: 17 },
    healthDomains: ['energy', 'cognitive', 'cardiovascular'],
    relatedMetrics: ['energy'],
    format: fmtNgML,
  },

  // ── Minerals ──────────────────────────────────────────────────────────────
  ferritin: {
    key: 'ferritin',
    displayName: 'Ferritin',
    aliases: ['Serum Ferritin', 'Iron Storage'],
    category: 'minerals',
    unit: 'ng/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 75, optimal: 125, max: 175 },
    referenceRange: { min: 30, max: 400 },
    healthDomains: ['energy', 'immune', 'recovery'],
    relatedMetrics: ['rhr', 'hrv'],
    format: fmtNgML,
  },
  iron: {
    key: 'iron',
    displayName: 'Iron',
    aliases: ['Serum Iron', 'Fe', 'Iron Total', 'Iron, Total'],
    category: 'minerals',
    unit: 'ug/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 80, optimal: 110, max: 150 },
    referenceRange: { min: 38, max: 169 },
    healthDomains: ['energy', 'immune', 'recovery'],
    relatedMetrics: ['rhr', 'vo2_max'],
    format: (v) => `${v.toFixed(0)} ug/dL`,
  },
  magnesium: {
    key: 'magnesium',
    displayName: 'Magnesium',
    aliases: ['Mg', 'Serum Magnesium', 'Magnesium RBC'],
    category: 'minerals',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 2.0, optimal: 2.3, max: 2.5 },
    referenceRange: { min: 1.6, max: 2.6 },
    healthDomains: ['sleep', 'recovery', 'cardiovascular', 'energy'],
    relatedMetrics: ['deep_sleep', 'hrv', 'rhr'],
    format: (v) => `${v.toFixed(1)} mg/dL`,
  },

  // ── Inflammation ──────────────────────────────────────────────────────────
  hs_crp: {
    key: 'hs_crp',
    displayName: 'hs-CRP',
    shortName: 'hs-CRP',
    aliases: ['CRP', 'C-Reactive Protein', 'High Sensitivity CRP', 'hsCRP', 'hs CRP', 'hs-CRP'],
    category: 'inflammation',
    unit: 'mg/L',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0.5, max: 1.0 },
    referenceRange: { min: 0, max: 3.0 },
    absoluteBounds: { min: 0, max: 300 },
    criticalHigh: 10,
    unitAliases: { 'mg/dL': 10 },
    healthDomains: ['immune', 'cardiovascular', 'recovery'],
    relatedMetrics: ['hrv', 'rhr'],
    wearableCorrelations: [
      { metric: 'hrv', relationship: 'inverse', mechanism: 'Systemic inflammation directly impairs parasympathetic recovery and autonomic flexibility' },
      { metric: 'recovery_score', relationship: 'inverse', mechanism: 'Elevated CRP signals inflammatory burden that suppresses physiological recovery capacity' },
    ],
    format: fmtMgL,
  },
  homocysteine: {
    key: 'homocysteine',
    displayName: 'Homocysteine',
    aliases: ['Hcy', 'Plasma Homocysteine'],
    category: 'inflammation',
    unit: 'umol/L',
    polarity: 'lower_better',
    optimalRange: { min: 5, optimal: 7, max: 9 },
    referenceRange: { min: 0, max: 15 },
    healthDomains: ['cardiovascular', 'cognitive'],
    relatedMetrics: ['rhr'],
    format: fmtUmolL,
  },

  // ── Liver ─────────────────────────────────────────────────────────────────
  alt: {
    key: 'alt',
    displayName: 'ALT',
    aliases: ['Alanine Aminotransferase', 'SGPT', 'ALT (SGPT)'],
    category: 'liver',
    unit: 'U/L',
    polarity: 'lower_better',
    optimalRange: { min: 10, optimal: 20, max: 30 },
    referenceRange: { min: 0, max: 44 },
    healthDomains: ['body_composition'],
    relatedMetrics: ['body_fat_percentage'],
    format: fmtUL,
  },
  ast: {
    key: 'ast',
    displayName: 'AST',
    aliases: ['Aspartate Aminotransferase', 'SGOT', 'AST (SGOT)'],
    category: 'liver',
    unit: 'U/L',
    polarity: 'lower_better',
    optimalRange: { min: 10, optimal: 20, max: 30 },
    referenceRange: { min: 0, max: 40 },
    healthDomains: ['body_composition', 'recovery'],
    relatedMetrics: ['body_fat_percentage'],
    format: fmtUL,
  },

  // ── Kidney ────────────────────────────────────────────────────────────────
  creatinine: {
    key: 'creatinine',
    displayName: 'Creatinine',
    aliases: ['Serum Creatinine', 'Creat'],
    category: 'kidney',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 0.8, optimal: 1.0, max: 1.2 },
    referenceRange: { min: 0.76, max: 1.27 },
    healthDomains: ['body_composition'],
    relatedMetrics: ['lean_body_mass'],
    format: (v) => `${v.toFixed(2)} mg/dL`,
  },
  egfr: {
    key: 'egfr',
    displayName: 'eGFR',
    shortName: 'eGFR',
    aliases: ['Estimated GFR', 'GFR', 'Glomerular Filtration Rate', 'eGFR (CKD-EPI)'],
    category: 'kidney',
    unit: 'mL/min/1.73m2',
    polarity: 'higher_better',
    optimalRange: { min: 90, optimal: 110, max: 130 },
    referenceRange: { min: 60, max: 200 },
    absoluteBounds: { min: 0, max: 200 },
    criticalLow: 30,
    healthDomains: ['cardiovascular'],
    relatedMetrics: [],
    format: fmtMlMinCr,
  },

  // ── Advanced Lipids ───────────────────────────────────────────────────────
  apolipoprotein_b: {
    key: 'apolipoprotein_b',
    displayName: 'Apolipoprotein B',
    shortName: 'ApoB',
    aliases: ['ApoB', 'Apo B', 'Apolipoprotein B (c)', 'ApoB (c)'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'lower_better',
    optimalRange: { min: 40, optimal: 60, max: 80 },
    referenceRange: { min: 0, max: 130 },
    absoluteBounds: { min: 0, max: 500 },
    criticalHigh: 200,
    unitAliases: { 'g/L': 100 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr', 'vo2_max'],
    wearableCorrelations: [
      { metric: 'rhr', relationship: 'direct', mechanism: 'Elevated ApoB is associated with atherosclerosis, which can elevate resting heart rate over time' },
      { metric: 'vo2_max', relationship: 'inverse', mechanism: 'High ApoB burden correlates with reduced cardiovascular fitness capacity' },
    ],
    format: fmtMgDL,
  },
  lipoprotein_a: {
    key: 'lipoprotein_a',
    displayName: 'Lipoprotein(a)',
    shortName: 'Lp(a)',
    aliases: ['Lp(a)', 'Lp a', 'Lipoprotein a', 'Lipoprotein (a)'],
    category: 'lipids',
    unit: 'nmol/L',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 30, max: 75 },
    referenceRange: { min: 0, max: 75 },
    absoluteBounds: { min: 0, max: 500 },
    criticalHigh: 200,
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr', 'vo2_max'],
    wearableCorrelations: [
      { metric: 'vo2_max', relationship: 'inverse', mechanism: 'Elevated Lp(a) increases atherosclerotic burden limiting cardiovascular output' },
    ],
    format: fmtNmolLAlt,
  },
  ldl_particle_number: {
    key: 'ldl_particle_number',
    displayName: 'LDL Particle Number',
    shortName: 'LDL-P',
    aliases: ['LDL-P', 'LDL Particle', 'LDL Particle Count', 'LDL-P NMR'],
    category: 'lipids',
    unit: 'nmol/L',
    polarity: 'lower_better',
    optimalRange: { min: 400, optimal: 700, max: 1000 },
    referenceRange: { min: 0, max: 1300 },
    absoluteBounds: { min: 0, max: 3000 },
    criticalHigh: 2000,
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr'],
    format: fmtNmolLAlt,
  },
  ldl_small: {
    key: 'ldl_small',
    displayName: 'LDL Small',
    shortName: 'sm-LDL',
    aliases: ['Small LDL', 'LDL Small Dense', 'Small Dense LDL', 'sdLDL'],
    category: 'lipids',
    unit: 'nmol/L',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 200, max: 527 },
    referenceRange: { min: 0, max: 527 },
    absoluteBounds: { min: 0, max: 2000 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: [],
    format: fmtNmolLAlt,
  },
  non_hdl_cholesterol: {
    key: 'non_hdl_cholesterol',
    displayName: 'Non-HDL Cholesterol',
    shortName: 'Non-HDL',
    aliases: ['Non HDL', 'Non-HDL-C', 'Non HDL Cholesterol'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'lower_better',
    optimalRange: { min: 50, optimal: 90, max: 130 },
    referenceRange: { min: 0, max: 159 },
    absoluteBounds: { min: 0, max: 500 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr'],
    format: fmtMgDL,
  },
  fibrinogen: {
    key: 'fibrinogen',
    displayName: 'Fibrinogen',
    shortName: 'Fib',
    aliases: ['Fibrinogen Activity', 'Fibrinogen Level'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 200, optimal: 300, max: 400 },
    referenceRange: { min: 175, max: 425 },
    absoluteBounds: { min: 50, max: 1000 },
    healthDomains: ['cardiovascular', 'immune'],
    relatedMetrics: [],
    format: fmtMgDL,
  },

  // ── Metabolic (additions) ─────────────────────────────────────────────────
  homa_ir: {
    key: 'homa_ir',
    displayName: 'HOMA-IR',
    shortName: 'HOMA-IR',
    aliases: ['Homeostatic Model Assessment', 'Insulin Resistance Index'],
    category: 'metabolic',
    unit: 'ratio',
    polarity: 'lower_better',
    optimalRange: { min: 0.3, optimal: 0.7, max: 1.0 },
    referenceRange: { min: 0, max: 2.5 },
    absoluteBounds: { min: 0, max: 50 },
    criticalHigh: 5.0,
    healthDomains: ['body_composition', 'cardiovascular', 'energy'],
    relatedMetrics: ['body_fat_percentage', 'hrv', 'weight'],
    wearableCorrelations: [
      { metric: 'hrv', relationship: 'inverse', mechanism: 'Insulin resistance impairs autonomic flexibility, creating a biochemical ceiling for HRV' },
      { metric: 'body_fat_percentage', relationship: 'direct', mechanism: 'Elevated HOMA-IR drives fat storage and inhibits lipolysis' },
    ],
    format: (v) => v.toFixed(2),
  },
  uric_acid: {
    key: 'uric_acid',
    displayName: 'Uric Acid',
    shortName: 'UA',
    aliases: ['Urate', 'Serum Uric Acid'],
    category: 'metabolic',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 3.5, optimal: 5.0, max: 5.5 },
    referenceRange: { min: 2.4, max: 8.2 },
    absoluteBounds: { min: 0, max: 20 },
    criticalHigh: 12,
    healthDomains: ['cardiovascular', 'immune'],
    relatedMetrics: [],
    format: (v) => `${v.toFixed(1)} mg/dL`,
  },
  leptin: {
    key: 'leptin',
    displayName: 'Leptin',
    shortName: 'Leptin',
    aliases: ['Serum Leptin'],
    category: 'metabolic',
    unit: 'ng/mL',
    polarity: 'lower_better',
    optimalRange: { min: 1, optimal: 5, max: 10 },
    referenceRange: { min: 0, max: 30 },
    absoluteBounds: { min: 0, max: 200 },
    sexSpecific: true,
    healthDomains: ['body_composition', 'hormonal'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtNgML,
  },
  adiponectin: {
    key: 'adiponectin',
    displayName: 'Adiponectin',
    shortName: 'Adipo',
    aliases: ['Serum Adiponectin'],
    category: 'metabolic',
    unit: 'ug/mL',
    polarity: 'higher_better',
    optimalRange: { min: 10, optimal: 15, max: 25 },
    referenceRange: { min: 2, max: 30 },
    absoluteBounds: { min: 0, max: 100 },
    healthDomains: ['body_composition', 'cardiovascular'],
    relatedMetrics: ['body_fat_percentage'],
    format: fmtUgMLAlt,
  },

  // ── Thyroid (additions) ───────────────────────────────────────────────────
  reverse_t3: {
    key: 'reverse_t3',
    displayName: 'Reverse T3',
    shortName: 'rT3',
    aliases: ['RT3', 'Reverse Triiodothyronine', 'rT3'],
    category: 'hormones_thyroid',
    unit: 'ng/dL',
    polarity: 'lower_better',
    optimalRange: { min: 8, optimal: 14, max: 20 },
    referenceRange: { min: 9.2, max: 24.1 },
    absoluteBounds: { min: 0, max: 100 },
    healthDomains: ['energy', 'body_composition'],
    relatedMetrics: ['rhr', 'body_fat_percentage'],
    format: (v) => `${v.toFixed(1)} ng/dL`,
  },
  tpo_antibodies: {
    key: 'tpo_antibodies',
    displayName: 'TPO Antibodies',
    shortName: 'TPO Ab',
    aliases: ['Anti-TPO', 'Thyroid Peroxidase Antibodies', 'TPO Ab', 'Thyroid Peroxidase Ab'],
    category: 'hormones_thyroid',
    unit: 'IU/mL',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0, max: 9 },
    referenceRange: { min: 0, max: 34 },
    absoluteBounds: { min: 0, max: 3000 },
    criticalHigh: 500,
    healthDomains: ['immune', 'energy'],
    relatedMetrics: [],
    format: fmtIUML,
  },
  thyroglobulin_antibodies: {
    key: 'thyroglobulin_antibodies',
    displayName: 'Thyroglobulin Antibodies',
    shortName: 'TgAb',
    aliases: ['Anti-Tg', 'Thyroglobulin Ab', 'TgAb', 'Anti-Thyroglobulin'],
    category: 'hormones_thyroid',
    unit: 'IU/mL',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0, max: 1 },
    referenceRange: { min: 0, max: 4 },
    absoluteBounds: { min: 0, max: 5000 },
    healthDomains: ['immune'],
    relatedMetrics: [],
    format: fmtIUML,
  },

  // ── Hormones - Male/Female (additions) ────────────────────────────────────
  fsh: {
    key: 'fsh',
    displayName: 'FSH',
    shortName: 'FSH',
    aliases: ['Follicle Stimulating Hormone', 'Follicle-Stimulating Hormone'],
    category: 'hormones_female',
    unit: 'mIU/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 3, optimal: 7, max: 12 },
    referenceRange: { min: 1.5, max: 12.4 },
    absoluteBounds: { min: 0, max: 200 },
    sexSpecific: true,
    healthDomains: ['hormonal'],
    relatedMetrics: [],
    format: (v) => `${v.toFixed(1)} mIU/mL`,
  },
  lh: {
    key: 'lh',
    displayName: 'LH',
    shortName: 'LH',
    aliases: ['Luteinizing Hormone'],
    category: 'hormones_female',
    unit: 'mIU/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 2, optimal: 6, max: 12 },
    referenceRange: { min: 1.7, max: 11.2 },
    absoluteBounds: { min: 0, max: 200 },
    sexSpecific: true,
    healthDomains: ['hormonal'],
    relatedMetrics: [],
    format: (v) => `${v.toFixed(1)} mIU/mL`,
  },
  progesterone: {
    key: 'progesterone',
    displayName: 'Progesterone',
    shortName: 'Prog',
    aliases: ['Serum Progesterone', 'P4'],
    category: 'hormones_female',
    unit: 'ng/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 0.1, optimal: 0.5, max: 1.5 },
    referenceRange: { min: 0.1, max: 25 },
    absoluteBounds: { min: 0, max: 50 },
    sexSpecific: true,
    healthDomains: ['hormonal', 'sleep'],
    relatedMetrics: ['deep_sleep'],
    format: fmtNgML,
  },
  amh: {
    key: 'amh',
    displayName: 'AMH',
    shortName: 'AMH',
    aliases: ['Anti-Mullerian Hormone', 'Anti-Müllerian Hormone', 'Mullerian Inhibiting Substance'],
    category: 'hormones_female',
    unit: 'ng/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 1.0, optimal: 3.0, max: 6.0 },
    referenceRange: { min: 0.3, max: 10 },
    absoluteBounds: { min: 0, max: 25 },
    sexSpecific: true,
    healthDomains: ['hormonal'],
    relatedMetrics: [],
    format: fmtNgML,
  },

  // ── Liver (additions) ─────────────────────────────────────────────────────
  ggt: {
    key: 'ggt',
    displayName: 'GGT',
    shortName: 'GGT',
    aliases: ['Gamma-Glutamyl Transferase', 'Gamma GT', 'GGTP', 'Gamma-Glutamyltransferase'],
    category: 'liver',
    unit: 'U/L',
    polarity: 'lower_better',
    optimalRange: { min: 5, optimal: 15, max: 25 },
    referenceRange: { min: 0, max: 65 },
    absoluteBounds: { min: 0, max: 2000 },
    criticalHigh: 200,
    sexSpecific: true,
    healthDomains: ['body_composition', 'cardiovascular'],
    relatedMetrics: ['body_fat_percentage'],
    wearableCorrelations: [
      { metric: 'body_fat_percentage', relationship: 'direct', mechanism: 'GGT elevation correlates with hepatic fat accumulation and oxidative stress' },
    ],
    format: fmtUL,
  },
  alkaline_phosphatase: {
    key: 'alkaline_phosphatase',
    displayName: 'Alkaline Phosphatase',
    shortName: 'ALP',
    aliases: ['ALP', 'Alk Phos', 'Alkaline Phos'],
    category: 'liver',
    unit: 'U/L',
    polarity: 'optimal_range',
    optimalRange: { min: 35, optimal: 65, max: 100 },
    referenceRange: { min: 20, max: 130 },
    absoluteBounds: { min: 0, max: 2000 },
    healthDomains: ['body_composition'],
    relatedMetrics: [],
    format: fmtUL,
  },
  total_bilirubin: {
    key: 'total_bilirubin',
    displayName: 'Total Bilirubin',
    shortName: 'T.Bili',
    aliases: ['Bilirubin Total', 'Bilirubin', 'T. Bilirubin', 'TBIL'],
    category: 'liver',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 0.2, optimal: 0.7, max: 1.2 },
    referenceRange: { min: 0.1, max: 1.2 },
    absoluteBounds: { min: 0, max: 30 },
    criticalHigh: 5.0,
    healthDomains: ['cardiovascular'],
    relatedMetrics: [],
    format: (v) => `${v.toFixed(1)} mg/dL`,
  },
  albumin: {
    key: 'albumin',
    displayName: 'Albumin',
    shortName: 'Alb',
    aliases: ['Serum Albumin'],
    category: 'liver',
    unit: 'g/dL',
    polarity: 'higher_better',
    optimalRange: { min: 4.2, optimal: 4.5, max: 5.0 },
    referenceRange: { min: 3.5, max: 5.5 },
    absoluteBounds: { min: 0, max: 8 },
    criticalLow: 2.5,
    healthDomains: ['immune', 'recovery'],
    relatedMetrics: [],
    format: fmtGDL,
  },
  total_protein: {
    key: 'total_protein',
    displayName: 'Total Protein',
    shortName: 'TP',
    aliases: ['Protein Total', 'Serum Protein', 'TP'],
    category: 'liver',
    unit: 'g/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 6.5, optimal: 7.2, max: 8.0 },
    referenceRange: { min: 6.0, max: 8.5 },
    absoluteBounds: { min: 0, max: 15 },
    healthDomains: ['immune'],
    relatedMetrics: [],
    format: fmtGDL,
  },

  // ── Kidney (additions) ────────────────────────────────────────────────────
  bun: {
    key: 'bun',
    displayName: 'BUN',
    shortName: 'BUN',
    aliases: ['Blood Urea Nitrogen', 'Urea Nitrogen'],
    category: 'kidney',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 7, optimal: 14, max: 20 },
    referenceRange: { min: 6, max: 24 },
    absoluteBounds: { min: 0, max: 200 },
    criticalHigh: 100,
    healthDomains: ['body_composition'],
    relatedMetrics: [],
    format: fmtMgDL,
  },
  cystatin_c: {
    key: 'cystatin_c',
    displayName: 'Cystatin C',
    shortName: 'CysC',
    aliases: ['Cystatin-C', 'Serum Cystatin C'],
    category: 'kidney',
    unit: 'mg/L',
    polarity: 'optimal_range',
    optimalRange: { min: 0.55, optimal: 0.70, max: 0.85 },
    referenceRange: { min: 0.50, max: 1.00 },
    absoluteBounds: { min: 0, max: 10 },
    criticalHigh: 3.0,
    healthDomains: ['cardiovascular'],
    relatedMetrics: [],
    format: fmtMgL,
  },

  // ── Nutrients & Vitamins (additions) ──────────────────────────────────────
  methylmalonic_acid: {
    key: 'methylmalonic_acid',
    displayName: 'Methylmalonic Acid',
    shortName: 'MMA',
    aliases: ['MMA', 'Methylmalonate'],
    category: 'vitamins',
    unit: 'nmol/L',
    polarity: 'lower_better',
    optimalRange: { min: 50, optimal: 150, max: 270 },
    referenceRange: { min: 0, max: 378 },
    absoluteBounds: { min: 0, max: 5000 },
    healthDomains: ['energy', 'cognitive'],
    relatedMetrics: [],
    format: (v) => `${Math.round(v)} nmol/L`,
  },
  tibc: {
    key: 'tibc',
    displayName: 'TIBC',
    shortName: 'TIBC',
    aliases: ['Total Iron Binding Capacity', 'Iron Binding Capacity'],
    category: 'minerals',
    unit: 'ug/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 250, optimal: 310, max: 370 },
    referenceRange: { min: 250, max: 450 },
    absoluteBounds: { min: 50, max: 800 },
    healthDomains: ['energy'],
    relatedMetrics: ['rhr'],
    format: fmtUgDL,
  },
  transferrin_saturation: {
    key: 'transferrin_saturation',
    displayName: 'Transferrin Saturation',
    shortName: 'TSAT',
    aliases: ['Iron Saturation', 'TSAT', 'Transferrin Sat', 'Iron Sat %', '% Saturation', 'Saturation'],
    category: 'minerals',
    unit: '%',
    polarity: 'optimal_range',
    optimalRange: { min: 25, optimal: 35, max: 45 },
    referenceRange: { min: 15, max: 55 },
    absoluteBounds: { min: 0, max: 100 },
    criticalHigh: 70,
    criticalLow: 10,
    healthDomains: ['energy', 'recovery'],
    relatedMetrics: ['rhr', 'vo2_max'],
    format: fmtPercent,
  },
  rbc_magnesium: {
    key: 'rbc_magnesium',
    displayName: 'RBC Magnesium',
    shortName: 'RBC Mg',
    aliases: ['Magnesium RBC', 'Red Blood Cell Magnesium', 'Intracellular Magnesium'],
    category: 'minerals',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 5.0, optimal: 5.8, max: 6.5 },
    referenceRange: { min: 4.0, max: 6.8 },
    absoluteBounds: { min: 1, max: 15 },
    healthDomains: ['sleep', 'recovery', 'cardiovascular'],
    relatedMetrics: ['deep_sleep', 'hrv'],
    wearableCorrelations: [
      { metric: 'deep_sleep', relationship: 'direct', mechanism: 'Magnesium facilitates GABA receptor function, directly supporting slow-wave sleep architecture' },
      { metric: 'hrv', relationship: 'direct', mechanism: 'Magnesium supports parasympathetic tone and cardiac electrical stability' },
    ],
    format: (v) => `${v.toFixed(1)} mg/dL`,
  },
  omega_3_index: {
    key: 'omega_3_index',
    displayName: 'Omega-3 Index',
    shortName: 'Ω-3',
    aliases: ['Omega 3 Index', 'O3 Index', 'EPA + DHA Index', 'EPA+DPA+DHA', 'OmegaCheck', 'EPA DPA DHA'],
    category: 'vitamins',
    unit: '%',
    polarity: 'higher_better',
    optimalRange: { min: 8, optimal: 10, max: 12 },
    referenceRange: { min: 2, max: 15 },
    absoluteBounds: { min: 0, max: 20 },
    healthDomains: ['cardiovascular', 'cognitive', 'immune'],
    relatedMetrics: ['hrv', 'rhr'],
    wearableCorrelations: [
      { metric: 'hrv', relationship: 'direct', mechanism: 'Omega-3 fatty acids improve cell membrane fluidity and vagal tone, supporting HRV' },
    ],
    format: fmtPercent,
  },
  zinc: {
    key: 'zinc',
    displayName: 'Zinc',
    shortName: 'Zn',
    aliases: ['Serum Zinc', 'Zn', 'Plasma Zinc'],
    category: 'minerals',
    unit: 'ug/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 80, optimal: 100, max: 120 },
    referenceRange: { min: 56, max: 134 },
    absoluteBounds: { min: 0, max: 300 },
    healthDomains: ['immune', 'hormonal', 'recovery'],
    relatedMetrics: ['recovery_score'],
    format: fmtUgDL,
  },

  // ── Inflammation & Autoimmunity (additions) ───────────────────────────────
  esr: {
    key: 'esr',
    displayName: 'ESR',
    shortName: 'ESR',
    aliases: ['Erythrocyte Sedimentation Rate', 'Sed Rate', 'Westergren ESR'],
    category: 'inflammation',
    unit: 'mm/hr',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 5, max: 10 },
    referenceRange: { min: 0, max: 20 },
    absoluteBounds: { min: 0, max: 200 },
    criticalHigh: 100,
    healthDomains: ['immune', 'recovery'],
    relatedMetrics: ['hrv'],
    format: fmtMmHr,
  },
  ana_screen: {
    key: 'ana_screen',
    displayName: 'ANA Screen',
    shortName: 'ANA',
    aliases: ['ANA', 'Antinuclear Antibodies', 'Antinuclear Antibody Screen', 'ANA Screen IFA'],
    category: 'autoimmunity',
    unit: 'pos/neg',
    polarity: 'categorical',
    referenceRange: { min: 0, max: 1 },
    absoluteBounds: { min: 0, max: 1 },
    healthDomains: ['immune'],
    relatedMetrics: [],
    format: (v) => v === 0 ? 'Negative' : 'Positive',
  },
  rheumatoid_factor: {
    key: 'rheumatoid_factor',
    displayName: 'Rheumatoid Factor',
    shortName: 'RF',
    aliases: ['RF', 'RA Factor', 'Rheumatoid Factor Quantitative'],
    category: 'autoimmunity',
    unit: 'IU/mL',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0, max: 14 },
    referenceRange: { min: 0, max: 14 },
    absoluteBounds: { min: 0, max: 1000 },
    criticalHigh: 100,
    healthDomains: ['immune'],
    relatedMetrics: [],
    format: fmtIUML,
  },

  // ── Blood & CBC ───────────────────────────────────────────────────────────
  wbc: {
    key: 'wbc',
    displayName: 'WBC',
    shortName: 'WBC',
    aliases: ['White Blood Cells', 'White Blood Cell Count', 'Leukocytes', 'WBC Count'],
    category: 'blood_counts',
    unit: '10^3/uL',
    polarity: 'optimal_range',
    optimalRange: { min: 4.0, optimal: 5.5, max: 7.0 },
    referenceRange: { min: 3.4, max: 10.8 },
    absoluteBounds: { min: 0, max: 100 },
    criticalLow: 2.0,
    criticalHigh: 30,
    healthDomains: ['immune'],
    relatedMetrics: [],
    format: fmtThousandUL,
  },
  rbc: {
    key: 'rbc',
    displayName: 'RBC',
    shortName: 'RBC',
    aliases: ['Red Blood Cells', 'Red Blood Cell Count', 'Erythrocytes', 'RBC Count'],
    category: 'blood_counts',
    unit: '10^6/uL',
    polarity: 'optimal_range',
    optimalRange: { min: 4.5, optimal: 5.0, max: 5.5 },
    referenceRange: { min: 4.14, max: 5.8 },
    absoluteBounds: { min: 0, max: 10 },
    criticalLow: 3.0,
    sexSpecific: true,
    healthDomains: ['energy', 'recovery'],
    relatedMetrics: ['rhr', 'vo2_max'],
    format: fmtMillionUL,
  },
  hemoglobin: {
    key: 'hemoglobin',
    displayName: 'Hemoglobin',
    shortName: 'Hgb',
    aliases: ['Hgb', 'Hb', 'Haemoglobin'],
    category: 'blood_counts',
    unit: 'g/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 14.0, optimal: 15.5, max: 17.0 },
    referenceRange: { min: 12.6, max: 17.7 },
    absoluteBounds: { min: 3, max: 25 },
    criticalLow: 7.0,
    criticalHigh: 20,
    sexSpecific: true,
    healthDomains: ['energy', 'recovery', 'cardiovascular'],
    relatedMetrics: ['rhr', 'vo2_max'],
    wearableCorrelations: [
      { metric: 'rhr', relationship: 'inverse', mechanism: 'Low hemoglobin forces compensatory heart rate increase to maintain oxygen delivery' },
      { metric: 'vo2_max', relationship: 'direct', mechanism: 'Hemoglobin directly determines oxygen-carrying capacity, a primary limiter of VO2 max' },
    ],
    format: fmtGDL,
  },
  hematocrit: {
    key: 'hematocrit',
    displayName: 'Hematocrit',
    shortName: 'Hct',
    aliases: ['HCT', 'Packed Cell Volume', 'PCV'],
    category: 'blood_counts',
    unit: '%',
    polarity: 'optimal_range',
    optimalRange: { min: 40, optimal: 45, max: 50 },
    referenceRange: { min: 37.5, max: 51.0 },
    absoluteBounds: { min: 10, max: 70 },
    criticalLow: 20,
    criticalHigh: 60,
    sexSpecific: true,
    healthDomains: ['energy', 'recovery'],
    relatedMetrics: ['rhr', 'vo2_max'],
    format: fmtPercent,
  },
  mcv: {
    key: 'mcv',
    displayName: 'MCV',
    shortName: 'MCV',
    aliases: ['Mean Corpuscular Volume', 'Mean Cell Volume'],
    category: 'blood_counts',
    unit: 'fL',
    polarity: 'optimal_range',
    optimalRange: { min: 82, optimal: 90, max: 98 },
    referenceRange: { min: 79, max: 97 },
    absoluteBounds: { min: 40, max: 150 },
    healthDomains: ['energy'],
    relatedMetrics: [],
    format: fmtFL,
  },
  platelets: {
    key: 'platelets',
    displayName: 'Platelets',
    shortName: 'PLT',
    aliases: ['Platelet Count', 'PLT', 'Thrombocytes'],
    category: 'blood_counts',
    unit: '10^3/uL',
    polarity: 'optimal_range',
    optimalRange: { min: 150, optimal: 250, max: 300 },
    referenceRange: { min: 150, max: 379 },
    absoluteBounds: { min: 10, max: 1000 },
    criticalLow: 50,
    criticalHigh: 600,
    healthDomains: ['immune'],
    relatedMetrics: [],
    format: fmtThousandUL,
  },

  // ── Environmental Toxins ──────────────────────────────────────────────────
  lead_blood: {
    key: 'lead_blood',
    displayName: 'Lead (Blood)',
    shortName: 'Pb',
    aliases: ['Lead', 'Blood Lead', 'Blood Lead Level', 'Pb'],
    category: 'toxins',
    unit: 'ug/dL',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0, max: 1.0 },
    referenceRange: { min: 0, max: 5.0 },
    absoluteBounds: { min: 0, max: 100 },
    criticalHigh: 10,
    healthDomains: ['cognitive', 'cardiovascular'],
    relatedMetrics: [],
    format: (v) => `${v.toFixed(1)} µg/dL`,
  },
  mercury_blood: {
    key: 'mercury_blood',
    displayName: 'Mercury (Blood)',
    shortName: 'Hg',
    aliases: ['Mercury', 'Blood Mercury', 'Hg'],
    category: 'toxins',
    unit: 'ug/L',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0, max: 5.0 },
    referenceRange: { min: 0, max: 10 },
    absoluteBounds: { min: 0, max: 200 },
    criticalHigh: 20,
    healthDomains: ['cognitive', 'immune'],
    relatedMetrics: [],
    format: fmtUgL,
  },
}

// ─── Alias Lookup Map ───────────────────────────────────────────────────────

const aliasMap: Map<string, string> = new Map()

function buildAliasMap(): void {
  if (aliasMap.size > 0) return // Already built

  for (const def of Object.values(BIOMARKER_REGISTRY)) {
    // Add the canonical key
    aliasMap.set(normalizeString(def.key), def.key)
    aliasMap.set(normalizeString(def.displayName), def.key)

    // Add all aliases
    for (const alias of def.aliases) {
      aliasMap.set(normalizeString(alias), def.key)
    }
  }
}

function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')  // Remove all non-alphanumeric
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Fuzzy match a raw biomarker name to a canonical key.
 * Returns null if no match is found.
 */
export function normalizeBiomarkerName(raw: string): string | null {
  buildAliasMap()

  // Direct lookup after normalization
  const normalized = normalizeString(raw)
  const directMatch = aliasMap.get(normalized)
  if (directMatch) return directMatch

  // Try partial matching for common patterns
  // e.g., "testosterone total serum" should match "total_testosterone"
  const words = normalized.split(/\s+/)
  const entries = Array.from(aliasMap.entries())
  for (const [aliasNorm, key] of entries) {
    // Check if all words in the raw string appear in the alias
    // Use stricter threshold for single-word inputs to prevent false positives:
    // "globulin" → "thyroglobulinab" (53%), "protein" → "creactiveprotein" (44%)
    if (words.every(word => aliasNorm.includes(word))) {
      const rawLength = words.reduce((sum, w) => sum + w.length, 0)
      const threshold = words.length === 1 ? 0.8 : 0.4
      if (rawLength >= aliasNorm.length * threshold) {
        return key
      }
    }
    // Check if all words in the alias appear in the raw string
    const aliasWords = aliasNorm.split(/[^a-z0-9]+/).filter(w => w.length > 1)
    if (aliasWords.length > 0 && aliasWords.every(word => normalized.includes(word))) {
      return key
    }
  }

  return null
}

/**
 * Get a biomarker definition by canonical key.
 */
export function getBiomarker(key: string): BiomarkerDefinition | undefined {
  return BIOMARKER_REGISTRY[key]
}

/**
 * Get all biomarker definitions for a given category.
 */
export function getBiomarkersByCategory(category: BiomarkerCategory): BiomarkerDefinition[] {
  return Object.values(BIOMARKER_REGISTRY).filter(b => b.category === category)
}

/**
 * Get all biomarker definitions for a given health domain.
 */
export function getBiomarkersByHealthDomain(domain: HealthDomain): BiomarkerDefinition[] {
  return Object.values(BIOMARKER_REGISTRY).filter(b => b.healthDomains.includes(domain))
}

/**
 * Compute a flag indicating where the value falls relative to reference/optimal ranges.
 * - 'low': Below reference range minimum
 * - 'normal': Within reference range but outside optimal
 * - 'optimal': Within optimal range (if defined)
 * - 'high': Above reference range maximum
 */
export function computeFlag(key: string, value: number): BiomarkerFlag {
  const def = BIOMARKER_REGISTRY[key]
  if (!def) return 'normal'

  const { referenceRange, optimalRange, criticalLow, criticalHigh } = def

  // Check critical ranges first
  if (criticalLow !== undefined && value < criticalLow) return 'critical_low'
  if (criticalHigh !== undefined && value > criticalHigh) return 'critical_high'

  // Check reference range bounds
  if (value < referenceRange.min) return 'low'
  if (value > referenceRange.max) return 'high'

  // Within reference range - check optimal if available
  if (optimalRange) {
    if (value >= optimalRange.min && value <= optimalRange.max) {
      return 'optimal'
    }
  }

  return 'normal'
}

/**
 * Format a biomarker value using its defined formatter.
 */
export function formatBiomarker(key: string, value: number): string {
  const def = BIOMARKER_REGISTRY[key]
  if (!def) return value.toFixed(1)
  return def.format(value)
}

/**
 * Get display name for a biomarker. Falls back to the key itself.
 */
export function getBiomarkerDisplayName(key: string): string {
  return BIOMARKER_REGISTRY[key]?.displayName ?? key
}

/**
 * Get all biomarker keys.
 */
export function getAllBiomarkerKeys(): string[] {
  return Object.keys(BIOMARKER_REGISTRY)
}

/**
 * Get all unique biomarker categories.
 */
export function getAllCategories(): BiomarkerCategory[] {
  const categories = new Set<BiomarkerCategory>()
  for (const def of Object.values(BIOMARKER_REGISTRY)) {
    categories.add(def.category)
  }
  return Array.from(categories)
}

/**
 * Calculate percentage within optimal range (0-100).
 * Returns null if no optimal range defined or value is out of reference range.
 */
export function computeOptimalScore(key: string, value: number): number | null {
  const def = BIOMARKER_REGISTRY[key]
  if (!def || !def.optimalRange) return null

  const { optimalRange, referenceRange } = def

  // Out of reference range
  if (value < referenceRange.min || value > referenceRange.max) return null

  // At optimal value
  if (value === optimalRange.optimal) return 100

  // Calculate distance from optimal as percentage
  if (value < optimalRange.optimal) {
    // Below optimal
    const range = optimalRange.optimal - referenceRange.min
    const distance = optimalRange.optimal - value
    return Math.max(0, Math.round(100 * (1 - distance / range)))
  } else {
    // Above optimal
    const range = referenceRange.max - optimalRange.optimal
    const distance = value - optimalRange.optimal
    return Math.max(0, Math.round(100 * (1 - distance / range)))
  }
}

/**
 * Get related wearable metrics for a given biomarker.
 */
export function getRelatedMetrics(key: string): string[] {
  return BIOMARKER_REGISTRY[key]?.relatedMetrics ?? []
}
