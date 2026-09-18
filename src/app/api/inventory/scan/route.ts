import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  EMPTY_SCAN_RESULT,
  VIAL_SCAN_SYSTEM_PROMPT,
  normalizeVialScanResult,
  parseScanJson,
  type VialScanResult,
} from '@/lib/vial-scan'

// Lazy initialize to avoid build-time errors
let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

// POST /api/inventory/scan - Analyze a vial image
// Handles single-peptide dry vials, blends (KLOW/GLOW), and compounded
// pre-mixed solutions with several ingredients listed as mg/mL.
export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json()

    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    // Ensure we have a proper base64 data URL
    const imageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VIAL_SCAN_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please analyze this vial image and extract the label information.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 800,
      temperature: 0.1, // Low temperature for more consistent extraction
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = parseScanJson(content)

    // If parsing fails, return low confidence with raw text
    const result: VialScanResult = parsed
      ? normalizeVialScanResult(parsed)
      : { ...EMPTY_SCAN_RESULT, rawText: content }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Scan error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze image' },
      { status: 500 }
    )
  }
}
