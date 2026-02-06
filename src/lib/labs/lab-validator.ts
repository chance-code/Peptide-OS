// Lab Validator — Unit Detection, Conversion, and Sanity Checking
// Ensures all parsed biomarker values are in canonical units and within physiological bounds

import {
  BIOMARKER_REGISTRY,
  type BiomarkerDefinition,
  type BiomarkerFlag,
  computeFlag,
} from '@/lib/lab-biomarker-contract'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  value: number              // Value in canonical unit
  unit: string               // Canonical unit
  originalValue?: number     // Pre-conversion value
  originalUnit?: string      // Pre-conversion unit
  converted: boolean         // Whether unit conversion was applied
  flag: BiomarkerFlag
  warning?: string
  critical?: boolean
  confidence: number         // 0-1 confidence in the parsed value
}

export interface DerivedCalculation {
  key: string
  displayName: string
  value: number
  unit: string
  flag: BiomarkerFlag
  formula: string
}

// ─── Unit Normalization ─────────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, string> = {
  // Case/formatting normalization
  'ng/dl': 'ng/dL',
  'ng/DL': 'ng/dL',
  'pg/ml': 'pg/mL',
  'pg/ML': 'pg/mL',
  'ng/ml': 'ng/mL',
  'ng/ML': 'ng/mL',
  'mg/dl': 'mg/dL',
  'mg/DL': 'mg/dL',
  'mg/l': 'mg/L',
  'mg/L': 'mg/L',
  'ug/dl': 'ug/dL',
  'ug/DL': 'ug/dL',
  'ug/l': 'ug/L',
  'µg/dL': 'ug/dL',
  'µg/L': 'ug/L',
  'µg/mL': 'ug/mL',
  'uiu/ml': 'uIU/mL',
  'uIU/ML': 'uIU/mL',
  'µIU/mL': 'uIU/mL',
  'miu/l': 'mIU/L',
  'mIU/l': 'mIU/L',
  'miu/ml': 'mIU/mL',
  'mIU/ML': 'mIU/mL',
  'umol/l': 'umol/L',
  'µmol/L': 'umol/L',
  'nmol/l': 'nmol/L',
  'iu/ml': 'IU/mL',
  'IU/ML': 'IU/mL',
  'u/l': 'U/L',
  'U/l': 'U/L',
  'g/dl': 'g/dL',
  'g/DL': 'g/dL',
  'pg/dl': 'pg/dL',
  'pg/DL': 'pg/dL',
  'ml/min/1.73m2': 'mL/min/1.73m2',
  'mL/min/1.73m²': 'mL/min/1.73m2',
  'mm/h': 'mm/hr',
  'mm/hour': 'mm/hr',
  '10³/µL': '10^3/uL',
  '10³/uL': '10^3/uL',
  'x10E3/uL': '10^3/uL',
  'K/uL': '10^3/uL',
  '10⁶/µL': '10^6/uL',
  '10⁶/uL': '10^6/uL',
  'x10E6/uL': '10^6/uL',
  'M/uL': '10^6/uL',
  'fl': 'fL',
  'FL': 'fL',
  // Quest Diagnostics unit names
  'mcg/dL': 'ug/dL',
  'mcg/L': 'ug/L',
  'mcg/mL': 'ug/mL',
  'Thousand/uL': '10^3/uL',
  'Thousand /uL': '10^3/uL',
  'Million/uL': '10^6/uL',
  '% by wt': '%',
}

/**
 * Normalize a raw unit string to its canonical form.
 */
export function normalizeUnit(rawUnit: string): string {
  const trimmed = rawUnit.trim()
  return UNIT_ALIASES[trimmed] ?? trimmed
}

// ─── Unit Conversion ────────────────────────────────────────────────────────

interface ConversionRule {
  fromUnit: string
  toUnit: string
  convert: (v: number) => number
}

