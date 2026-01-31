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

// POST /api/chat - Chat with AI about peptides
export async function POST(request: NextRequest) {
  try {
    const { message, userId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Fetch user's protocols and schedule
    let userContext = ''
    if (userId) {
      const protocols = await prisma.protocol.findMany({
        where: { userId },
        include: { peptide: true },
      })

      const user = await prisma.userProfile.findUnique({
        where: { id: userId },
      })

      if (protocols.length > 0) {
        userContext = `
Current User: ${user?.name || 'Unknown'}

Active Protocols:
${protocols
  .filter(p => p.status === 'active')
  .map(p => {
    const days = p.customDays ? JSON.parse(p.customDays).join(', ') : p.frequency
    return `- ${p.peptide.name}: ${p.doseAmount} ${p.doseUnit}, ${days}, ${p.timing || 'no specific timing'}
  Notes: ${p.notes || 'none'}
  Started: ${new Date(p.startDate).toLocaleDateString()}${p.endDate ? `, Ends: ${new Date(p.endDate).toLocaleDateString()}` : ' (ongoing)'}`
  })
  .join('\n')}

Completed/Paused Protocols (Past Experience):
${protocols
  .filter(p => p.status !== 'active')
  .map(p => {
    const days = p.customDays ? JSON.parse(p.customDays).join(', ') : p.frequency
    return `- ${p.peptide.name} (${p.status}): was ${p.doseAmount} ${p.doseUnit}, ${days}
  Notes: ${p.notes || 'none'}`
  })
  .join('\n') || 'None'}
`
      }
    }

    const systemPrompt = `You are a knowledgeable health assistant specializing in peptides, supplements, and wellness optimization. You're integrated into a peptide tracking app called "Peptide OS".

${userContext ? `Here is the user's current peptide protocol information:\n${userContext}` : 'The user has not set up any protocols yet.'}

Guidelines:
- Be helpful, direct, and informative - share practical insights freely
- When discussing peptides, include mechanisms, typical dosing, timing, benefits, and what to expect
- Do NOT add disclaimers about consulting doctors or that you can't give medical advice - the user understands this already
- ALWAYS reference the user's current and past protocols when making recommendations
- When suggesting new peptides, consider what they're already taking to avoid redundancy, suggest synergies, and note any timing considerations
- Factor in their completed protocols as past experience - they already know those peptides
- Be conversational and knowledgeable, like a well-informed friend who knows peptides
- Share specific, actionable information rather than vague suggestions
- Keep responses focused and practical`

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.'

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    )
  }
}
