// Canonical internal schema for parsed lab documents.
// Supports multiple panels/specimens per PDF (e.g., H&H Labs format).
// Converts to ParseResult for backward compatibility with existing pipeline.

import {
  normalizeBiomarkerName,
  getBiomarker,
} from '@/lib/lab-biomarker-contract'
import {
  validateBiomarkerValue,
  computeAllDerived,
  parseBelowDetectionLimit,
} from '@/lib/labs/lab-validator'
import type { ParsedBiomarker, ParseResult } from './lab-pdf-parser'

// ─── Canonical Types ─────────────────────────────────────────────────────────

export interface LabDocument {
  source: string | null             // "function_health", "hh_labs", "unknown"
  patient: {
    name?: string
    dob?: string
    gender?: string
  }
  reportedAt?: Date
  collectedAt?: Date
  panels: LabPanel[]
  rawText?: string
  metadata: Record<string, unknown>  // vendor-specific extra metadata
}

export interface LabPanel {
  name: string                       // e.g., "Testosterone Eligibility Panel - Chem/Immuno"
  specimenId?: string
  specimenType?: string
  tests: LabTest[]
}

export interface LabTest {
  name: string                       // e.g., "Estradiol"
  resultRaw: string                  // e.g., "< 25" or "381.00"
  resultNumeric?: number | null
  resultOperator?: '<' | '>' | '=' | null
  unit?: string | null
  flag?: string | null
  referenceRangeRaw?: string | null  // e.g., "249.00 - 836.00"
  referenceLow?: number | null
  referenceHigh?: number | null
}

// ─── Convert LabDocument → ParseResult (backward compat) ─────────────────────

/**
 * Convert a LabDocument to the existing ParseResult format used by the upload
 * pipeline, storage layer, and iOS client. Flattens panels into a single
 * markers array and runs the standard biomarker normalization + validation.
 */
export function labDocumentToParseResult(doc: LabDocument): ParseResult {
  const markers: ParsedBiomarker[] = []
  const warnings: string[] = []
  const processedKeys = new Set<string>()
  const processedNames = new Set<string>()

  for (const panel of doc.panels) {
    for (const test of panel.tests) {
      const cleanName = test.name.replace(/\s+/g, ' ').trim()
      const nameLower = cleanName.toLowerCase()

      if (processedNames.has(nameLower)) continue
      processedNames.add(nameLower)

      // Parse numeric value
      let numericValue: number
      let belowDetection = false
      const belowLimit = parseBelowDetectionLimit(test.resultRaw)

      if (belowLimit) {
        numericValue = belowLimit.value
        belowDetection = true
      } else if (test.resultNumeric != null) {
        numericValue = test.resultNumeric
      } else {
        const parsed = parseFloat(test.resultRaw.replace(/,/g, ''))
        if (isNaN(parsed)) {
          warnings.push(`Could not parse value for ${cleanName}: "${test.resultRaw}"`)
          continue
        }
        numericValue = parsed
      }

      // Normalize biomarker name
      const normalizedKey = normalizeBiomarkerName(cleanName)
      if (normalizedKey && processedKeys.has(normalizedKey)) continue
      if (normalizedKey) processedKeys.add(normalizedKey)

      let displayName = cleanName
      let flag: string = 'normal'
      let confidence = 0.7
      let converted = false
      let originalValue: number | undefined
      let originalUnit: string | undefined
      let category: string | undefined

      const unit = test.unit || ''

      if (normalizedKey) {
        const biomarker = getBiomarker(normalizedKey)
        if (biomarker) {
          displayName = biomarker.displayName
          category = biomarker.category

          const validation = validateBiomarkerValue(normalizedKey, numericValue, unit)
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
          confidence = Math.min(confidence * 1.1, 1.0)
        }
      } else {
        // Unrecognized — flag from parsed reference range
        if (test.referenceHigh != null && numericValue > test.referenceHigh) flag = 'high'
        else if (test.referenceLow != null && numericValue < test.referenceLow) flag = 'low'
        confidence = 0.4
        warnings.push(`Unrecognized biomarker: "${cleanName}" — stored but not normalized`)
      }

      // Use PDF flag as secondary signal
      if (test.flag === 'H' && flag === 'normal') flag = 'high'
      if (test.flag === 'L' && flag === 'normal') flag = 'low'

      if (belowDetection) confidence *= 0.8

      markers.push({
        rawName: cleanName,
        normalizedKey,
        displayName,
        value: numericValue,
        unit,
        rangeLow: test.referenceLow != null && !isNaN(test.referenceLow) ? test.referenceLow : undefined,
        rangeHigh: test.referenceHigh != null && !isNaN(test.referenceHigh) ? test.referenceHigh : undefined,
        flag: flag as ParsedBiomarker['flag'],
        confidence,
        converted,
        originalValue,
        originalUnit,
        category,
      })
    }
  }

  // Compute derived biomarkers (HOMA-IR, Non-HDL, etc.)
  const valueMap: Record<string, number> = {}
  for (const m of markers) {
    if (m.normalizedKey) valueMap[m.normalizedKey] = m.value
  }
  const derivedCalcs = computeAllDerived(valueMap)
  for (const derived of derivedCalcs) {
    markers.push({
      rawName: `[Derived] ${derived.displayName}`,
      normalizedKey: derived.key,
      displayName: derived.displayName,
      value: derived.value,
      unit: derived.unit,
      flag: derived.flag,
      confidence: 1.0,
      converted: false,
      category: undefined,
    })
  }

  if (markers.length === 0) {
    warnings.push('No biomarkers could be parsed from this PDF. Please check the format.')
  }

  const overallConfidence = markers.length > 0
    ? Math.round((markers.reduce((sum, m) => sum + m.confidence, 0) / markers.length) * 100) / 100
    : 0

  // Use collectedAt for testDate (lab date, not upload date)
  const testDate = doc.collectedAt || doc.reportedAt || null

  // Build lab name from source
  let labName: string | null = null
  if (doc.source === 'hh_labs') labName = 'H&H Labs'
  else if (doc.source === 'function_health') labName = 'Function Health'
  else labName = doc.metadata.labName as string || null

  return {
    testDate,
    labName,
    markers,
    rawText: doc.rawText || '',
    parseWarnings: warnings,
    overallConfidence,
  }
}