// Specific conversion rules beyond simple multiplication factors
const CONVERSION_RULES: ConversionRule[] = [
  // HbA1c: mmol/mol → % (IFCC → NGSP)
  { fromUnit: 'mmol/mol', toUnit: '%', convert: (v) => (v / 10.929) + 2.15 },
  // HbA1c: % → mmol/mol (NGSP → IFCC)
  { fromUnit: '%_hba1c_reverse', toUnit: 'mmol/mol', convert: (v) => (v - 2.15) * 10.929 },

  // Glucose: mmol/L → mg/dL
  { fromUnit: 'mmol/L_glucose', toUnit: 'mg/dL', convert: (v) => v * 18.018 },

  // Vitamin D: nmol/L → ng/mL
  { fromUnit: 'nmol/L_vitd', toUnit: 'ng/mL', convert: (v) => v * 0.4006 },

  // Cholesterol (total, LDL, HDL): mmol/L → mg/dL
  { fromUnit: 'mmol/L_chol', toUnit: 'mg/dL', convert: (v) => v * 38.67 },

  // Triglycerides: mmol/L → mg/dL
  { fromUnit: 'mmol/L_trig', toUnit: 'mg/dL', convert: (v) => v * 88.57 },

  // Creatinine: µmol/L → mg/dL
  { fromUnit: 'umol/L_creat', toUnit: 'mg/dL', convert: (v) => v * 0.0113 },

  // Testosterone: nmol/L → ng/dL
  { fromUnit: 'nmol/L_test', toUnit: 'ng/dL', convert: (v) => v * 28.818 },
]

/**
 * Detect if a value likely came in a non-canonical unit and needs conversion.
 * Uses heuristics based on the biomarker's absolute bounds.
 */
export function detectAndConvertUnit(
  biomarkerKey: string,
  value: number,
  rawUnit: string
): { value: number; unit: string; converted: boolean; originalValue?: number; originalUnit?: string } {
  const def = BIOMARKER_REGISTRY[biomarkerKey]
  if (!def) return { value, unit: rawUnit, converted: false }

  const canonicalUnit = normalizeUnit(def.unit)
  const normalizedRawUnit = normalizeUnit(rawUnit)

  // If units already match, no conversion needed
  if (normalizedRawUnit === canonicalUnit) {
    return { value, unit: canonicalUnit, converted: false }
  }

  // Check the registry's unitAliases for a simple multiplication factor
  if (def.unitAliases) {
    for (const [altUnit, factor] of Object.entries(def.unitAliases)) {
      if (normalizedRawUnit.toLowerCase() === altUnit.toLowerCase()) {
        return {
          value: value * factor,
          unit: canonicalUnit,
          converted: true,
          originalValue: value,
          originalUnit: normalizedRawUnit,
        }
      }
    }
  }

  // Special case: HbA1c in mmol/mol (value typically 20-120)
  if (biomarkerKey === 'hba1c' && value > 15) {
    const convertedValue = (value / 10.929) + 2.15
    return {
      value: convertedValue,
      unit: '%',
      converted: true,
      originalValue: value,
      originalUnit: 'mmol/mol',
    }
  }

  // Special case: Glucose in mmol/L (value typically 2-30)
  if (biomarkerKey === 'fasting_glucose' && value < 30) {
    const convertedValue = value * 18.018
    return {
      value: convertedValue,
      unit: 'mg/dL',
      converted: true,
      originalValue: value,
      originalUnit: 'mmol/L',
    }
  }

  // Special case: Vitamin D in nmol/L (value typically 25-250)
  if (biomarkerKey === 'vitamin_d' && value > 100) {
    const convertedValue = value * 0.4006
    return {
      value: convertedValue,
      unit: 'ng/mL',
      converted: true,
      originalValue: value,
      originalUnit: 'nmol/L',
    }
  }

  // Special case: Testosterone in nmol/L (male value typically 8-35)
  if (biomarkerKey === 'total_testosterone' && value < 50) {
    const convertedValue = value * 28.818
    return {
      value: convertedValue,
      unit: 'ng/dL',
      converted: true,
      originalValue: value,
      originalUnit: 'nmol/L',
    }
  }

  // No conversion found — return as-is with the raw unit
  return { value, unit: normalizedRawUnit, converted: false }
}

