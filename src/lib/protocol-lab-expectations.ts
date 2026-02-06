// Protocol-Lab Expectations Registry
// Defines expected biomarker changes per protocol, recommended lab schedules,
// and safety markers. The authoritative source for protocol-to-lab mappings.

import { normalizeProtocolName } from './supplement-normalization'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LabEffect {
  biomarkerKey: string
  displayName: string
  expectedDirection: 'increase' | 'decrease'
  magnitudeRange: { min: number; max: number } // Expected % change
  onsetWeeks: { min: number; max: number }
  peakWeeks: { min: number; max: number }
  evidenceLevel: 'clinical_trials' | 'preclinical' | 'anecdotal' | 'theoretical'
  mechanism: string
}

export interface SafetyMarker {
  biomarkerKey: string
  displayName: string
  alertThreshold: { direction: 'above' | 'below'; value: number }
  severity: 'warning' | 'critical'
  explanation: string
}

export interface LabSchedule {
  baseline: string[] // Biomarker keys to test before starting
  midpoint: { weekNumber: number; biomarkers: string[] }
  endpoint: { weekNumber: number; biomarkers: string[] }
}

export interface ProtocolLabExpectation {
  protocolName: string
  expectedLabEffects: LabEffect[]
  recommendedLabSchedule: LabSchedule
  safetyMarkers: SafetyMarker[]
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const PROTOCOL_LAB_EXPECTATIONS: Record<string, ProtocolLabExpectation> = {

  'BPC-157': {
    protocolName: 'BPC-157',
    expectedLabEffects: [
      {
        biomarkerKey: 'hs_crp',
        displayName: 'hs-CRP',
        expectedDirection: 'decrease',
        magnitudeRange: { min: 15, max: 40 },
        onsetWeeks: { min: 4, max: 8 },
        peakWeeks: { min: 8, max: 16 },
        evidenceLevel: 'preclinical',
        mechanism: 'BPC-157 modulates inflammatory pathways including TNF-alpha and prostaglandin systems, which may reduce systemic inflammation markers',
      },
    ],
    recommendedLabSchedule: {
      baseline: ['hs_crp', 'alt', 'ast', 'ggt'],
      midpoint: { weekNumber: 6, biomarkers: ['hs_crp', 'alt', 'ast'] },
      endpoint: { weekNumber: 12, biomarkers: ['hs_crp', 'alt', 'ast', 'ggt'] },
    },
    safetyMarkers: [
      {
        biomarkerKey: 'alt',
        displayName: 'ALT',
        alertThreshold: { direction: 'above', value: 60 },
        severity: 'warning',
        explanation: 'ALT elevation may indicate hepatic stress. Mild elevations (1-2x ULN) can occur with peptide use. Discuss with provider if persisting.',
      },
      {
        biomarkerKey: 'ast',
        displayName: 'AST',
        alertThreshold: { direction: 'above', value: 60 },
        severity: 'warning',
        explanation: 'AST elevation alongside ALT may indicate hepatic involvement. Isolated AST elevation may be muscular in origin.',
      },
    ],
  },

  'Ipamorelin': {
    protocolName: 'Ipamorelin',
    expectedLabEffects: [
      {
        biomarkerKey: 'igf_1',
        displayName: 'IGF-1',
        expectedDirection: 'increase',
        magnitudeRange: { min: 30, max: 80 },
        onsetWeeks: { min: 4, max: 12 },
        peakWeeks: { min: 8, max: 16 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'Ipamorelin is a selective GH secretagogue that stimulates pulsatile growth hormone release from the anterior pituitary, increasing hepatic IGF-1 production',
      },
      {
        biomarkerKey: 'fasting_glucose',
        displayName: 'Fasting Glucose',
        expectedDirection: 'increase',
        magnitudeRange: { min: 0, max: 5 },
        onsetWeeks: { min: 4, max: 8 },
        peakWeeks: { min: 8, max: 16 },
        evidenceLevel: 'preclinical',
        mechanism: 'Growth hormone has counter-regulatory effects on glucose metabolism. Mild glucose elevations reflect increased hepatic glucose output via GH-mediated insulin resistance',
      },
    ],
    recommendedLabSchedule: {
      baseline: ['igf_1', 'fasting_glucose', 'fasting_insulin', 'hba1c'],
      midpoint: { weekNumber: 8, biomarkers: ['igf_1', 'fasting_glucose', 'fasting_insulin'] },
      endpoint: { weekNumber: 16, biomarkers: ['igf_1', 'fasting_glucose', 'fasting_insulin', 'hba1c'] },
    },
    safetyMarkers: [
      {
        biomarkerKey: 'fasting_glucose',
        displayName: 'Fasting Glucose',
        alertThreshold: { direction: 'above', value: 110 },
        severity: 'warning',
        explanation: 'Fasting glucose above 110 mg/dL during GH secretagogue use may indicate impaired glucose handling. Monitor trend and consider HbA1c testing.',
      },
      {
        biomarkerKey: 'hba1c',
        displayName: 'HbA1c',
        alertThreshold: { direction: 'above', value: 5.7 },
        severity: 'warning',
        explanation: 'HbA1c at prediabetic threshold. GH secretagogues can worsen glycemic control in predisposed individuals. Discuss with provider.',
      },
    ],
  },

  'Thymosin Alpha-1': {
    protocolName: 'Thymosin Alpha-1',
    expectedLabEffects: [
      {
        biomarkerKey: 'wbc',
        displayName: 'WBC',
        expectedDirection: 'increase',
        magnitudeRange: { min: 5, max: 15 },
        onsetWeeks: { min: 6, max: 12 },
        peakWeeks: { min: 12, max: 24 },
        evidenceLevel: 'preclinical',
        mechanism: 'Thymosin Alpha-1 enhances T-cell maturation and NK cell activity, promoting normalized white blood cell counts in immunocompromised individuals',
      },
      {
        biomarkerKey: 'hs_crp',
        displayName: 'hs-CRP',
        expectedDirection: 'decrease',
        magnitudeRange: { min: 10, max: 30 },
        onsetWeeks: { min: 8, max: 16 },
        peakWeeks: { min: 16, max: 24 },
        evidenceLevel: 'preclinical',
        mechanism: 'Immune modulation via enhanced Treg function may reduce chronic low-grade inflammation',
      },
    ],
    recommendedLabSchedule: {
      baseline: ['wbc', 'hs_crp', 'lymphocyte_count'],
      midpoint: { weekNumber: 8, biomarkers: ['wbc', 'hs_crp'] },
      endpoint: { weekNumber: 16, biomarkers: ['wbc', 'hs_crp', 'lymphocyte_count'] },
    },
    safetyMarkers: [
      {
        biomarkerKey: 'wbc',
        displayName: 'WBC',
        alertThreshold: { direction: 'above', value: 11.0 },
        severity: 'warning',
        explanation: 'WBC above normal range may indicate excessive immune stimulation. This is generally transient with Thymosin Alpha-1 but should be monitored.',
      },
    ],
  },

  'Semaglutide': {
    protocolName: 'Semaglutide',
    expectedLabEffects: [
      {
        biomarkerKey: 'hba1c',
        displayName: 'HbA1c',
        expectedDirection: 'decrease',
        magnitudeRange: { min: 10, max: 30 },
        onsetWeeks: { min: 8, max: 16 },
        peakWeeks: { min: 16, max: 24 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'GLP-1 receptor agonism enhances glucose-dependent insulin secretion, reduces glucagon release, and slows gastric emptying, improving glycemic control',
      },
      {
        biomarkerKey: 'fasting_insulin',
        displayName: 'Fasting Insulin',
        expectedDirection: 'decrease',
        magnitudeRange: { min: 15, max: 40 },
        onsetWeeks: { min: 8, max: 12 },
        peakWeeks: { min: 16, max: 24 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'Improved insulin sensitivity from weight loss and reduced hepatic glucose output decreases compensatory insulin production',
      },
      {
        biomarkerKey: 'triglycerides',
        displayName: 'Triglycerides',
        expectedDirection: 'decrease',
        magnitudeRange: { min: 10, max: 25 },
        onsetWeeks: { min: 8, max: 16 },
        peakWeeks: { min: 16, max: 24 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'Weight loss and improved insulin sensitivity reduce hepatic VLDL production and triglyceride levels',
      },
      {
        biomarkerKey: 'alt',
        displayName: 'ALT',
        expectedDirection: 'decrease',
        magnitudeRange: { min: 10, max: 30 },
        onsetWeeks: { min: 12, max: 20 },
        peakWeeks: { min: 20, max: 32 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'Reduction in hepatic steatosis from weight loss and improved metabolic parameters decreases liver enzyme elevation',
      },
    ],
    recommendedLabSchedule: {
      baseline: ['hba1c', 'fasting_glucose', 'fasting_insulin', 'triglycerides', 'alt', 'lipase', 'amylase'],
      midpoint: { weekNumber: 12, biomarkers: ['hba1c', 'fasting_glucose', 'fasting_insulin', 'triglycerides', 'lipase'] },
      endpoint: { weekNumber: 24, biomarkers: ['hba1c', 'fasting_glucose', 'fasting_insulin', 'triglycerides', 'alt', 'lipase', 'amylase'] },
    },
    safetyMarkers: [
      {
        biomarkerKey: 'lipase',
        displayName: 'Lipase',
        alertThreshold: { direction: 'above', value: 180 },
        severity: 'critical',
        explanation: 'Lipase >3x ULN is a signal for possible pancreatitis. GLP-1 agonists carry a boxed warning for pancreatitis risk. Seek medical evaluation promptly.',
      },
      {
        biomarkerKey: 'amylase',
        displayName: 'Amylase',
        alertThreshold: { direction: 'above', value: 300 },
        severity: 'critical',
        explanation: 'Amylase >3x ULN alongside symptoms may indicate pancreatitis. Combined elevation with lipase is particularly concerning. Seek medical evaluation.',
      },
      {
        biomarkerKey: 'tsh',
        displayName: 'TSH',
        alertThreshold: { direction: 'above', value: 5.0 },
        severity: 'warning',
        explanation: 'GLP-1 agonists have a theoretical thyroid signal from animal studies (C-cell tumors in rodents). Elevated TSH warrants thyroid evaluation. Clinical significance in humans is uncertain.',
      },
    ],
  },

  'MK-677': {
    protocolName: 'MK-677 (Ibutamoren)',
    expectedLabEffects: [
      {
        biomarkerKey: 'igf_1',
        displayName: 'IGF-1',
        expectedDirection: 'increase',
        magnitudeRange: { min: 30, max: 60 },
        onsetWeeks: { min: 2, max: 4 },
        peakWeeks: { min: 4, max: 8 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'MK-677 is an oral ghrelin mimetic that stimulates sustained GH release, producing reliable and dose-dependent IGF-1 elevation',
      },
      {
        biomarkerKey: 'fasting_glucose',
        displayName: 'Fasting Glucose',
        expectedDirection: 'increase',
        magnitudeRange: { min: 5, max: 15 },
        onsetWeeks: { min: 2, max: 4 },
        peakWeeks: { min: 4, max: 12 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'GH-mediated hepatic insulin resistance increases fasting glucose. This effect is more pronounced with MK-677 than with peptide secretagogues due to sustained GH elevation',
      },
      {
        biomarkerKey: 'fasting_insulin',
        displayName: 'Fasting Insulin',
        expectedDirection: 'increase',
        magnitudeRange: { min: 10, max: 30 },
        onsetWeeks: { min: 2, max: 4 },
        peakWeeks: { min: 4, max: 12 },
        evidenceLevel: 'clinical_trials',
        mechanism: 'Compensatory insulin secretion in response to GH-mediated glucose elevation',
      },
    ],
    recommendedLabSchedule: {
      baseline: ['igf_1', 'fasting_glucose', 'fasting_insulin', 'hba1c', 'prolactin'],
      midpoint: { weekNumber: 4, biomarkers: ['igf_1', 'fasting_glucose', 'fasting_insulin'] },
      endpoint: { weekNumber: 8, biomarkers: ['igf_1', 'fasting_glucose', 'fasting_insulin', 'hba1c', 'prolactin'] },
    },
    safetyMarkers: [
      {
        biomarkerKey: 'fasting_glucose',
        displayName: 'Fasting Glucose',
        alertThreshold: { direction: 'above', value: 110 },
        severity: 'warning',
        explanation: 'MK-677 commonly raises fasting glucose. Values >110 mg/dL warrant monitoring. Consider dose reduction or discontinuation if >126 mg/dL.',
      },
      {
        biomarkerKey: 'hba1c',
        displayName: 'HbA1c',
        alertThreshold: { direction: 'above', value: 5.7 },
        severity: 'critical',
        explanation: 'HbA1c at prediabetic threshold during MK-677 use. This compound has a well-documented impact on glucose metabolism. Discuss with provider — may need to discontinue.',
      },
      {
        biomarkerKey: 'prolactin',
        displayName: 'Prolactin',
        alertThreshold: { direction: 'above', value: 25 },
        severity: 'warning',
        explanation: 'MK-677 can increase prolactin via ghrelin receptor cross-reactivity. Elevated prolactin may cause symptoms. Monitor and discuss with provider if >25 ng/mL.',
      },
    ],
  },

}

// ─── Alias Map (for fuzzy lookup) ────────────────────────────────────────────

const EXPECTATION_ALIASES: Record<string, string> = {
  'bpc 157': 'BPC-157',
  'bpc157': 'BPC-157',
  'bpc-157': 'BPC-157',
  'ipamorelin': 'Ipamorelin',
  'ipamorelin acetate': 'Ipamorelin',
  'ipa': 'Ipamorelin',
  'thymosin alpha 1': 'Thymosin Alpha-1',
  'thymosin alpha-1': 'Thymosin Alpha-1',
  'ta1': 'Thymosin Alpha-1',
  'ta-1': 'Thymosin Alpha-1',
  'semaglutide': 'Semaglutide',
  'ozempic': 'Semaglutide',
  'wegovy': 'Semaglutide',
  'rybelsus': 'Semaglutide',
  'mk 677': 'MK-677',
  'mk677': 'MK-677',
  'mk-677': 'MK-677',
  'ibutamoren': 'MK-677',
}

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Look up lab expectations for a protocol by name (fuzzy matching).
 */
export function getLabExpectationsForProtocol(
  protocolName: string
): ProtocolLabExpectation | null {
  // Direct key match
  if (PROTOCOL_LAB_EXPECTATIONS[protocolName]) {
    return PROTOCOL_LAB_EXPECTATIONS[protocolName]
  }

  // Alias lookup
  const normalized = protocolName.toLowerCase().replace(/[^a-z0-9+/\- ]/g, '').trim()
  const aliasKey = normalized.replace(/[^a-z0-9+ ]/g, '')
  const aliasMatch = EXPECTATION_ALIASES[aliasKey] || EXPECTATION_ALIASES[normalized]
  if (aliasMatch && PROTOCOL_LAB_EXPECTATIONS[aliasMatch]) {
    return PROTOCOL_LAB_EXPECTATIONS[aliasMatch]
  }

  // Try normalizeProtocolName from supplement-normalization
  const { canonical } = normalizeProtocolName(protocolName)
  if (PROTOCOL_LAB_EXPECTATIONS[canonical]) {
    return PROTOCOL_LAB_EXPECTATIONS[canonical]
  }

  // Partial match on registry keys
  for (const key of Object.keys(PROTOCOL_LAB_EXPECTATIONS)) {
    if (key.toLowerCase().includes(normalized) || normalized.includes(key.toLowerCase())) {
      return PROTOCOL_LAB_EXPECTATIONS[key]
    }
  }

  return null
}

/**
 * Get safety markers for a protocol.
 */
export function getSafetyMarkersForProtocol(
  protocolName: string
): SafetyMarker[] {
  const expectations = getLabExpectationsForProtocol(protocolName)
  return expectations?.safetyMarkers ?? []
}

/**
 * Get recommended lab schedule for a protocol.
 */
export function getRecommendedLabSchedule(
  protocolName: string
): LabSchedule | null {
  const expectations = getLabExpectationsForProtocol(protocolName)
  return expectations?.recommendedLabSchedule ?? null
}

/**
 * Get all biomarker keys that any protocol expects to affect.
 */
export function getAllExpectedBiomarkerKeys(): string[] {
  const keys = new Set<string>()
  for (const exp of Object.values(PROTOCOL_LAB_EXPECTATIONS)) {
    for (const effect of exp.expectedLabEffects) {
      keys.add(effect.biomarkerKey)
    }
    for (const safety of exp.safetyMarkers) {
      keys.add(safety.biomarkerKey)
    }
  }
  return Array.from(keys)
}

/**
 * Get all protocol names that have lab expectations.
 */
export function getProtocolsWithLabExpectations(): string[] {
  return Object.keys(PROTOCOL_LAB_EXPECTATIONS)
}
