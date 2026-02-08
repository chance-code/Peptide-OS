// Lab Parser Router — Detects PDF source and routes to the correct parser.
// Score-based detection ensures deterministic routing without breaking
// existing Function Health / Quest Diagnostics parsing.

import { parseQuestPDF, extractTextFromPDF } from './lab-pdf-parser'
import { parseHHLabsPDF } from './hh-labs-parser'
import type { ParseResult } from './lab-pdf-parser'

// ─── Source Detection ───────────────────────────────────────────────────────

export type LabSource = 'hh_labs' | 'function_health' | 'unknown'

interface DetectionResult {
  source: LabSource
  confidence: number
}

/**
 * Score-based source detection. Returns the detected lab source and confidence.
 * Each source has positive and negative signals; highest score wins.
 */
export function detectLabSource(text: string): DetectionResult {
  const hhScore = scoreHHLabs(text)
  const fhScore = scoreFunctionHealth(text)

  if (hhScore > fhScore && hhScore >= 2) {
    return { source: 'hh_labs', confidence: Math.min(hhScore / 6, 1.0) }
  }
  if (fhScore > hhScore && fhScore >= 2) {
    return { source: 'function_health', confidence: Math.min(fhScore / 6, 1.0) }
  }

  // Default to Function Health (existing parser) for backward compatibility
  return { source: 'function_health', confidence: 0.3 }
}

function scoreHHLabs(text: string): number {
  let score = 0

  // Strong signals
  if (/H\s*&\s*H\s+Labs/i.test(text)) score += 3
  if (/HH\s*Labs/i.test(text)) score += 3
  if (/Specimen\s+ID[:\s]/i.test(text)) score += 2
  if (/Specimen\s+Type[:\s]/i.test(text)) score += 2

  // Moderate signals
  if (/Panel\s*-\s*(Chem|Immuno|Hematology)/i.test(text)) score += 2
  if (/Test\s+Name\s+Result\s+Unit/i.test(text)) score += 1
  if (/FINAL\s+REPORT/i.test(text)) score += 1
  if (/Date\s+Collected[:\s]/i.test(text)) score += 1

  // Weak signals
  if (/CLIA\s*#/i.test(text)) score += 0.5
  if (/Eligibility\s+Panel/i.test(text)) score += 1

  return score
}

function scoreFunctionHealth(text: string): number {
  let score = 0

  // Strong signals
  if (/Function\s*Health/i.test(text)) score += 3
  if (/Quest\s*Diagnostics/i.test(text)) score += 3
  if (/Health\s*Gorilla/i.test(text)) score += 3

  // Moderate signals
  if (/Printed\s+from\s+Health\s+Gorilla/i.test(text)) score += 2
  if (/Collection\s*Date[:\s]/i.test(text)) score += 1
  if (/Accession/i.test(text)) score += 1

  // Weak signals — Quest-style lab codes at end of lines (2-4 char uppercase)
  const labCodeLines = text.split('\n').filter(l => /\s+[A-Z0-9]{2,4}$/.test(l.trim()))
  if (labCodeLines.length > 5) score += 2

  return score
}

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * Route a lab PDF's extracted text to the appropriate parser.
 * Returns a ParseResult from whichever parser is selected.
 */
export function routeLabPDF(rawText: string): ParseResult {
  const detection = detectLabSource(rawText)

  if (detection.source === 'hh_labs') {
    return parseHHLabsPDF(rawText)
  }

  // Default: Function Health / Quest parser (preserves existing behavior)
  return parseQuestPDF(rawText)
}

/**
 * Full pipeline: extract text from PDF buffer, detect source, parse.
 */
export async function parseLabPDF(data: Uint8Array): Promise<{ text: string; result: ParseResult; source: LabSource }> {
  const text = await extractTextFromPDF(data)
  const detection = detectLabSource(text)

  let result: ParseResult
  if (detection.source === 'hh_labs') {
    result = parseHHLabsPDF(text)
  } else {
    result = parseQuestPDF(text)
  }

  return { text, result, source: detection.source }
}
