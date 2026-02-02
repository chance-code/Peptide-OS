import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import prisma from '@/lib/prisma'

// Lazy initialize to avoid build-time errors
let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

interface InsightsResponse {
  benefit: string
  assessment: {
    summary: string
    strengths: string[]
    suggestions: string[]
  }
}

function buildInsightsPrompt(
  peptideName: string,
  type: string,
  doseAmount: number,
  doseUnit: string,
  timing: string | null,
  timings: string | null,
  frequency: string,
  notes: string | null
): string {
  // Parse timings if available
  let timingDisplay = timing || 'Not specified'
  if (timings) {
    try {
      const parsed = JSON.parse(timings) as string[]
      if (parsed.length > 0) {
        timingDisplay = parsed.join(' & ')
      }
    } catch {
      // Use single timing
    }
  }

  const itemType = type === 'supplement' ? 'supplement' : 'peptide'

  return `You are a ${itemType} and biohacking research expert with deep knowledge of the latest clinical studies and research papers.

Analyze this ${itemType} protocol and provide insights:

**${itemType.toUpperCase()}:** ${peptideName}
**DOSE:** ${doseAmount} ${doseUnit}
**TIMING:** ${timingDisplay}
**FREQUENCY:** ${frequency}
${notes ? `**NOTES:** ${notes}` : ''}

Provide:

1. **BENEFIT** (2-3 sentences max): The primary benefit and mechanism of action of ${peptideName} based on current peer-reviewed research. Be specific about HOW it works at a biological level.

2. **ASSESSMENT** of this specific protocol:
   - **summary**: One sentence overall assessment
   - **strengths**: 2-3 specific things this protocol does well (dosing, timing, frequency)
   - **suggestions**: 1-2 evidence-based optimizations, OR "Protocol is well-optimized" if nothing to improve

Be concise and direct. No fluff. Base everything on published research.

Respond with valid JSON only (no markdown code blocks):
{
  "benefit": "...",
  "assessment": {
    "summary": "...",
    "strengths": ["...", "..."],
    "suggestions": ["..."]
  }
}`
}

// GET /api/protocols/[id]/insights
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch the protocol with peptide info
    const protocol = await prisma.protocol.findUnique({
      where: { id },
      include: { peptide: true },
    })

    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    const prompt = buildInsightsPrompt(
      protocol.peptide.name,
      protocol.peptide.type || 'peptide',
      protocol.doseAmount,
      protocol.doseUnit,
      protocol.timing,
      protocol.timings,
      protocol.frequency,
      protocol.notes
    )

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a research expert. Always respond with valid JSON only, no markdown formatting.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse JSON response
    let insights: InsightsResponse
    try {
      // Clean up response if it has markdown code blocks
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      insights = JSON.parse(cleanedResponse)
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText)
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      )
    }

    return NextResponse.json(insights)
  } catch (error) {
    console.error('Insights error:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}
