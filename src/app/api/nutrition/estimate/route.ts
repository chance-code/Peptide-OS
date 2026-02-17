import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Create a new OpenAI client per request to avoid stale/cached state
// and ensure the current env var value is always used.
function createOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not configured')
  }
  return new OpenAI({ apiKey })
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

    const client = createOpenAI()

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

    // Use gpt-4o-mini: 16x cheaper than gpt-4o, excellent for nutrition estimation.
    // gpt-4o-mini handles both text and image inputs.
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: NUTRITION_ESTIMATE_PROMPT },
        { role: 'user', content: userContent }
      ],
      max_completion_tokens: 500,
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
  } catch (error: unknown) {
    console.error('Nutrition estimate error:', error)

    // Surface actionable error details instead of swallowing them
    let message = 'Failed to estimate nutrition'
    let status = 500

    if (error instanceof OpenAI.APIError) {
      status = error.status || 500
      const detail = typeof error.error === 'object' && error.error !== null
        ? JSON.stringify(error.error)
        : error.message
      console.error('OpenAI API error detail:', detail)
      if (error.status === 401) {
        message = 'OpenAI API key is invalid or expired'
      } else if (error.status === 429) {
        message = `OpenAI rate limit: ${error.message}`
        status = 429
      } else if (error.status === 402) {
        message = 'OpenAI API billing issue — check account credits'
      } else {
        message = `OpenAI API error: ${error.message}`
      }
    } else if (error instanceof Error) {
      if (error.message.includes('OPENAI_API_KEY')) {
        message = 'Server configuration error: API key not set'
      } else {
        message = error.message
      }
    }

    return NextResponse.json({ error: message }, { status })
  }
}