// ─── Value Validation ───────────────────────────────────────────────────────

/**
 * Validate a biomarker value against its absolute bounds and compute flags.
 */
export function validateBiomarkerValue(
  biomarkerKey: string,
  value: number,
  rawUnit: string
): ValidationResult {
  const def = BIOMARKER_REGISTRY[biomarkerKey]

  if (!def) {
    return {
      valid: true,
      value,
      unit: normalizeUnit(rawUnit),
      converted: false,
      flag: 'normal',
      confidence: 0.5,
    }
  }

  // Step 1: Detect and convert units
  const conversion = detectAndConvertUnit(biomarkerKey, value, rawUnit)
  const finalValue = conversion.value
  const finalUnit = conversion.unit

  // Step 2: Check absolute bounds (parsing error detection)
  if (def.absoluteBounds) {
    if (finalValue < def.absoluteBounds.min || finalValue > def.absoluteBounds.max) {
      return {
        valid: false,
        value: finalValue,
        unit: finalUnit,
        originalValue: conversion.originalValue,
        originalUnit: conversion.originalUnit,
        converted: conversion.converted,
        flag: 'normal',
        warning: `Value ${finalValue} ${finalUnit} is outside absolute bounds [${def.absoluteBounds.min}–${def.absoluteBounds.max}] for ${def.displayName}. Likely a parsing or unit error.`,
        confidence: 0.1,
      }
    }
  }

  // Step 3: Compute flag
  const flag = computeFlag(biomarkerKey, finalValue)
  const critical = flag === 'critical_low' || flag === 'critical_high'

  // Step 4: Compute confidence
  let confidence = 1.0
  if (conversion.converted) confidence *= 0.85  // Unit conversion adds uncertainty
  if (!def.absoluteBounds) confidence *= 0.9    // No absolute bounds to validate against

  return {
    valid: true,
    value: finalValue,
    unit: finalUnit,
    originalValue: conversion.originalValue,
    originalUnit: conversion.originalUnit,
    converted: conversion.converted,
    flag,
    critical,
    confidence,
    warning: critical ? `${def.displayName} at ${def.format(finalValue)} is at a critical level` : undefined,
  }
}

// ─── Derived Calculations ───────────────────────────────────────────────────

/**
 * Calculate HOMA-IR from fasting glucose and fasting insulin.
 * HOMA-IR = (Glucose mg/dL × Insulin µIU/mL) / 405
 * MUST be calculated, never parsed from PDF.
 */
export function computeHomaIR(
  fastingGlucose: number | undefined,
  fastingInsulin: number | undefined
): DerivedCalculation | null {
  if (fastingGlucose === undefined || fastingInsulin === undefined) return null
  if (fastingGlucose <= 0 || fastingInsulin <= 0) return null

  const value = (fastingGlucose * fastingInsulin) / 405
  return {
    key: 'homa_ir',
    displayName: 'HOMA-IR',
    value: Math.round(value * 100) / 100,
    unit: 'ratio',
    flag: computeFlag('homa_ir', value),
    formula: `(${fastingGlucose} × ${fastingInsulin}) / 405`,
  }
}

/**
 * Calculate Non-HDL Cholesterol from total cholesterol and HDL.
 * Non-HDL = Total Cholesterol - HDL
 */
export function computeNonHDL(
  totalCholesterol: number | undefined,
  hdl: number | undefined
): DerivedCalculation | null {
  if (totalCholesterol === undefined || hdl === undefined) return null

  const value = totalCholesterol - hdl
  return {
    key: 'non_hdl_cholesterol',
    displayName: 'Non-HDL Cholesterol',
    value: Math.round(value),
    unit: 'mg/dL',
    flag: computeFlag('non_hdl_cholesterol', value),
    formula: `${totalCholesterol} - ${hdl}`,
  }
}

/**
 * Calculate Triglyceride/HDL ratio — a strong insulin resistance marker.
 * TG/HDL ratio > 2.0 is a red flag even when individual values look normal.
 */
