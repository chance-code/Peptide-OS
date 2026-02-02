import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { getOpenAI, handleOpenAIError } from '@/lib/openai'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// POST /api/chat - Chat with AI about peptides
export async function POST(request: NextRequest) {
  try {
    const { message, messages, userId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Fetch user's protocols, inventory, and dose history
    let userContext = ''
    if (userId) {
      const today = new Date()
      const thirtyDaysAgo = subDays(today, 30)

      const [protocols, user, inventory, recentDoses] = await Promise.all([
        prisma.protocol.findMany({
          where: { userId },
          include: { peptide: true },
        }),
        prisma.userProfile.findUnique({
          where: { id: userId },
        }),
        prisma.inventoryVial.findMany({
          where: { userId },
          include: { peptide: true },
        }),
        prisma.doseLog.findMany({
          where: {
            userId,
            scheduledDate: { gte: thirtyDaysAgo },
          },
          include: {
            protocol: { include: { peptide: true } },
          },
          orderBy: { scheduledDate: 'desc' },
        }),
      ])

      // Calculate adherence stats
      const totalDoses = recentDoses.length
      const completedDoses = recentDoses.filter(d => d.status === 'completed').length
      const skippedDoses = recentDoses.filter(d => d.status === 'skipped').length
      const adherenceRate = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0

      // Today's doses
      const todaysDoses = recentDoses.filter(d => {
        const doseDate = new Date(d.scheduledDate)
        return doseDate >= startOfDay(today) && doseDate <= endOfDay(today)
      })
      const todayCompleted = todaysDoses.filter(d => d.status === 'completed').length
      const todayTotal = todaysDoses.length

      // Build context
      userContext = `
Current User: ${user?.name || 'Unknown'}

=== TODAY'S PROGRESS ===
${todayTotal > 0 ? `Completed ${todayCompleted}/${todayTotal} doses today` : 'No doses scheduled today'}
${todaysDoses.map(d => `- ${d.protocol.peptide.name}: ${d.status}`).join('\n')}

=== 30-DAY ADHERENCE ===
Overall: ${adherenceRate}% (${completedDoses}/${totalDoses} doses completed)
Skipped: ${skippedDoses} doses

=== ACTIVE PROTOCOLS ===
${protocols
  .filter(p => p.status === 'active')
  .map(p => {
    const days = p.customDays ? JSON.parse(p.customDays).join(', ') : p.frequency
    return `- ${p.peptide.name}: ${p.doseAmount} ${p.doseUnit}, ${days}, ${p.timing || 'no specific timing'}
  Notes: ${p.notes || 'none'}
  Started: ${new Date(p.startDate).toLocaleDateString()}${p.endDate ? `, Ends: ${new Date(p.endDate).toLocaleDateString()}` : ' (ongoing)'}`
  })
  .join('\n') || 'None'}

=== INVENTORY ===
${inventory.map(v => {
  const isExpired = v.expirationDate && new Date(v.expirationDate) < today
  const status = v.isExhausted ? '(empty)' : isExpired ? '(expired)' : ''
  return `- ${v.peptide.name}: ${v.totalAmount}${v.totalUnit} ${status}`
}).join('\n') || 'No inventory'}

=== PAST PROTOCOLS ===
${protocols
  .filter(p => p.status !== 'active')
  .map(p => `- ${p.peptide.name} (${p.status})`)
  .join('\n') || 'None'}
`
    }

    const systemPrompt = `You are a knowledgeable assistant specializing in peptides, supplements, and wellness optimization. You're integrated into a tracking app called "PepTrack".

${userContext ? `Here is the user's current data:\n${userContext}` : 'The user has not set up any protocols yet.'}

Guidelines:
- Be helpful, direct, and conversational
- Reference their actual data - today's doses, adherence rate, inventory
- Use **bold** for emphasis and bullet points for lists
- Keep responses concise but informative
- No medical disclaimers - they understand this already
- When suggesting peptides, consider what they're already taking
- If adherence is low, gently encourage without being preachy
- Be like a knowledgeable friend, not a formal assistant`

    // Build conversation history for context
    const conversationHistory: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ]

    // Add previous messages for context (limit to last 10 for token efficiency)
    if (messages && Array.isArray(messages)) {
      const recentMessages = messages.slice(-10)
      for (const msg of recentMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          conversationHistory.push({
            role: msg.role,
            content: msg.content,
          })
        }
      }
    }

    // Add the current message
    conversationHistory.push({ role: 'user', content: message })

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationHistory,
      max_tokens: 1000,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.'

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Chat error:', error)
    const { message, status } = handleOpenAIError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
