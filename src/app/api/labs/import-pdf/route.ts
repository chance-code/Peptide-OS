import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { parseQuestPDF } from '@/lib/labs/lab-pdf-parser'

// Force Node.js runtime for pdf-parse compatibility
export const runtime = 'nodejs'

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

    // Parse the PDF content using Quest Diagnostics parser
    const parseResult = parseQuestPDF(text)

    // Apply overrides
    const finalTestDate = testDateOverride
      ? new Date(testDateOverride)
      : (parseResult.testDate || new Date())
    const finalLabName = labNameOverride || parseResult.labName

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
