import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { getOpenAI, handleOpenAIError } from '@/lib/openai'
import { BIOMARKER_REGISTRY, computeFlag } from '@/lib/lab-biomarker-contract'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Lab Context Builder ──────────────────────────────────────────────────

interface LabBiomarkerRow {
  biomarkerKey: string
  value: number
  unit: string
  flag: string
  rangeLow?: number | null
  rangeHigh?: number | null
}

function buildLabContext(
  labUpload: { testDate: Date; labName: string | null; biomarkers: LabBiomarkerRow[] } | null,
  labResult: { testDate: Date; labName: string | null; markers: string } | null
): string {
  // Resolve biomarkers from either source
  let biomarkers: LabBiomarkerRow[] = []
  let testDate: Date | null = null
  let labName: string | null = null

  if (labUpload && labUpload.biomarkers.length > 0) {
    biomarkers = labUpload.biomarkers
    testDate = labUpload.testDate
    labName = labUpload.labName
  } else if (labResult) {
    testDate = labResult.testDate
    labName = labResult.labName
    try {
      const raw = JSON.parse(labResult.markers) as Array<{
        name?: string; displayName?: string; value?: number; unit?: string;
        rangeLow?: number; rangeHigh?: number; flag?: string
      }>
      biomarkers = raw
        .filter(m => m.value != null && m.unit)
        .map(m => {
          const key = m.name || m.displayName || ''
          const def = BIOMARKER_REGISTRY[key]
          return {
            biomarkerKey: key,
            value: Number(m.value),
            unit: m.unit!,
            flag: def ? computeFlag(key, Number(m.value)) : (m.flag || 'normal'),
            rangeLow: m.rangeLow ?? null,
            rangeHigh: m.rangeHigh ?? null,
          }
        })
    } catch {
      biomarkers = []
    }
  }

  if (biomarkers.length === 0) {
    return '=== LAB RESULTS ===\nNo lab results available.'
  }

  const daysSince = Math.round((Date.now() - testDate!.getTime()) / (1000 * 60 * 60 * 24))

  // Group by flag for a clear summary
  const critical = biomarkers.filter(b => b.flag === 'critical_low' || b.flag === 'critical_high')
  const outOfRange = biomarkers.filter(b => b.flag === 'low' || b.flag === 'high')
  const optimal = biomarkers.filter(b => b.flag === 'optimal')
  const normal = biomarkers.filter(b => b.flag === 'normal')

  const formatMarker = (b: LabBiomarkerRow) => {
    const def = BIOMARKER_REGISTRY[b.biomarkerKey]
    const name = def?.displayName ?? b.biomarkerKey
    const refRange = def
      ? `[ref: ${def.referenceRange.min}–${def.referenceRange.max} ${b.unit}]`
      : (b.rangeLow != null && b.rangeHigh != null ? `[ref: ${b.rangeLow}–${b.rangeHigh} ${b.unit}]` : '')
    return `  - ${name}: ${def ? def.format(b.value) : `${b.value} ${b.unit}`} (${b.flag}) ${refRange}`
  }

  const sections: string[] = []
  sections.push(`=== LAB RESULTS ===`)
  sections.push(`Lab: ${labName || 'Unknown'} | Date: ${testDate!.toLocaleDateString()} (${daysSince} days ago)`)
  sections.push(`Total: ${biomarkers.length} markers — ${optimal.length} optimal, ${normal.length} in range, ${outOfRange.length} out of range, ${critical.length} critical`)

  if (critical.length > 0) {
    sections.push(`\nCritical:`)
    sections.push(critical.map(formatMarker).join('\n'))
  }
  if (outOfRange.length > 0) {
    sections.push(`\nOut of Range:`)
    sections.push(outOfRange.map(formatMarker).join('\n'))
  }
  if (optimal.length > 0) {
    sections.push(`\nOptimal:`)
    sections.push(optimal.map(formatMarker).join('\n'))
  }
  if (normal.length > 0) {
    sections.push(`\nWithin Range:`)
    sections.push(normal.map(formatMarker).join('\n'))
  }

  return sections.join('\n')
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

      const [protocols, user, inventory, recentDoses, labUpload, labResult] = await Promise.all([
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
        prisma.labUpload.findFirst({
          where: { userId },
          orderBy: { testDate: 'desc' },
          include: { biomarkers: true },
        }),
        prisma.labResult.findFirst({
          where: { userId },
          orderBy: { testDate: 'desc' },
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

${buildLabContext(labUpload, labResult)}
`
    }

    const systemPrompt = `You are a knowledgeable assistant specializing in peptides, supplements, and wellness optimization. You're integrated into a tracking app called "Arc Protocol".

${userContext ? `Here is the user's current data:\n${userContext}` : 'The user has not set up any protocols yet.'}

Guidelines:
- Be helpful, direct, and conversational
- Reference their actual data - today's doses, adherence rate, inventory, and lab results
- Use **bold** for emphasis and bullet points for lists
- Keep responses concise but informative
- No medical disclaimers - they understand this already
- When suggesting peptides, consider what they're already taking
- If adherence is low, gently encourage without being preachy
- When discussing lab results, reference actual values and reference ranges
- Connect lab findings to their protocols when relevant (e.g. peptides that may influence certain biomarkers)
- Be balanced about lab results — note what's good alongside areas for attention
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
      max_tokens: 1500,
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
