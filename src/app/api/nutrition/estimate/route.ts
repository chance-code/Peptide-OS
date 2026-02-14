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

const NUTRITION_ESTIMATE_PROMPT = `You are a nutrition expert. Analyze the food and estimate macronutrients.

Return ONLY a JSON object:
{
  "foodName": "descriptive name of the food/meal",
  "calories": estimated total calories (number),
  "proteinGrams": estimated protein in grams (number),
  "carbGrams": estimated carbs in grams (number),
  "fatGrams": estimated fat in grams (number),
  "confidence": 0.0 to 1.0 (how confident you are),
  "reasoning": "brief explanation of your estimate"
}

Guidelines:
- For photos: estimate portion sizes visually. A dinner plate is ~10 inches. Use standard serving references.
- For text descriptions: use USDA standard portions unless specified.
- Set confidence: 0.8+ for clearly identifiable single foods, 0.5-0.7 for mixed meals, 0.3-0.5 for ambiguous items.
- Round to nearest 5 calories, nearest gram for macros.
- Return valid JSON only, no markdown.`

// POST /api/nutrition/estimate - Estimate nutrition from photo or text
// Auth: excluded from middleware to prevent POST→GET redirect on 302.
// Validates userId presence as lightweight auth check.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image, description, userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!image && !description) {
      return NextResponse.json(
        { error: 'Image or description required' },
        { status: 400 }
      )
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

    if (description) {
      userContent.push({
        type: 'text',
        text: `Estimate the nutrition for: ${description}`
      })
    }

    if (image) {
      const imageUrl = image.startsWith('data:')
        ? image
        : `data:image/jpeg;base64,${image}`
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'high' }
      })
      if (!description) {
        userContent.push({
          type: 'text',
          text: 'Estimate the nutrition for the food shown in this image.'
        })
      }
    }

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: NUTRITION_ESTIMATE_PROMPT },
        { role: 'user', content: userContent }
      ],
      max_tokens: 500,
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim()

    let result
    try {
      result = JSON.parse(cleanContent)
    } catch {
      result = {
        foodName: null,
        calories: null,
        proteinGrams: null,
        carbGrams: null,
        fatGrams: null,
        confidence: 0.3,
        reasoning: content
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Nutrition estimate error:', error)
    return NextResponse.json(
      { error: 'Failed to estimate nutrition' },
      { status: 500 }
    )
  }
}
