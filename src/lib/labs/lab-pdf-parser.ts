// Lab PDF Parser — Quest Diagnostics / Health Gorilla PDF format
// Extracts biomarker data from Function Health lab result PDFs

import {
  normalizeBiomarkerName,
  getBiomarker,
  BIOMARKER_REGISTRY,
  type BiomarkerFlag,
} from '@/lib/lab-biomarker-contract'
import {
  validateBiomarkerValue,
  computeAllDerived,
  parseCategoricalValue,
  parseBelowDetectionLimit,
} from '@/lib/labs/lab-validator'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedBiomarker {
  rawName: string
  normalizedKey: string | null
  displayName: string
  value: number
  unit: string
  rangeLow?: number
  rangeHigh?: number
  flag: BiomarkerFlag
  confidence: number
  converted: boolean
  originalValue?: number
  originalUnit?: string
  category?: string
}

export interface ParseResult {
  testDate: Date | null
  labName: string | null
  markers: ParsedBiomarker[]
  rawText: string
  parseWarnings: string[]
  overallConfidence: number
}

interface ParsedLine {
  name: string
  value: string       // raw value string (may be "<1.0")
  flag?: 'H' | 'L'
  rangeLow?: string
  rangeHigh?: string
  unit: string
  categorical?: boolean
}

// ─── Preprocessing ──────────────────────────────────────────────────────────

const NOISE_PATTERNS = [
  /^Printed from Health Gorilla/i,
  /^https?:\/\//,
  /^The contents of this/i,
  /^contain information/i,
  /^intended recipient/i,
  /^or obtained this/i,
  /^privacy@/i,
  /^-- \d+ of \d+ --$/,
  /^Page \d+ of \d+$/,
  /^PATIENT INFORMATION/,
  /^Phone \(H\)/,
  /^DOB:/,
  /^Gender:/,
  /^Patient ID:/,
  /^STATUS:/,
  /^Source:/,
  /^Time Reported:/,
  /^Accession$/,
  /^Number:$/,
  /^Lab Ref/,
  /^ORDERING PHYSICIAN/,
  /^Test In Range Out Of Range/,
  /^D\.O\.$/,
  /^\d+ Congress/,
  /^Floor \d+/,
  /^Austin, TX/,
  /^\d+-\d+-\d+$/,        // phone numbers
  /^\(Note\)/,             // Quest lab notes
  /^Page \d+/i,            // page headers in various formats
]

/**
 * Preprocess raw Quest Diagnostics PDF text into clean single-line entries.
 */
function preprocessQuestText(rawText: string): string[] {
  const lines = rawText.split('\n')
  const cleaned: string[] = []

  // Step 1: Filter obvious noise
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (NOISE_PATTERNS.some(p => p.test(trimmed))) continue
    cleaned.push(trimmed)
  }

  // Step 2: Join continuation lines
  const joined: string[] = []
  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i]

    // Check if this line is a continuation of the previous
    const isContinuation =
      // Starts with / (unit continuation like /uL, /HPF, /LPF)
      /^\/[a-zA-Z]/.test(line) ||
      // Starts with (calc)
      /^\(calc\)/.test(line) ||
      // Just a 2-4 char lab code (all uppercase/digits)
      /^[A-Z0-9]{2,4}$/.test(line) ||
      // Unit continuation like "73m2"
      /^\d+m\d/.test(line)

    if (isContinuation && joined.length > 0) {
      // Join without space for numeric continuations (e.g., "1." + "73m2" → "1.73m2")
      const separator = /^\d+m\d/.test(line) ? '' : ' '
      joined[joined.length - 1] += separator + line
    } else {
      joined.push(line)
    }
  }

  // Step 3: Join multiline biomarker names
  // Some Quest entries split names across 2-3 lines before the value line:
  //   "SEX HORMONE BINDING" / "GLOBULIN" / "40 10-50 nmol/L KS"
  //   "THYROID PEROXIDASE" / "ANTIBODIES" / "2 <9 IU/mL CB"
  const isNameLine = (l: string) => /^[A-Z][A-Z\s,\-\/]+$/.test(l) && !l.includes('Collected:')
  const isValueLine = (l: string) => /^\d|^<\d/.test(l.trim())

  const result: string[] = []
  for (let i = 0; i < joined.length; i++) {
    const line = joined[i]

    // 3-line join: two name lines + value line
    if (
      isNameLine(line) &&
      i + 2 < joined.length &&
      isNameLine(joined[i + 1]) &&
      isValueLine(joined[i + 2])
    ) {
      result.push(line + ' ' + joined[i + 1] + ' ' + joined[i + 2])
      i += 2
      continue
    }

    // 2-line join: one name line + value line
    if (
      isNameLine(line) &&
      i + 1 < joined.length &&
      isValueLine(joined[i + 1])
    ) {
      result.push(line + ' ' + joined[i + 1])
      i++
      continue
    }

    result.push(line)
  }

  return result
}

