import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { extractTextFromPDF } from '@/lib/labs/lab-pdf-parser'
import { routeLabPDF } from '@/lib/labs/lab-parser-router'

// Force Node.js runtime for pdfjs-dist compatibility
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

    // Extract text from PDF using pdfjs-dist (pure JS, no native deps)
    let text: string
    try {
      text = await extractTextFromPDF(data)
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError)
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

    // Parse the PDF content using auto-detected parser (Quest/Function Health or H&H Labs)
    const parseResult = routeLabPDF(text)

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

      // Structured write: LabUpload + LabBiomarker (non-blocking — table may not exist yet)
      try {
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
      } catch (uploadErr) {
        console.warn('LabUpload write skipped (table may not exist):', uploadErr)
      }
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
    const errMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Failed to import PDF: ${errMsg}` },
      { status: 500 }
    )
  }
}
