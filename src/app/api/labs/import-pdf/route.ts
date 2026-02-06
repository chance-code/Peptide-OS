import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import {
  normalizeBiomarkerName,
  getBiomarker,
  computeFlag,
  BIOMARKER_REGISTRY,
  type BiomarkerFlag,
} from '@/lib/lab-biomarker-contract'
import {
  validateBiomarkerValue,
  computeAllDerived,
  parseCategoricalValue,
  parseBelowDetectionLimit,
  parseAboveDetectionLimit,
} from '@/lib/labs/lab-validator'

// Force Node.js runtime for pdf-parse compatibility
export const runtime = 'nodejs'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedBiomarker {
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

interface ParseResult {
  testDate: Date | null
  labName: string | null
  markers: ParsedBiomarker[]
  rawText: string
  parseWarnings: string[]
  overallConfidence: number
}

// ─── Function Health PDF Parser ────────────────────────────────────────────

/**
 * Parse Function Health PDF format.
 *
 * Function Health PDFs typically have biomarker data in formats like:
 * - "Testosterone, Total: 850 ng/dL (264-916)"
 * - "TSH: 1.5 mIU/L (0.45-4.5)"
 * - "Vitamin D, 25-OH: 65 ng/mL (30-100)"
 */
function parseFunctionHealthPDF(text: string): ParseResult {
  const markers: ParsedBiomarker[] = []
  const warnings: string[] = []

  // Try to extract test date
  // Common formats: "Collection Date: January 15, 2026" or "01/15/2026" or "2026-01-15"
  let testDate: Date | null = null

  // Pattern: "Collection Date: January 15, 2026" or similar
  const datePatterns = [
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /(?:date[:\s]+)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ]

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match) {
      const parsed = new Date(match[1])
      if (!isNaN(parsed.getTime())) {
        testDate = parsed
        break
      }
    }
  }

  // Try to extract lab name
  let labName: string | null = 'Function Health'
  const labPatterns = [
    /(?:laboratory|lab)[:\s]+([^\n]+)/i,
    /(?:performed\s+(?:by|at))[:\s]+([^\n]+)/i,
  ]

  for (const pattern of labPatterns) {
    const match = text.match(pattern)
    if (match) {
      labName = match[1].trim()
      break
    }
  }

  // Parse biomarker lines
  // Function Health format variations:
  // 1. "Biomarker Name: value unit (low-high)"
  // 2. "Biomarker Name    value    unit    low    high"
  // 3. "Biomarker Name  value unit  Reference: low-high"

  // Pattern 1: Colon-separated with parenthetical range
  // e.g., "Testosterone, Total: 850 ng/dL (264-916)"
  const colonPattern = /^([A-Za-z][A-Za-z0-9,\s\-()]+?):\s*([\d.]+)\s*([a-zA-Z/%\d]+(?:\/[a-zA-Z0-9.]+)?)\s*(?:\(?([\d.]+)\s*[-–]\s*([\d.]+)\)?)?/gm

  // Pattern 2: Tab/space-separated table format
  // e.g., "Testosterone Total    850    ng/dL    264    916"
  const tablePattern = /^([A-Za-z][A-Za-z0-9,\s\-()]+?)\s{2,}([\d.]+)\s{2,}([a-zA-Z/%\d]+(?:\/[a-zA-Z0-9.]+)?)\s{2,}([\d.]+)\s{2,}([\d.]+)/gm

  // Pattern 3: Name followed by value and unit on same line
  // e.g., "Hemoglobin A1c 5.4 %"
  const simplePattern = /^([A-Za-z][A-Za-z0-9,\s\-()]+?)\s{2,}([\d.]+)\s+([a-zA-Z/%]+)/gm

  // Pattern 4: Handle "Result: value" format often seen
  // e.g., "Vitamin D, 25-Hydroxy\nResult: 65 ng/mL\nReference: 30-100"
  const resultBlockPattern = /([A-Za-z][A-Za-z0-9,\s\-()]+?)\s*[\n\r]+Result[:\s]*([\d.]+)\s*([a-zA-Z/%\d]+(?:\/[a-zA-Z0-9.]+)?)\s*[\n\r]*(?:Reference[:\s]*([\d.]+)\s*[-–]\s*([\d.]+))?/gi

  const processedNames = new Set<string>()

  function addMarker(
    rawName: string,
    valueStr: string,
    unit: string,
    rangeLowStr?: string,
    rangeHighStr?: string
  ) {
    const cleanName = rawName.trim().replace(/\s+/g, ' ')

    // Skip if we've already processed this biomarker
    if (processedNames.has(cleanName.toLowerCase())) return
    processedNames.add(cleanName.toLowerCase())

    // Handle categorical values (e.g., "Positive", "Negative", "Reactive")
    let numericValue: number
    let isCategorical = false
    const belowLimit = parseBelowDetectionLimit(valueStr)
    const aboveLimit = parseAboveDetectionLimit(valueStr)

    if (belowLimit) {
      numericValue = belowLimit.value
    } else if (aboveLimit) {
      numericValue = aboveLimit.value
    } else {
      const parsed = parseFloat(valueStr)
      if (isNaN(parsed)) {
        // Try categorical parse
        const catValue = parseCategoricalValue(valueStr)
        if (catValue !== null) {
          numericValue = catValue
          isCategorical = true
        } else {
          warnings.push(`Could not parse value for ${cleanName}: "${valueStr}"`)
          return
        }
      } else {
        numericValue = parsed
      }
    }

    const rangeLow = rangeLowStr ? parseFloat(rangeLowStr) : undefined
    const rangeHigh = rangeHighStr ? parseFloat(rangeHighStr) : undefined

    // Try to normalize to our biomarker registry
    const normalizedKey = normalizeBiomarkerName(cleanName)
    let displayName = cleanName
    let flag: BiomarkerFlag = 'normal'
    let confidence = 0.7 // Base confidence for parsed values
    let converted = false
    let originalValue: number | undefined
    let originalUnit: string | undefined
    let category: string | undefined

    if (normalizedKey) {
      const biomarker = getBiomarker(normalizedKey)
      if (biomarker) {
        displayName = biomarker.displayName
        category = biomarker.category

        if (isCategorical) {
          // Categorical values: 1 = positive (flag as high), 0 = negative (normal)
          flag = numericValue === 1 ? 'high' : 'normal'
          confidence = 0.9
        } else {
          // Run full validation pipeline (unit conversion + bounds check + flag)
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
        }

        // Boost confidence for recognized biomarkers
        confidence = Math.min(confidence * 1.1, 1.0)
      }
    } else {
      // Fallback flag computation for unrecognized markers
      if (rangeHigh !== undefined && numericValue > rangeHigh) flag = 'high'
      else if (rangeLow !== undefined && numericValue < rangeLow) flag = 'low'
      else flag = 'normal'
      confidence = 0.4 // Lower confidence for unrecognized markers

      warnings.push(`Unrecognized biomarker: "${cleanName}" - stored but not normalized`)
    }

    // Reduce confidence for detection-limit values
    if (belowLimit || aboveLimit) confidence *= 0.8

    markers.push({
      rawName: cleanName,
      normalizedKey,
      displayName,
      value: numericValue,
      unit: unit.trim(),
      rangeLow,
      rangeHigh,
      flag,
      confidence,
      converted,
      originalValue,
      originalUnit,
      category,
    })
  }

  // Try each pattern
  let match

  // Pattern 1: Colon-separated
  while ((match = colonPattern.exec(text)) !== null) {
    addMarker(match[1], match[2], match[3], match[4], match[5])
  }

  // Pattern 2: Table format
  while ((match = tablePattern.exec(text)) !== null) {
    addMarker(match[1], match[2], match[3], match[4], match[5])
  }

  // Pattern 3: Simple format (only if we haven't found many markers)
  if (markers.length < 5) {
    while ((match = simplePattern.exec(text)) !== null) {
      addMarker(match[1], match[2], match[3])
    }
  }

  // Pattern 4: Result block format
  while ((match = resultBlockPattern.exec(text)) !== null) {
    addMarker(match[1], match[2], match[3], match[4], match[5])
  }

  if (markers.length === 0) {
    warnings.push('No biomarkers could be parsed from this PDF. Please check the format.')
  }

  // Compute overall confidence as average of marker confidences
  const overallConfidence = markers.length > 0
    ? markers.reduce((sum, m) => sum + m.confidence, 0) / markers.length
    : 0

  return {
    testDate,
    labName,
    markers,
    rawText: text,
    parseWarnings: warnings,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  }
}

