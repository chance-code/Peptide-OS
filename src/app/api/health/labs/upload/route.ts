import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
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
  parseAboveDetectionLimit,
} from '@/lib/labs/lab-validator'
import { analyzeLabPatterns } from '@/lib/labs/lab-analyzer'

// Force Node.js runtime for pdf-parse compatibility
export const runtime = 'nodejs'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedMarker {
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

// ─── POST /api/health/labs/upload — Full PDF upload with analysis pipeline ──

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const testDateOverride = formData.get('testDate') as string | null
    const labNameOverride = formData.get('labName') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
    }

    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    // Parse PDF
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    let text: string
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data })
      const textResult = await parser.getText()
      text = textResult.text
      await parser.destroy()
    } catch {
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

    // Parse biomarkers from text
    const { markers, warnings } = parseBiomarkersFromText(text)

    // Extract date
    let testDate = testDateOverride ? new Date(testDateOverride) : extractTestDate(text)
    if (!testDate || isNaN(testDate.getTime())) testDate = new Date()

    const labName = labNameOverride || extractLabName(text)

    // Compute derived biomarkers
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

    // Overall confidence
    const overallConfidence = markers.length > 0
      ? Math.round((markers.reduce((s, m) => s + m.confidence, 0) / markers.length) * 100) / 100
      : 0

    // Save to structured tables
    const recognizedMarkers = markers.filter(m => m.normalizedKey)
    const upload = await prisma.labUpload.create({
      data: {
        userId,
        testDate,
        labName,
        source: 'pdf_import',
        notes: `Imported from PDF: ${file.name}`,
        rawText: text,
        confidence: overallConfidence,
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

    // Also write legacy LabResult for backward compat
    await prisma.labResult.create({
      data: {
        userId,
        testDate,
        labName,
        notes: `Imported from PDF: ${file.name}`,
        markers: JSON.stringify(markers.map(m => ({
          name: m.normalizedKey || m.rawName,
          displayName: m.displayName,
          rawName: m.rawName,
          value: m.value,
          unit: m.unit,
          rangeLow: m.rangeLow,
          rangeHigh: m.rangeHigh,
          flag: m.flag,
          confidence: m.confidence,
        }))),
      },
    })

    // Run pattern analysis
    const biomarkerArray = recognizedMarkers.map(m => ({
      biomarkerKey: m.normalizedKey!,
      value: m.value,
      unit: m.unit,
      flag: m.flag,
    }))
    const patterns = analyzeLabPatterns(biomarkerArray)

    // Summary stats
    const flagCounts = { optimal: 0, normal: 0, low: 0, high: 0, critical_low: 0, critical_high: 0 }
    for (const m of recognizedMarkers) {
      if (m.flag in flagCounts) flagCounts[m.flag as keyof typeof flagCounts]++
    }

    return NextResponse.json({
      success: true,
      upload: {
        id: upload.id,
        testDate: upload.testDate,
        labName: upload.labName,
        fileName: upload.fileName,
        biomarkersCount: upload.biomarkers.length,
        overallConfidence,
      },
      summary: {
        totalParsed: markers.length,
        recognized: recognizedMarkers.length,
        derived: derivedCalcs.length,
        flagCounts,
        patternsDetected: patterns.length,
      },
      markers: markers.map(m => ({
        key: m.normalizedKey,
        displayName: m.displayName,
        value: m.value,
        unit: m.unit,
        flag: m.flag,
        confidence: m.confidence,
        category: m.category,
        converted: m.converted,
        originalValue: m.originalValue,
        originalUnit: m.originalUnit,
      })),
      derived: derivedCalcs,
      patterns: patterns.map(p => ({
        key: p.patternKey,
        name: p.patternName,
        severity: p.severity,
        confidence: p.confidence,
        insight: p.insight,
      })),
      warnings,
    })
  } catch (error) {
    console.error('Error uploading lab PDF:', error)
    return NextResponse.json({ error: 'Failed to process lab upload' }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractTestDate(text: string): Date | null {
  const patterns = [
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(?:collection|test|draw|specimen)\s*date[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /(?:date[:\s]+)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      const d = new Date(match[1])
      if (!isNaN(d.getTime())) return d
    }
  }
  return null
}

function extractLabName(text: string): string {
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

function parseBiomarkersFromText(text: string): { markers: ParsedMarker[]; warnings: string[] } {
  const markers: ParsedMarker[] = []
  const warnings: string[] = []
  const processedNames = new Set<string>()

  const colonPattern = /^([A-Za-z][A-Za-z0-9,\s\-()]+?):\s*([\d.<>]+)\s*([a-zA-Z/%\d]+(?:\/[a-zA-Z0-9.]+)?)\s*(?:\(?([\d.]+)\s*[-–]\s*([\d.]+)\)?)?/gm
  const tablePattern = /^([A-Za-z][A-Za-z0-9,\s\-()]+?)\s{2,}([\d.<>]+)\s{2,}([a-zA-Z/%\d]+(?:\/[a-zA-Z0-9.]+)?)\s{2,}([\d.]+)\s{2,}([\d.]+)/gm
  const simplePattern = /^([A-Za-z][A-Za-z0-9,\s\-()]+?)\s{2,}([\d.<>]+)\s+([a-zA-Z/%]+)/gm
  const resultBlockPattern = /([A-Za-z][A-Za-z0-9,\s\-()]+?)\s*[\n\r]+Result[:\s]*([\d.<>]+)\s*([a-zA-Z/%\d]+(?:\/[a-zA-Z0-9.]+)?)\s*[\n\r]*(?:Reference[:\s]*([\d.]+)\s*[-–]\s*([\d.]+))?/gi

  function addMarker(rawName: string, valueStr: string, unit: string, rangeLowStr?: string, rangeHighStr?: string) {
    const cleanName = rawName.trim().replace(/\s+/g, ' ')
    if (processedNames.has(cleanName.toLowerCase())) return
    processedNames.add(cleanName.toLowerCase())

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
    const normalizedKey = normalizeBiomarkerName(cleanName)
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
        if (isCategorical) {
          flag = numericValue === 1 ? 'high' : 'normal'
          confidence = 0.9
        } else {
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
        }
        confidence = Math.min(confidence * 1.1, 1.0)
      }
    } else {
      if (rangeHigh !== undefined && numericValue > rangeHigh) flag = 'high'
      else if (rangeLow !== undefined && numericValue < rangeLow) flag = 'low'
      confidence = 0.4
      warnings.push(`Unrecognized biomarker: "${cleanName}"`)
    }

    if (belowLimit || aboveLimit) confidence *= 0.8

    markers.push({
      rawName: cleanName, normalizedKey, displayName, value: numericValue,
      unit: unit.trim(), rangeLow, rangeHigh, flag, confidence, converted,
      originalValue, originalUnit, category,
    })
  }

  let match
  while ((match = colonPattern.exec(text)) !== null) addMarker(match[1], match[2], match[3], match[4], match[5])
  while ((match = tablePattern.exec(text)) !== null) addMarker(match[1], match[2], match[3], match[4], match[5])
  if (markers.length < 5) {
    while ((match = simplePattern.exec(text)) !== null) addMarker(match[1], match[2], match[3])
  }
  while ((match = resultBlockPattern.exec(text)) !== null) addMarker(match[1], match[2], match[3], match[4], match[5])

  if (markers.length === 0) {
    warnings.push('No biomarkers could be parsed from this PDF.')
  }

  return { markers, warnings }
}
