// H&H Labs PDF Parser
// Parses multi-panel lab result PDFs from H&H Labs (e.g., Testosterone Eligibility Panel)
// Produces LabDocument then converts to ParseResult for backward compatibility.

import type { ParseResult } from './lab-pdf-parser'
import type { LabDocument, LabPanel, LabTest } from './lab-document'
import { labDocumentToParseResult } from './lab-document'

// ─── Panel Detection ────────────────────────────────────────────────────────

/**
 * Detect H&H Labs panel header lines.
 * H&H panels follow the pattern: "Panel Name - SubType"
 * e.g., "Testosterone Eligibility Panel - Chem/Immuno"
 */
const PANEL_HEADER_RE = /^(.+?\s+Panel\s*-\s*.+)$/i
const ALT_PANEL_HEADER_RE = /^(.+?(?:Panel|Profile|Screen))\s*$/i

/**
 * Lines that signal end of result rows within a panel.
 */
const STOP_PATTERNS = [
  /^Patient\s+(?:Name|Details)/i,
  /^FINAL\s+REPORT/i,
  /^CLIA/i,
  /^Ordering\s+(?:Physician|Provider)/i,
  /^This\s+(?:test|report|collection)/i,
  /^The\s+\w+\s+\(/i,                  // "The Hematocrit (HCT) test measured by..."
  /^Laboratory\s+Director/i,
  /^Note:/i,
  /^Comments?:/i,
  /^Disclaimer/i,
  /^The\s+results/i,
  /^This\s+document/i,
  /^Facility/i,
  /^Page\s+\d+/i,
  /^Printed:/i,
  /^\d{4}\s+H&H/i,                     // "2025 H&H – The information..."
  /^\*+$/,
  /^red\s+blood\s+cell/i,
  /^technology\s+to/i,
  /^hematocrit\s+values/i,
  /^should\s+always/i,
  /^as\s+moderate/i,
  /^Food\s+and\s+Drug/i,
]

const TABLE_HEADER_RE = /^Test\s+Name\s+Result\s+Unit/i
const SPECIMEN_ID_RE = /Specimen\s+ID[:\s]+(\S+)/i
const SPECIMEN_TYPE_RE = /Specimen\s+Type[:\s]+(\S+)/i

// ─── Patient & Date Extraction ──────────────────────────────────────────────

function extractPatientInfo(text: string): { name?: string; dob?: string; gender?: string } {
  const patient: { name?: string; dob?: string; gender?: string } = {}

  // Try "Patient Name: X" first, then just "Name: X" (H&H uses the latter)
  const nameMatch = text.match(/Patient\s+Name[:\s]+([^\n\r]+)/i)
    || text.match(/^Name:\s*([^\n\r]+)/im)
  if (nameMatch) patient.name = nameMatch[1].trim()

  const dobMatch = text.match(/(?:Date\s+of\s+Birth|DOB|D\.O\.B\.?)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i)
  if (dobMatch) patient.dob = dobMatch[1].trim()

  const genderMatch = text.match(/(?:Gender|Sex)[:\s]+([MF](?:ale|emale)?)/i)
  if (genderMatch) patient.gender = genderMatch[1].trim()

  return patient
}

function extractCollectionDate(text: string): Date | null {
  const patterns = [
    // H&H: "Date Collected: 10/08/2025 07:20 AM"
    /Date\s+Collected[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    // Alternate: "Collection Date: 10/08/2025"
    /Collection\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    // "Collected: 10/08/2025"
    /Collected[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
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

function extractReportDate(text: string): Date | null {
  const patterns = [
    /Date\s+Reported[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Report\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Reported[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
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

// ─── Result Row Parsing ─────────────────────────────────────────────────────

/**
 * Parse a single result row from an H&H Labs table using regex patterns.
 *
 * Real unpdf output uses single spaces between columns, so we match
 * the line structure with regex rather than whitespace splitting.
 *
 * Actual extracted lines look like:
 *   "Albumin 4.6 g/dL 3.97 - 4.94"
 *   "Estradiol < 25 pg/mL 11.3 - 43.2"
 *   "Total Testosterone 381.00 ng/dL 249.00 - 836.00"
 *   "Hematocrit 49.4 % H 39.9 - 51"
 */
function parseResultRow(line: string): LabTest | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Reject metadata/header lines
  if (/^(Test\s+Name|Specimen|Date|Patient|CLIA|Facility|Page|Ordered|Name:|DOB:|Gender:|Ordering|NPI:|FINAL|Printed|The\s|This\s|Ron\s|\d{4}\s)/i.test(trimmed)) return null

  let match: RegExpMatchArray | null

  // Pattern 1: Below-detection value with reference range
  // "Estradiol < 25 pg/mL 11.3 - 43.2"
  match = trimmed.match(
    /^([A-Za-z][A-Za-z\s]*?)\s+(<\s*[\d.]+)\s+(\S+)\s+(?:([HL])\s+)?([\d.]+)\s*-\s*([\d.]+)\s*$/
  )
  if (match) {
    const resultRaw = match[2].replace(/\s+/g, ' ')
    const opMatch = resultRaw.match(/^([<>])\s*([\d.]+)/)
    return {
      name: match[1].trim(),
      resultRaw,
      resultNumeric: opMatch ? parseFloat(opMatch[2]) : null,
      resultOperator: opMatch ? opMatch[1] as '<' | '>' : null,
      unit: match[3],
      flag: match[4] || null,
      referenceRangeRaw: `${match[5]} - ${match[6]}`,
      referenceLow: parseFloat(match[5]),
      referenceHigh: parseFloat(match[6]),
    }
  }

  // Pattern 2: Below-detection value WITHOUT reference range
  // "Estradiol < 25 pg/mL"
  match = trimmed.match(
    /^([A-Za-z][A-Za-z\s]*?)\s+(<\s*[\d.]+)\s+(\S+)\s*$/
  )
  if (match) {
    const resultRaw = match[2].replace(/\s+/g, ' ')
    const opMatch = resultRaw.match(/^([<>])\s*([\d.]+)/)
    return {
      name: match[1].trim(),
      resultRaw,
      resultNumeric: opMatch ? parseFloat(opMatch[2]) : null,
      resultOperator: opMatch ? opMatch[1] as '<' | '>' : null,
      unit: match[3],
      flag: null,
      referenceRangeRaw: null,
      referenceLow: null,
      referenceHigh: null,
    }
  }

  // Pattern 3: Standard numeric result with flag and reference range
  // "Hematocrit 49.4 % H 39.9 - 51"
  // "Albumin 4.6 g/dL 3.97 - 4.94"
  match = trimmed.match(
    /^([A-Za-z][A-Za-z\s]*?)\s+([\d,.]+)\s+(\S+)\s+(?:([HL])\s+)?([\d.]+)\s*-\s*([\d.]+)\s*$/
  )
  if (match) {
    const num = parseFloat(match[2].replace(/,/g, ''))
    if (isNaN(num)) return null
    return {
      name: match[1].trim(),
      resultRaw: match[2],
      resultNumeric: num,
      resultOperator: null,
      unit: match[3],
      flag: match[4] || null,
      referenceRangeRaw: `${match[5]} - ${match[6]}`,
      referenceLow: parseFloat(match[5]),
      referenceHigh: parseFloat(match[6]),
    }
  }

  // Pattern 4: Numeric result with unit only (no reference range)
  // "Albumin 4.6 g/dL"
  match = trimmed.match(
    /^([A-Za-z][A-Za-z\s]*?)\s+([\d,.]+)\s+(\S+)\s*$/
  )
  if (match) {
    const num = parseFloat(match[2].replace(/,/g, ''))
    if (isNaN(num)) return null
    // Ensure it's a real unit, not a random word
    const unit = match[3]
    if (unit.length > 15) return null
    return {
      name: match[1].trim(),
      resultRaw: match[2],
      resultNumeric: num,
      resultOperator: null,
      unit,
      flag: null,
      referenceRangeRaw: null,
      referenceLow: null,
      referenceHigh: null,
    }
  }

  return null
}

// ─── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse H&H Labs PDF text into a LabDocument.
 */
export function parseHHLabsDocument(rawText: string): LabDocument {
  const lines = rawText.split('\n').map(l => l.trimEnd())
  const panels: LabPanel[] = []
  let currentPanel: LabPanel | null = null
  let inResultsTable = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Check for stop patterns
    if (STOP_PATTERNS.some(p => p.test(line))) {
      if (inResultsTable) {
        inResultsTable = false
      }
      continue
    }

    // Check for panel header
    const panelMatch = line.match(PANEL_HEADER_RE) || line.match(ALT_PANEL_HEADER_RE)
    if (panelMatch) {
      // Save previous panel
      if (currentPanel && currentPanel.tests.length > 0) {
        panels.push(currentPanel)
      }

      currentPanel = {
        name: panelMatch[1].trim(),
        tests: [],
      }
      inResultsTable = false
      continue
    }

    // Check for specimen metadata
    if (currentPanel) {
      const specIdMatch = line.match(SPECIMEN_ID_RE)
      if (specIdMatch) {
        currentPanel.specimenId = specIdMatch[1]
        const specTypeMatch = line.match(SPECIMEN_TYPE_RE)
        if (specTypeMatch) {
          currentPanel.specimenType = specTypeMatch[1]
        }
        continue
      }
    }

    // Check for table header (signals start of result rows)
    if (TABLE_HEADER_RE.test(line)) {
      inResultsTable = true
      continue
    }

    // Parse result rows
    if (inResultsTable && currentPanel) {
      const test = parseResultRow(lines[i])  // Use untrimmed line for column splitting
      if (test) {
        currentPanel.tests.push(test)
      }
    }
  }

  // Push last panel
  if (currentPanel && currentPanel.tests.length > 0) {
    panels.push(currentPanel)
  }

  // Extract metadata
  const patient = extractPatientInfo(rawText)
  const collectedAt = extractCollectionDate(rawText) ?? undefined
  const reportedAt = extractReportDate(rawText) ?? undefined

  return {
    source: 'hh_labs',
    patient,
    reportedAt,
    collectedAt,
    panels,
    rawText,
    metadata: {},
  }
}

/**
 * Parse H&H Labs PDF text and return a ParseResult (backward compat).
 */
export function parseHHLabsPDF(rawText: string): ParseResult {
  const doc = parseHHLabsDocument(rawText)
  return labDocumentToParseResult(doc)
}