export function computeTrigHDLRatio(
  triglycerides: number | undefined,
  hdl: number | undefined
): DerivedCalculation | null {
  if (triglycerides === undefined || hdl === undefined || hdl === 0) return null

  const value = triglycerides / hdl
  const flag: BiomarkerFlag = value < 1.5 ? 'optimal' : value < 2.0 ? 'normal' : value < 3.5 ? 'high' : 'critical_high'
  return {
    key: 'trig_hdl_ratio',
    displayName: 'Triglyceride/HDL Ratio',
    value: Math.round(value * 100) / 100,
    unit: 'ratio',
    flag,
    formula: `${triglycerides} / ${hdl}`,
  }
}

/**
 * Calculate Free T3 / Reverse T3 ratio.
 * Ratio < 0.2 indicates poor T4-to-T3 conversion.
 */
export function computeFreeT3RT3Ratio(
  freeT3: number | undefined,
  reverseT3: number | undefined
): DerivedCalculation | null {
  if (freeT3 === undefined || reverseT3 === undefined || reverseT3 === 0) return null

  // Free T3 in pg/mL, Reverse T3 in ng/dL
  // Need to convert Free T3 from pg/mL to the same relative scale
  const value = freeT3 / reverseT3
  const flag: BiomarkerFlag = value >= 0.2 ? 'optimal' : value >= 0.15 ? 'normal' : 'low'
  return {
    key: 'free_t3_rt3_ratio',
    displayName: 'Free T3/Reverse T3 Ratio',
    value: Math.round(value * 1000) / 1000,
    unit: 'ratio',
    flag,
    formula: `${freeT3} / ${reverseT3}`,
  }
}

/**
 * Run all derived calculations from a set of biomarker values.
 */
export function computeAllDerived(
  values: Record<string, number>
): DerivedCalculation[] {
  const results: DerivedCalculation[] = []

  const homaIR = computeHomaIR(values['fasting_glucose'], values['fasting_insulin'])
  if (homaIR) results.push(homaIR)

  const nonHDL = computeNonHDL(values['total_cholesterol'], values['hdl_cholesterol'])
  if (nonHDL) results.push(nonHDL)

  const trigHDL = computeTrigHDLRatio(values['triglycerides'], values['hdl_cholesterol'])
  if (trigHDL) results.push(trigHDL)

  const t3rt3 = computeFreeT3RT3Ratio(values['free_t3'], values['reverse_t3'])
  if (t3rt3) results.push(t3rt3)

  return results
}

// ─── Categorical Value Handling ─────────────────────────────────────────────

const CATEGORICAL_POSITIVE = ['positive', 'reactive', 'detected', 'abnormal', 'present', 'yes']
const CATEGORICAL_NEGATIVE = ['negative', 'non-reactive', 'nonreactive', 'not detected', 'normal', 'absent', 'no', 'none']

/**
 * Parse a categorical lab result (e.g., ANA: "Positive") to a numeric value.
 * Returns 1 for positive, 0 for negative, null if unrecognized.
 */
export function parseCategoricalValue(rawValue: string): number | null {
  const lower = rawValue.toLowerCase().trim()
  if (CATEGORICAL_NEGATIVE.some(neg => lower.includes(neg))) return 0
  if (CATEGORICAL_POSITIVE.some(pos => lower.includes(pos))) return 1
  return null
}

/**
 * Parse a below-detection-limit value (e.g., "<0.5").
 * Returns the limit value with a flag.
 */
export function parseBelowDetectionLimit(rawValue: string): { value: number; belowLimit: boolean } | null {
  const match = rawValue.trim().match(/^<\s*([\d.]+)/)
  if (match) {
    return { value: parseFloat(match[1]), belowLimit: true }
  }
  return null
}

/**
 * Parse an above-detection-limit value (e.g., ">200").
 */
export function parseAboveDetectionLimit(rawValue: string): { value: number; aboveLimit: boolean } | null {
  const match = rawValue.trim().match(/^>\s*([\d.]+)/)
  if (match) {
    return { value: parseFloat(match[1]), aboveLimit: true }
  }
  return null
}
