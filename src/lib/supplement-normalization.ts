/**
 * Supplement & Protocol Name Normalization
 *
 * Provides fuzzy name matching, dose unit normalization, and route normalization
 * so the evidence engine and mechanism lookup always find the right protocol.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface NormalizedProtocol {
  canonical: string          // "BPC-157" — the key used in PROTOCOL_MECHANISMS
  displayName: string        // User's original input preserved for display
  normalizedDose?: { value: number; unit: 'mcg' | 'mg' | 'g' | 'iu' }
  normalizedRoute?: string   // "subcutaneous" | "oral" | "intramuscular" | "topical" | "intranasal"
}

// ─── Extended Alias Registry ────────────────────────────────────────────────────
// Covers common misspellings, abbreviations, and regional variations
// Keys are lowercase, stripped of special chars

const EXTENDED_ALIASES: Record<string, string> = {
  // BPC-157 variations
  'bpc': 'BPC-157',
  'bpc 157': 'BPC-157',
  'bpc157': 'BPC-157',
  'body protection compound': 'BPC-157',
  'body protection compound 157': 'BPC-157',
  'body protective compound': 'BPC-157',
  'pentadecapeptide': 'BPC-157',

  // TB-500 variations
  'tb500': 'TB-500',
  'tb 500': 'TB-500',
  'thymosin': 'TB-500',
  'thymosin beta': 'TB-500',
  'thymosin beta 4': 'TB-500',
  'thymosin beta-4': 'TB-500',
  'thymosin beta4': 'TB-500',
  'thymosin b4': 'TB-500',
  'tβ4': 'TB-500',

  // GHK-Cu variations
  'ghk': 'GHK-Cu',
  'ghkcu': 'GHK-Cu',
  'ghk cu': 'GHK-Cu',
  'ghk copper': 'GHK-Cu',
  'copper peptide': 'GHK-Cu',
  'copper peptide ghk': 'GHK-Cu',
  'copper tripeptide': 'GHK-Cu',

  // Semaglutide variations
  'sema': 'Semaglutide',
  'semaglutide': 'Semaglutide',
  'ozempic': 'Semaglutide',
  'wegovy': 'Semaglutide',
  'rybelsus': 'Semaglutide',

  // Tirzepatide variations
  'tirz': 'Tirzepatide',
  'tirzepatide': 'Tirzepatide',
  'mounjaro': 'Tirzepatide',
  'zepbound': 'Tirzepatide',

  // PT-141 variations
  'pt141': 'PT-141',
  'pt 141': 'PT-141',
  'vyleesi': 'PT-141',
  'bremelanotide': 'PT-141',

  // CJC-1295 variations
  'cjc': 'CJC-1295',
  'cjc1295': 'CJC-1295',
  'cjc 1295': 'CJC-1295',
  'modified grf': 'CJC-1295',
  'modified grf 129': 'CJC-1295',
  'mod grf': 'CJC-1295',
  'mod grf 129': 'CJC-1295',
  'mod grf 1-29': 'CJC-1295',

  // Ipamorelin variations
  'ipa': 'Ipamorelin',
  'ipam': 'Ipamorelin',
  'ipamorelin': 'Ipamorelin',

  // Ipamorelin + CJC-1295 combo
  'ipamorelin cjc': 'Ipamorelin + CJC-1295',
  'ipamorelin cjc 1295': 'Ipamorelin + CJC-1295',
  'ipamorelin cjc1295': 'Ipamorelin + CJC-1295',
  'ipamorelin/cjc': 'Ipamorelin + CJC-1295',
  'cjc/ipamorelin': 'Ipamorelin + CJC-1295',
  'cjc ipamorelin': 'Ipamorelin + CJC-1295',
  'ipa/cjc': 'Ipamorelin + CJC-1295',
  'cjc/ipa': 'Ipamorelin + CJC-1295',
  'ipam cjc': 'Ipamorelin + CJC-1295',

  // MK-677 variations
  'mk-677': 'MK-677',
  'mk677': 'MK-677',
  'mk 677': 'MK-677',
  'ibutamoren': 'MK-677',
  'nutrobal': 'MK-677',

  // BPC-157 + TB-500 combo ("Wolverine stack")
  'bpc-157 + tb-500': 'BPC-157 + TB-500',
  'bpc157 tb500': 'BPC-157 + TB-500',
  'bpc tb': 'BPC-157 + TB-500',
  'bpc tb combo': 'BPC-157 + TB-500',
  'wolverine': 'BPC-157 + TB-500',
  'wolverine stack': 'BPC-157 + TB-500',
  'wolverine peptide': 'BPC-157 + TB-500',

  // Semax variations
  'semax': 'Semax',
  'nasemax': 'Semax',
  'n-acetyl semax': 'Semax',
  'n acetyl semax': 'Semax',
  'na semax': 'Semax',

  // Selank variations
  'selank': 'Selank',
  'selanc': 'Selank',

  // NAD+ variations
  'nad': 'NAD+',
  'nad+': 'NAD+',
  'nad plus': 'NAD+',
  'nad precursor': 'NAD+',
  'nad+ precursor': 'NAD+',
  'nicotinamide adenine dinucleotide': 'NAD+',

  // NMN variations
  'nmn': 'NMN',
  'nicotinamide mononucleotide': 'NMN',

  // NR variations
  'nr': 'NR',
  'nicotinamide riboside': 'NR',
  'niagen': 'NR',
  'truniagen': 'NR',
  'tru niagen': 'NR',

  // Creatine variations
  'creatine': 'Creatine',
  'creatine monohydrate': 'Creatine',
  'creatine hcl': 'Creatine',
  'creapure': 'Creatine',

  // Magnesium variations
  'mag': 'Magnesium',
  'magnesium': 'Magnesium',
  'magnesium glycinate': 'Magnesium',
  'mag glycinate': 'Magnesium',
  'magnesium threonate': 'Magnesium',
  'mag threonate': 'Magnesium',
  'magtein': 'Magnesium',
  'magnesium bisglycinate': 'Magnesium',
  'mag bisgly': 'Magnesium',
  'magnesium citrate': 'Magnesium',
  'magnesium oxide': 'Magnesium',
  'magnesium taurate': 'Magnesium',
  'magnesium l threonate': 'Magnesium',

  // Vitamin D variations
  'vitamin d': 'Vitamin D',
  'vitamin d3': 'Vitamin D',
  'vit d': 'Vitamin D',
  'vit d3': 'Vitamin D',
  'd3': 'Vitamin D',
  'cholecalciferol': 'Vitamin D',

  // Ashwagandha variations
  'ashwagandha': 'Ashwagandha',
  'ksm-66': 'Ashwagandha',
  'ksm66': 'Ashwagandha',
  'ksm 66': 'Ashwagandha',
  'sensoril': 'Ashwagandha',
  'withania somnifera': 'Ashwagandha',
  'withania': 'Ashwagandha',

  // Omega-3 variations
  'omega 3': 'Omega-3',
  'omega3': 'Omega-3',
  'fish oil': 'Omega-3',
  'epa': 'Omega-3',
  'dha': 'Omega-3',
  'epa/dha': 'Omega-3',
  'epa dha': 'Omega-3',
  'krill oil': 'Omega-3',
  'algal oil': 'Omega-3',
}

// ─── Route Normalization ────────────────────────────────────────────────────────

const ROUTE_ALIASES: Record<string, string> = {
  // Subcutaneous
  'subcutaneous': 'subcutaneous',
  'subq': 'subcutaneous',
  'sub q': 'subcutaneous',
  'sub-q': 'subcutaneous',
  'sq': 'subcutaneous',
  'sc': 'subcutaneous',
  'subcut': 'subcutaneous',
  'sub cut': 'subcutaneous',
  'sub-cut': 'subcutaneous',
  'injection': 'subcutaneous',

  // Intramuscular
  'intramuscular': 'intramuscular',
  'im': 'intramuscular',
  'i.m.': 'intramuscular',
  'i.m': 'intramuscular',

  // Oral
  'oral': 'oral',
  'po': 'oral',
  'by mouth': 'oral',
  'pill': 'oral',
  'capsule': 'oral',
  'tablet': 'oral',
  'sublingual': 'sublingual',

  // Topical
  'topical': 'topical',
  'cream': 'topical',
  'patch': 'topical',
  'transdermal': 'topical',

  // Intranasal
  'intranasal': 'intranasal',
  'nasal': 'intranasal',
  'nasal spray': 'intranasal',
  'spray': 'intranasal',

  // Intravenous
  'intravenous': 'intravenous',
  'iv': 'intravenous',
  'i.v.': 'intravenous',
  'i.v': 'intravenous',
  'infusion': 'intravenous',
  'drip': 'intravenous',
}

// ─── Dose Unit Normalization ────────────────────────────────────────────────────

const DOSE_UNIT_MAP: Record<string, { unit: 'mcg' | 'mg' | 'g' | 'iu'; multiplier: number }> = {
  'mcg': { unit: 'mcg', multiplier: 1 },
  'μg': { unit: 'mcg', multiplier: 1 },
  'ug': { unit: 'mcg', multiplier: 1 },
  'microgram': { unit: 'mcg', multiplier: 1 },
  'micrograms': { unit: 'mcg', multiplier: 1 },

  'mg': { unit: 'mg', multiplier: 1 },
  'milligram': { unit: 'mg', multiplier: 1 },
  'milligrams': { unit: 'mg', multiplier: 1 },

  'g': { unit: 'g', multiplier: 1 },
  'gram': { unit: 'g', multiplier: 1 },
  'grams': { unit: 'g', multiplier: 1 },

  'iu': { unit: 'iu', multiplier: 1 },
  'ius': { unit: 'iu', multiplier: 1 },
  'international unit': { unit: 'iu', multiplier: 1 },
  'international units': { unit: 'iu', multiplier: 1 },
}

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Normalize a protocol/supplement name to its canonical form.
 * Handles common misspellings, abbreviations, and variations.
 */