// ─── API Route Handler ─────────────────────────────────────────────────────

// POST /api/labs/import-pdf - Parse a PDF and create lab result
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const testDateOverride = formData.get('testDate') as string | null
    const labNameOverride = formData.get('labName') as string | null
    const saveResult = formData.get('save') !== 'false' // Default to true

    if (!file) {
      return NextResponse.json(
        { error: 'No PDF file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    // Parse PDF to text using dynamic import
    let text: string
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data })
      const textResult = await parser.getText()
      text = textResult.text
      await parser.destroy()
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError)
      return NextResponse.json(
        { error: 'Failed to parse PDF file. Please ensure it is a valid PDF.' },
        { status: 400 }
      )
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'PDF appears to be empty or image-only (OCR not supported)' },
        { status: 400 }
      )
    }

    // Parse the PDF content
    const parseResult = parseFunctionHealthPDF(text)

    // Apply overrides
    const finalTestDate = testDateOverride
      ? new Date(testDateOverride)
      : (parseResult.testDate || new Date())
    const finalLabName = labNameOverride || parseResult.labName

    // Compute derived biomarkers (HOMA-IR, Non-HDL, etc.)
    const valueMap: Record<string, number> = {}
    for (const m of parseResult.markers) {
      if (m.normalizedKey) valueMap[m.normalizedKey] = m.value
    }
    const derivedCalcs = computeAllDerived(valueMap)

    // Add derived calculations as additional markers
    for (const derived of derivedCalcs) {
      const def = BIOMARKER_REGISTRY[derived.key]
      parseResult.markers.push({
        rawName: `[Derived] ${derived.displayName}`,
        normalizedKey: derived.key,
        displayName: derived.displayName,
        value: derived.value,
        unit: derived.unit,
        flag: derived.flag,
        confidence: 1.0, // Derived values have full confidence
        converted: false,
        category: def?.category,
      })
    }

    // Convert to legacy storage format (backward compat with LabResult JSON blob)
    const markersForStorage = parseResult.markers.map((m) => ({
      name: m.normalizedKey || m.rawName,
      displayName: m.displayName,
      rawName: m.rawName,
      value: m.value,
      unit: m.unit,
      rangeLow: m.rangeLow,
      rangeHigh: m.rangeHigh,
      flag: m.flag,
      confidence: m.confidence,
    }))

    // Optionally save to database
    let savedResult = null
    let savedUpload = null
    if (saveResult && markersForStorage.length > 0) {
      // Legacy write: LabResult (backward compat)
      savedResult = await prisma.labResult.create({
        data: {
          userId,
          testDate: finalTestDate,
          labName: finalLabName,
          notes: `Imported from PDF: ${file.name}`,
          markers: JSON.stringify(markersForStorage),
        },
      })

      // Structured write: LabUpload + LabBiomarker
      const recognizedMarkers = parseResult.markers.filter(m => m.normalizedKey)
      savedUpload = await prisma.labUpload.create({
        data: {
          userId,
          testDate: finalTestDate,
          labName: finalLabName,
          source: 'pdf_import',
          notes: `Imported from PDF: ${file.name}`,
          rawText: parseResult.rawText,
          confidence: parseResult.overallConfidence,
          fileName: file.name,
          biomarkers: {
            create: recognizedMarkers.map(m => ({
              biomarkerKey: m.normalizedKey!,
              rawName: m.rawName,
              value: m.value,
              unit: m.unit,
              originalValue: m.originalValue,
              originalUnit: m.originalUnit,
              rangeLow: m.rangeLow,
              rangeHigh: m.rangeHigh,
              flag: m.flag,
              confidence: m.confidence,
              category: m.category,
            })),
          },
        },
        include: { biomarkers: true },
      })
    }

    // Return parse results
    return NextResponse.json({
      success: true,
      parsed: {
        testDate: finalTestDate.toISOString(),
        labName: finalLabName,
        markersCount: parseResult.markers.length,
        markers: parseResult.markers,
        derived: derivedCalcs,
        warnings: parseResult.parseWarnings,
        overallConfidence: parseResult.overallConfidence,
      },
      saved: savedResult ? {
        id: savedResult.id,
        testDate: savedResult.testDate,
        labName: savedResult.labName,
      } : null,
      upload: savedUpload ? {
        id: savedUpload.id,
        biomarkersCount: savedUpload.biomarkers.length,
      } : null,
    })
  } catch (error) {
    console.error('Error importing PDF:', error)
    return NextResponse.json(
      { error: 'Failed to import PDF' },
      { status: 500 }
    )
  }
}
