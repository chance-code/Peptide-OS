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

export type HealthDomain =
  | 'sleep'
  | 'recovery'
  | 'energy'
  | 'body_composition'
  | 'cardiovascular'
  | 'cognitive'
  | 'immune'
  | 'hormonal'

export interface BiomarkerDefinition {
  key: string                          // Canonical name: "total_testosterone"
  displayName: string                  // "Total Testosterone"
  aliases: string[]                    // ["testosterone", "T", "Test Total"]
  category: BiomarkerCategory
  unit: string                         // "ng/dL"
  polarity: 'higher_better' | 'lower_better' | 'optimal_range'
  optimalRange?: { min: number; optimal: number; max: number }
  referenceRange: { min: number; max: number }
  healthDomains: HealthDomain[]        // ['hormonal', 'recovery']
  relatedMetrics?: string[]            // ['deep_sleep', 'hrv']
  format: (value: number) => string
}

export type BiomarkerFlag = 'low' | 'normal' | 'optimal' | 'high'

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

// ─── Biomarker Registry ─────────────────────────────────────────────────────

export const BIOMARKER_REGISTRY: Record<string, BiomarkerDefinition> = {
  // ── Hormones - Male ───────────────────────────────────────────────────────
  total_testosterone: {
    key: 'total_testosterone',
    displayName: 'Total Testosterone',
    aliases: ['testosterone', 'T', 'Test Total', 'Total T', 'Testosterone, Total', 'Serum Testosterone'],
    category: 'hormones_male',
    unit: 'ng/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 600, optimal: 800, max: 1000 },
    referenceRange: { min: 264, max: 916 },
    healthDomains: ['hormonal', 'energy', 'body_composition', 'recovery', 'cognitive'],
    relatedMetrics: ['deep_sleep', 'hrv', 'lean_body_mass', 'body_fat_percentage'],
    format: fmtNgDL,
  },
  free_testosterone: {
    key: 'free_testosterone',
    displayName: 'Free Testosterone',
    aliases: ['Free T', 'FT', 'Testosterone Free', 'Direct Free Testosterone'],
    category: 'hormones_male',
    unit: 'pg/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 15, optimal: 20, max: 25 },
    referenceRange: { min: 5.0, max: 21.0 },
    healthDomains: ['hormonal', 'energy', 'body_composition', 'recovery'],
    relatedMetrics: ['deep_sleep', 'hrv', 'lean_body_mass'],
    format: fmtPgML,
  },
  estradiol: {
    key: 'estradiol',
    displayName: 'Estradiol',
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
    aliases: ['FT3', 'Triiodothyronine Free', 'Free Triiodothyronine'],
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
    aliases: ['FT4', 'Thyroxine Free', 'Free Thyroxine'],
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
    aliases: ['Glucose', 'Blood Glucose', 'FBG', 'Fasting Blood Glucose', 'Glucose Fasting'],
    category: 'metabolic',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 70, optimal: 85, max: 95 },
    referenceRange: { min: 65, max: 99 },
    healthDomains: ['energy', 'body_composition', 'cardiovascular'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtMgDL,
  },
  hba1c: {
    key: 'hba1c',
    displayName: 'HbA1c',
    aliases: ['Hemoglobin A1c', 'A1C', 'Glycated Hemoglobin', 'Glycohemoglobin'],
    category: 'metabolic',
    unit: '%',
    polarity: 'lower_better',
    optimalRange: { min: 4.5, optimal: 5.0, max: 5.4 },
    referenceRange: { min: 4.0, max: 5.6 },
    healthDomains: ['body_composition', 'cardiovascular', 'energy'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtPercent,
  },
  fasting_insulin: {
    key: 'fasting_insulin',
    displayName: 'Fasting Insulin',
    aliases: ['Insulin', 'Insulin Fasting', 'Serum Insulin'],
    category: 'metabolic',
    unit: 'uIU/mL',
    polarity: 'lower_better',
    optimalRange: { min: 2, optimal: 4, max: 6 },
    referenceRange: { min: 2.6, max: 24.9 },
    healthDomains: ['body_composition', 'energy', 'cardiovascular'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtUIU,
  },

  // ── Lipids ────────────────────────────────────────────────────────────────
  total_cholesterol: {
    key: 'total_cholesterol',
    displayName: 'Total Cholesterol',
    aliases: ['Cholesterol', 'TC', 'Cholesterol Total'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'optimal_range',
    optimalRange: { min: 150, optimal: 180, max: 200 },
    referenceRange: { min: 100, max: 199 },
    healthDomains: ['cardiovascular', 'hormonal'],
    relatedMetrics: ['rhr', 'body_fat_percentage'],
    format: fmtMgDL,
  },
  ldl_cholesterol: {
    key: 'ldl_cholesterol',
    displayName: 'LDL Cholesterol',
    aliases: ['LDL', 'LDL-C', 'Low Density Lipoprotein', 'LDL Direct'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'lower_better',
    optimalRange: { min: 50, optimal: 70, max: 100 },
    referenceRange: { min: 0, max: 99 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr', 'body_fat_percentage'],
    format: fmtMgDL,
  },
  hdl_cholesterol: {
    key: 'hdl_cholesterol',
    displayName: 'HDL Cholesterol',
    aliases: ['HDL', 'HDL-C', 'High Density Lipoprotein'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'higher_better',
    optimalRange: { min: 50, optimal: 65, max: 90 },
    referenceRange: { min: 39, max: 200 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: ['rhr', 'vo2_max'],
    format: fmtMgDL,
  },
  triglycerides: {
    key: 'triglycerides',
    displayName: 'Triglycerides',
    aliases: ['TG', 'Trigs', 'Triglyceride'],
    category: 'lipids',
    unit: 'mg/dL',
    polarity: 'lower_better',
    optimalRange: { min: 40, optimal: 70, max: 100 },
    referenceRange: { min: 0, max: 149 },
    healthDomains: ['cardiovascular', 'body_composition'],
    relatedMetrics: ['body_fat_percentage', 'weight'],
    format: fmtMgDL,
  },

  // ── Vitamins ──────────────────────────────────────────────────────────────
  vitamin_d: {
    key: 'vitamin_d',
    displayName: 'Vitamin D',
    aliases: ['25-OH Vitamin D', 'Vitamin D 25-Hydroxy', '25-Hydroxyvitamin D', 'Vitamin D, 25-OH', 'Vit D'],
    category: 'vitamins',
    unit: 'ng/mL',
    polarity: 'optimal_range',
    optimalRange: { min: 50, optimal: 70, max: 90 },
    referenceRange: { min: 30, max: 100 },
    healthDomains: ['immune', 'hormonal', 'body_composition', 'cognitive'],
    relatedMetrics: ['sleep_score', 'recovery_score'],
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
    aliases: ['Serum Iron', 'Fe'],
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
    aliases: ['CRP', 'C-Reactive Protein', 'High Sensitivity CRP', 'hsCRP', 'hs CRP'],
    category: 'inflammation',
    unit: 'mg/L',
    polarity: 'lower_better',
    optimalRange: { min: 0, optimal: 0.5, max: 1.0 },
    referenceRange: { min: 0, max: 3.0 },
    healthDomains: ['immune', 'cardiovascular', 'recovery'],
    relatedMetrics: ['hrv', 'rhr'],
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
    aliases: ['Estimated GFR', 'GFR', 'Glomerular Filtration Rate', 'eGFR (CKD-EPI)'],
    category: 'kidney',
    unit: 'mL/min/1.73m2',
    polarity: 'higher_better',
    optimalRange: { min: 90, optimal: 110, max: 130 },
    referenceRange: { min: 60, max: 200 },
    healthDomains: ['cardiovascular'],
    relatedMetrics: [],
    format: fmtMlMinCr,
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
    if (words.every(word => aliasNorm.includes(word))) {
      return key
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

  const { referenceRange, optimalRange } = def

  // Check reference range bounds first
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
