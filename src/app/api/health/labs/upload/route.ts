import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { parseQuestPDF, extractTextFromPDF } from '@/lib/labs/lab-pdf-parser'
import { analyzeLabPatterns } from '@/lib/labs/lab-analyzer'

// Force Node.js runtime for pdfjs-dist compatibility
export const runtime = 'nodejs'

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
      text = await extractTextFromPDF(data)
    } catch (pdfError) {
      const errMsg = pdfError instanceof Error ? pdfError.message : String(pdfError)
      return NextResponse.json(
        { error: `Failed to parse PDF: ${errMsg}` },
        { status: 400 }
      )
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'PDF appears to be empty or image-only (OCR not supported)' },
        { status: 400 }
      )
    }

    // Parse biomarkers using Quest Diagnostics parser
    const parseResult = parseQuestPDF(text)
    const markers = parseResult.markers
    const warnings = parseResult.parseWarnings

    // Apply overrides
    let testDate = testDateOverride ? new Date(testDateOverride) : parseResult.testDate
    if (!testDate || isNaN(testDate.getTime())) testDate = new Date()

    const labName = labNameOverride || parseResult.labName

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

    const derivedCount = markers.filter(m => m.rawName.startsWith('[Derived]')).length

    return NextResponse.json({
      success: true,
      upload: {
        id: upload.id,
        testDate: upload.testDate,
        labName: upload.labName,
        fileName: upload.fileName,
        biomarkersCount: upload.biomarkers.length,
        overallConfidence: parseResult.overallConfidence,
      },
      summary: {
        totalParsed: markers.length,
        recognized: recognizedMarkers.length,
        derived: derivedCount,
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
    const errMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to process lab upload: ${errMsg}` }, { status: 500 })
  }
}
