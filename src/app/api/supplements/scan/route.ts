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
  name: string | null
  brand: string | null
  servingSize: number | null
  servingUnit: string | null
  totalCount: number | null
  dosage: string | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string | null
}

const SUPPLEMENT_SCAN_PROMPT = `You are an expert at reading supplement bottle labels. Analyze the image(s) and extract information about the supplement. You may receive multiple images showing different sides of the same bottle (front, back, nutrition facts).

Combine information from ALL images to build a complete picture. The front usually has the product name and brand. The back/nutrition facts panel has serving size, servings per container, and ingredient amounts.

Look for:
1. **Product Name** - The supplement name (e.g., "Magnesium Glycinate", "Fish Oil", "Vitamin D3", "Omega-3")
2. **Brand** - The manufacturer/brand name (e.g., "NOW Foods", "Thorne", "Pure Encapsulations", "Life Extension")
3. **Serving Size** - Number of units per serving (just the number, e.g., 2 for "2 capsules per serving")
4. **Serving Unit** - Type of unit: capsule, tablet, softgel, scoop, drop, spray, gummy
5. **Total Count** - Total units in container (often calculated: servings per container x serving size)
6. **Dosage** - Amount of active ingredient per serving (e.g., "400mg", "1000 IU", "500mg EPA/DHA")

Return ONLY a JSON object with these fields (use null for any field you can't determine):
{
  "name": "standardized supplement name",
  "brand": "brand name if visible",
  "servingSize": numeric value only,
  "servingUnit": "capsule" or "tablet" or "softgel" or "scoop" or "drop" or "spray" or "gummy",
  "totalCount": numeric value only,
  "dosage": "amount with unit",
  "confidence": "high" or "medium" or "low",
  "rawText": "key visible text from the label(s)"
}

Important:
- Standardize supplement names (e.g., "Mag Glycinate" -> "Magnesium Glycinate")
- For fish oil, include EPA/DHA amounts in dosage if visible
- Common serving sizes: 1-3 capsules/tablets
- Calculate totalCount if you see "servings per container" (servings x serving size)
- If information is spread across multiple images, combine it
- Set confidence to "high" if you can read most fields clearly
- Return valid JSON only, no markdown formatting`

// POST /api/supplements/scan - Analyze supplement image(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support both single image and array of images
    const images: string[] = Array.isArray(body.images)
      ? body.images
      : body.image
        ? [body.image]
        : []

    if (images.length === 0) {
      return NextResponse.json({ error: 'At least one image is required' }, { status: 400 })
    }

    // Build image content array for multi-image analysis
    const imageContent = images.map((image, index) => {
      const imageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
      return {
        type: 'image_url' as const,
        image_url: {
          url: imageUrl,
          detail: 'high' as const
        }
      }
    })

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: SUPPLEMENT_SCAN_PROMPT
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: images.length > 1
                ? `Please analyze these ${images.length} supplement bottle images (front, back, etc.) and extract the label information. Combine details from all images.`
                : 'Please analyze this supplement bottle/package image and extract the label information.'
            },
            ...imageContent
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1, // Low temperature for consistent extraction
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
        name: null,
        brand: null,
        servingSize: null,
        servingUnit: null,
        totalCount: null,
        dosage: null,
        confidence: 'low',
        rawText: content
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Supplement scan error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze image' },
      { status: 500 }
    )
  }
}