// ─── Line Parsing ───────────────────────────────────────────────────────────

// Lab code pattern: 2-4 uppercase chars/digits at end of line
const LAB_CODE = /\s+[A-Z0-9]{2,4}$/

/**
 * Strip the lab code from the end of a line and optional (calc) marker.
 */
function stripTrailing(line: string): string {
  return line
    .replace(LAB_CODE, '')
    .replace(/\s+\(calc\)\s*$/, '')
    .replace(/\s+\(Note\).*$/, '')
    .trim()
}

/**
 * Try to parse a single line as a Quest Diagnostics biomarker result.
 */
function parseQuestLine(rawLine: string): ParsedLine | null {
  // Must have a lab code at the end to be a result line
  if (!LAB_CODE.test(rawLine)) return null

  // Skip section headers (contain "Collected:")
  if (rawLine.includes('Collected:')) return null

  // Skip obviously non-biomarker lines
  if (rawLine.startsWith('Reference') || rawLine.startsWith('Risk:') || rawLine.startsWith('Optimal')) return null

  const line = stripTrailing(rawLine)
  if (!line) return null

  let match: RegExpMatchArray | null

  // Pattern 1: Below-detection with "< or =" range
  // e.g., "THYROGLOBULIN ANTIBODIES <1 < or = 1 IU/mL"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+<([\d.]+)\s+<\s*(?:or|OR)\s*=\s*([\d.]+)\s+(.+)$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: '<' + match[2],
      rangeHigh: match[3],
      unit: match[4].trim(),
    }
  }

  // Pattern 2: Below-detection with "<threshold" range
  // e.g., "LEAD (VENOUS) <1.0 <3.5 mcg/dL"
  // e.g., "RHEUMATOID FACTOR <10 <14 IU/mL"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+<([\d.]+)\s+<([\d.]+)\s+(.+)$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: '<' + match[2],
      rangeHigh: match[3],
      unit: match[4].trim(),
    }
  }

  // Pattern 3: Below-detection with "<=threshold" range
  // e.g., "MERCURY, BLOOD <4 <=10 mcg/L"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+<([\d.]+)\s+<=([\d.]+)\s+(.+)$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: '<' + match[2],
      rangeHigh: match[3],
      unit: match[4].trim(),
    }
  }

  // Pattern 4: Standard numeric range with optional H/L flag
  // e.g., "IRON, TOTAL 176 50-180 mcg/dL"
  // e.g., "CREATININE 1.33 H 0.60-1.29 mg/dL"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+(?:(H|L)\s+)?([\d.]+)-([\d.]+)\s+(.+)$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: match[2],
      flag: match[3] as 'H' | 'L' | undefined,
      rangeLow: match[4],
      rangeHigh: match[5],
      unit: match[6].trim(),
    }
  }

  // Pattern 5: Less-than reference range
  // e.g., "CHOLESTEROL, TOTAL 169 <200 mg/dL"
  // e.g., "LDL PARTICLE NUMBER 1308 H <1138 nmol/L"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+(?:(H|L)\s+)?<([\d.]+)\s+(.+)$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: match[2],
      flag: match[3] as 'H' | 'L' | undefined,
      rangeHigh: match[4],
      unit: match[5].trim(),
    }
  }

  // Pattern 6: "> OR =" or "< OR =" reference range
  // e.g., "HDL CHOLESTEROL 50 > OR = 40 mg/dL"
  // e.g., "ESTRADIOL 58 H < OR = 39 pg/mL"
  // e.g., "EGFR 68 > OR = 60 mL/min/1.73m2"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+(?:(H|L)\s+)?([<>])\s*(?:OR|or)\s*=\s*([\d.]+)\s+(.+)$/
  )
  if (match) {
    const operator = match[4]
    const threshold = match[5]
    return {
      name: match[1].trim(),
      value: match[2],
      flag: match[3] as 'H' | 'L' | undefined,
      rangeLow: operator === '>' ? threshold : undefined,
      rangeHigh: operator === '<' ? threshold : undefined,
      unit: match[6].trim(),
    }
  }

  // Pattern 7: ">" or "<" reference (shorthand without "OR =")
  // e.g., "EPA+DPA+DHA 4.6 L >5.4 % by wt"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+(?:(H|L)\s+)?([<>])([\d.]+)\s+(.+)$/
  )
  if (match) {
    const operator = match[4]
    const threshold = match[5]
    return {
      name: match[1].trim(),
      value: match[2],
      flag: match[3] as 'H' | 'L' | undefined,
      rangeLow: operator === '>' ? threshold : undefined,
      rangeHigh: operator === '<' ? threshold : undefined,
      unit: match[6].trim(),
    }
  }

  // Pattern 8: Value with H/L flag + unit but NO reference range
  // e.g., "LDL-CHOLESTEROL 101 H mg/dL"
  // Must come before Pattern 9 to avoid "H mg/dL" being captured as unit
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+(H|L)\s+([a-zA-Z%][a-zA-Z0-9%\/.\s]*?)$/
  )
  if (match) {
    const possibleUnit = match[4].trim()
    if (possibleUnit.length <= 20 && /[a-zA-Z]/.test(possibleUnit)) {
      return {
        name: match[1].trim(),
        value: match[2],
        flag: match[3] as 'H' | 'L',
        unit: possibleUnit,
      }
    }
  }

  // Pattern 9: Value + unit only (no range on same line)
  // e.g., "APOLIPOPROTEIN B 82 mg/dL"
  // e.g., "HS CRP 0.2 mg/L"
  // e.g., "INSULIN 4.7 uIU/mL"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+([a-zA-Z%][a-zA-Z0-9%\/.\s]*?)$/
  )
  if (match) {
    // Verify the "unit" looks like a real unit, not just random text
    const possibleUnit = match[3].trim()
    if (possibleUnit.length <= 20 && /[a-zA-Z]/.test(possibleUnit)) {
      return {
        name: match[1].trim(),
        value: match[2],
        unit: possibleUnit,
      }
    }
  }

  // Pattern 10: Categorical result
  // e.g., "ANA SCREEN, IFA NEGATIVE NEGATIVE"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+(NEGATIVE|POSITIVE|REACTIVE|NON-REACTIVE|NONE SEEN|TRACE\s*\w*)\s+(NEGATIVE|POSITIVE|NONE SEEN)$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: match[2].trim(),
      unit: 'pos/neg',
      categorical: true,
    }
  }

  // Pattern 11: Percentage-only results (no unit word)
  // e.g., "NEUTROPHILS 60 %"
  match = line.match(
    /^([A-Za-z%][A-Za-z0-9,\s\-\+\(\)\/\.']+?)\s+([\d.]+)\s+%$/
  )
  if (match) {
    return {
      name: match[1].trim(),
      value: match[2],
      unit: '%',
    }
  }

  return null
}

// ─── Date & Lab Extraction ──────────────────────────────────────────────────

function extractTestDate(text: string): Date | null {
  const patterns = [
    // Quest/Health Gorilla: "Collection Date: 12/04/2025 01:58 PM"
    /Collection\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    // ISO format
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\d{4}-\d{2}-\d{2})/i,
    // Named month: "January 15, 2026"
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    // General date pattern
    /(?:date[:\s]+)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const d = new Date(match[1])
      if (!isNaN(d.getTime())) return d
    }
  }
  return null
}

