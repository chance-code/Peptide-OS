import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Lazy initialize to avoid build-time errors
let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

interface ScanResult {
  peptideName: string | null
  amount: number | null
  unit: string | null
  manufacturer: string | null
  lotNumber: string | null
  expirationDate: string | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string | null
}

// POST /api/inventory/scan - Analyze a vial image
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
      messages: [
        {
          role: 'system',
          content: `You are an expert at reading peptide vial labels. Analyze the image and extract information about the peptide vial.

Common peptide names to look for (case-insensitive, may have variations):
- BPC-157 (BPC157, Body Protection Compound)
- TB-500 (TB500, Thymosin Beta-4)
- Semaglutide (Ozempic, Wegovy)
- Tirzepatide (Mounjaro)
- Retatrutide
- CJC-1295 (with or without DAC)
- Ipamorelin
- Tesamorelin
- Sermorelin
- GHK-Cu (Copper Peptide)
- PT-141 (Bremelanotide)
- Melanotan II (MT2)
- AOD-9604
- MOTS-c
- SS-31 (Elamipretide)
- Epitalon
- Thymalin
- Selank
- Semax
- DSIP (Delta Sleep Inducing Peptide)
- Kisspeptin
- NAD+
- HGH (Human Growth Hormone, Somatropin)
- IGF-1 (Insulin-like Growth Factor)
- HCG (Human Chorionic Gonadotropin)

Return ONLY a JSON object with these fields (use null for any field you can't determine):
{
  "peptideName": "standardized peptide name",
  "amount": numeric value only,
  "unit": "mg" or "mcg" or "IU",
  "manufacturer": "company name if visible",
  "lotNumber": "lot/batch number if visible",
  "expirationDate": "YYYY-MM-DD format if visible",
  "confidence": "high" or "medium" or "low",
  "rawText": "all visible text on the label"
}

Important:
- Standardize peptide names (e.g., "BPC 157" → "BPC-157")
- If you see multiple amounts, use the total peptide content (not concentration)
- Common vial sizes: 2mg, 5mg, 10mg for most peptides
- If unsure about the peptide, set confidence to "low" and include rawText
- Return valid JSON only, no markdown formatting`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please analyze this peptide vial image and extract the label information.'
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
      max_tokens: 500,
      temperature: 0.1, // Low temperature for more consistent extraction
    })

    const content = response.choices[0]?.message?.content || '{}'

    // Parse the JSON response
    let result: ScanResult
    try {
      // Remove any markdown code block formatting if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim()
      result = JSON.parse(cleanContent)
    } catch {
      // If parsing fails, return low confidence with raw text
      result = {
        peptideName: null,
        amount: null,
        unit: null,
        manufacturer: null,
        lotNumber: null,
        expirationDate: null,
        confidence: 'low',
        rawText: content
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Scan error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze image' },
      { status: 500 }
    )
  }
}
