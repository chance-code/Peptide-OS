import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromPDF } from '@/lib/labs/lab-pdf-parser'

export const runtime = 'nodejs'

// POST /api/labs/test-pdf - Diagnostic endpoint to test PDF text extraction
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    const text = await extractTextFromPDF(data)

    return NextResponse.json({
      success: true,
      textLength: text.length,
      lineCount: text.split('\n').length,
      preview: text.substring(0, 500),
    })
  } catch (error) {
    const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return NextResponse.json({ error: errMsg, stack: error instanceof Error ? error.stack : undefined }, { status: 500 })
  }
}
