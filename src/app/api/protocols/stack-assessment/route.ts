import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getOpenAI, handleOpenAIError } from '@/lib/openai'

interface StackAssessmentResponse {
  summary: string
  synergies: string[]
  considerations: string[]
  overallScore: 'excellent' | 'good' | 'moderate' | 'needs_attention'
}

// GET /api/protocols/stack-assessment?userId=xxx
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Fetch all active protocols for user
    const protocols = await prisma.protocol.findMany({
      where: {
        userId,
        status: 'active',
      },
      include: { peptide: true },
    })

    if (protocols.length === 0) {
      return NextResponse.json({
        summary: 'No active protocols to assess.',
        synergies: [],
        considerations: [],
        overallScore: 'moderate',
      })
    }

    // Build protocol list for prompt
    const protocolList = protocols.map(p => {
      let timingDisplay = p.timing || 'Not specified'
      if (p.timings) {
        try {
          const parsed = JSON.parse(p.timings) as string[]
          if (parsed.length > 0) timingDisplay = parsed.join(' & ')
        } catch {}
      }
      return `- ${p.peptide.name} (${p.peptide.type || 'peptide'}): ${p.doseAmount} ${p.doseUnit}, ${timingDisplay}, ${p.frequency}`
    }).join('\n')

    const prompt = `You are a peptide and supplement stack optimization expert with deep knowledge of clinical research.

Analyze this user's current active protocol stack:

${protocolList}

Provide a concise assessment:

1. **SUMMARY** (2-3 sentences): Overall assessment of this stack - is it well-designed? What's the primary focus/goal it seems optimized for?

2. **SYNERGIES** (2-3 bullet points): Positive interactions or complementary effects between items in this stack.

3. **CONSIDERATIONS** (1-2 bullet points): Any timing conflicts, redundancies, or optimizations to consider. If the stack is well-optimized, say so.

4. **OVERALL_SCORE**: Rate as one of: "excellent", "good", "moderate", "needs_attention"

Be direct and evidence-based. No fluff.

Respond with valid JSON only (no markdown):
{
  "summary": "...",
  "synergies": ["...", "..."],
  "considerations": ["..."],
  "overallScore": "excellent|good|moderate|needs_attention"
}`

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a research expert. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.7,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    let assessment: StackAssessmentResponse
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      assessment = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse stack assessment:', responseText)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    return NextResponse.json(assessment, {
      headers: {
        'Cache-Control': 'private, max-age=3600', // 1 hour cache
      },
    })
  } catch (error) {
    console.error('Stack assessment error:', error)
    const { message, status } = handleOpenAIError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