function extractLabName(text: string): string {
  if (/Quest\s*Diagnostics/i.test(text)) return 'Quest Diagnostics (Function Health)'
  if (/Function\s*Health/i.test(text)) return 'Function Health'
  if (/Health\s*Gorilla/i.test(text)) return 'Health Gorilla'

  const patterns = [
    /(?:laboratory|lab)[:\s]+([^\n]+)/i,
    /(?:performed\s+(?:by|at))[:\s]+([^\n]+)/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) return match[1].trim()
  }
  return 'Function Health'
}

// ─── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Quest Diagnostics / Health Gorilla PDF into structured biomarker data.
 */
export function parseQuestPDF(rawText: string): ParseResult {
  const markers: ParsedBiomarker[] = []
  const warnings: string[] = []
  const processedKeys = new Set<string>()
  const processedNames = new Set<string>()

  // Extract metadata
  const testDate = extractTestDate(rawText)
  const labName = extractLabName(rawText)

  // Preprocess text
  const lines = preprocessQuestText(rawText)

  // Parse each line
  for (const line of lines) {
    const parsed = parseQuestLine(line)
    if (!parsed) continue

    const cleanName = parsed.name.replace(/\s+/g, ' ').trim()
    const nameLower = cleanName.toLowerCase()

    // Skip if we already processed this exact name
    if (processedNames.has(nameLower)) continue
    processedNames.add(nameLower)

    // Handle categorical values
    if (parsed.categorical) {
      const catValue = parseCategoricalValue(parsed.value)
      if (catValue === null) continue

      const normalizedKey = normalizeBiomarkerName(cleanName)
      if (!normalizedKey) {
        // Skip unrecognized categorical markers (urinalysis, etc.)
        continue
      }

      // Skip if we already have this key
      if (processedKeys.has(normalizedKey)) continue
      processedKeys.add(normalizedKey)

      const biomarker = getBiomarker(normalizedKey)
      markers.push({
        rawName: cleanName,
        normalizedKey,
        displayName: biomarker?.displayName ?? cleanName,
        value: catValue,
        unit: 'pos/neg',
        flag: catValue === 1 ? 'high' : 'normal',
        confidence: 0.9,
        converted: false,
        category: biomarker?.category,
      })
      continue
    }

    // Handle numeric/below-detection values
    let numericValue: number
    let belowDetection = false
    const belowLimit = parseBelowDetectionLimit(parsed.value)

    if (belowLimit) {
      numericValue = belowLimit.value
      belowDetection = true
    } else {
      numericValue = parseFloat(parsed.value)
      if (isNaN(numericValue)) {
        warnings.push(`Could not parse value for ${cleanName}: "${parsed.value}"`)
        continue
      }
    }

    // Normalize biomarker name
    const normalizedKey = normalizeBiomarkerName(cleanName)

    // Skip if we already have this canonical key
    if (normalizedKey && processedKeys.has(normalizedKey)) continue
    if (normalizedKey) processedKeys.add(normalizedKey)

    let displayName = cleanName
    let flag: BiomarkerFlag = 'normal'
    let confidence = 0.7
    let converted = false
    let originalValue: number | undefined
    let originalUnit: string | undefined
    let category: string | undefined

    if (normalizedKey) {
      const biomarker = getBiomarker(normalizedKey)
      if (biomarker) {
        displayName = biomarker.displayName
        category = biomarker.category

        // Run validation pipeline (unit conversion + bounds + flag)
        const validation = validateBiomarkerValue(normalizedKey, numericValue, parsed.unit)
        numericValue = validation.value
        flag = validation.flag
        confidence = validation.confidence
        converted = validation.converted
        originalValue = validation.originalValue
        originalUnit = validation.originalUnit

        if (!validation.valid) {
          warnings.push(validation.warning || `Value validation failed for ${cleanName}`)
          confidence = 0.1
        }

        if (validation.critical) {
          warnings.push(`Critical value: ${displayName} at ${numericValue} ${validation.unit}`)
        }

        // Boost confidence for recognized biomarkers
        confidence = Math.min(confidence * 1.1, 1.0)
      }
    } else {
      // Unrecognized — compute flag from parsed reference range
      const rangeLow = parsed.rangeLow ? parseFloat(parsed.rangeLow) : undefined
      const rangeHigh = parsed.rangeHigh ? parseFloat(parsed.rangeHigh) : undefined

      if (rangeHigh !== undefined && numericValue > rangeHigh) flag = 'high'
      else if (rangeLow !== undefined && numericValue < rangeLow) flag = 'low'

      confidence = 0.4
      warnings.push(`Unrecognized biomarker: "${cleanName}" — stored but not normalized`)
    }

    // Use PDF H/L flag as a secondary signal
    if (parsed.flag === 'H' && flag === 'normal') flag = 'high'
    if (parsed.flag === 'L' && flag === 'normal') flag = 'low'

    // Reduce confidence for below-detection values
    if (belowDetection) confidence *= 0.8

    const rangeLow = parsed.rangeLow ? parseFloat(parsed.rangeLow) : undefined
    const rangeHigh = parsed.rangeHigh ? parseFloat(parsed.rangeHigh) : undefined

    markers.push({
      rawName: cleanName,
      normalizedKey,
      displayName,
      value: numericValue,
      unit: parsed.unit.trim(),
      rangeLow: isNaN(rangeLow as number) ? undefined : rangeLow,
      rangeHigh: isNaN(rangeHigh as number) ? undefined : rangeHigh,
      flag,
      confidence,
      converted,
      originalValue,
      originalUnit,
      category,
    })
  }

  // Compute derived biomarkers (HOMA-IR, Non-HDL, etc.)
  const valueMap: Record<string, number> = {}
  for (const m of markers) {
    if (m.normalizedKey) valueMap[m.normalizedKey] = m.value
  }
  const derivedCalcs = computeAllDerived(valueMap)

  for (const derived of derivedCalcs) {
    const def = BIOMARKER_REGISTRY[derived.key]
    markers.push({
      rawName: `[Derived] ${derived.displayName}`,
      normalizedKey: derived.key,
      displayName: derived.displayName,
      value: derived.value,
      unit: derived.unit,
      flag: derived.flag,
      confidence: 1.0,
      converted: false,
      category: def?.category,
    })
  }

  if (markers.length === 0) {
    warnings.push('No biomarkers could be parsed from this PDF. Please check the format.')
  }

  const overallConfidence = markers.length > 0
    ? Math.round((markers.reduce((sum, m) => sum + m.confidence, 0) / markers.length) * 100) / 100
    : 0

  return {
    testDate,
    labName,
    markers,
    rawText,
    parseWarnings: warnings,
    overallConfidence,
  }
}