export function normalizeProtocolName(input: string): NormalizedProtocol {
  const trimmed = input.trim()
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9+/\- ]/g, '').trim()

  // Try exact alias match first (most common path)
  const aliasKey = normalized.replace(/[^a-z0-9+ ]/g, '')
  const aliasMatch = EXTENDED_ALIASES[aliasKey] || EXTENDED_ALIASES[normalized]
  if (aliasMatch) {
    return { canonical: aliasMatch, displayName: trimmed }
  }

  // Try without spaces/hyphens
  const stripped = normalized.replace(/[\s\-]/g, '')
  for (const [key, canonical] of Object.entries(EXTENDED_ALIASES)) {
    if (key.replace(/[\s\-]/g, '') === stripped) {
      return { canonical, displayName: trimmed }
    }
  }

  // Fuzzy substring match — check if input contains or is contained by a known alias
  for (const [key, canonical] of Object.entries(EXTENDED_ALIASES)) {
    const keyStripped = key.replace(/[\s\-]/g, '')
    if (stripped.includes(keyStripped) || keyStripped.includes(stripped)) {
      return { canonical, displayName: trimmed }
    }
  }

  // No match — return input as-is
  return { canonical: trimmed, displayName: trimmed }
}

/**
 * Normalize dose value and unit to a standard form.
 * Handles unit variations (mcg, μg, ug) and conversions.
 */
export function normalizeDoseUnit(
  value: number,
  unit: string
): { value: number; unit: 'mcg' | 'mg' | 'g' | 'iu' } {
  const normalized = unit.toLowerCase().trim()
  const mapping = DOSE_UNIT_MAP[normalized]

  if (mapping) {
    return { value: value * mapping.multiplier, unit: mapping.unit }
  }

  // Default to mg if unrecognized
  return { value, unit: 'mg' }
}

/**
 * Normalize administration route to a standard form.
 * Handles abbreviations (sub-q, SQ, IM) and colloquial terms (injection, pill).
 */
export function normalizeRoute(input: string): string {
  const normalized = input.toLowerCase().trim()
  return ROUTE_ALIASES[normalized] || normalized
}
