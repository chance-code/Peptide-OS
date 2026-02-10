import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { getOpenAI, handleOpenAIError } from '@/lib/openai'
import { BIOMARKER_REGISTRY, computeFlag } from '@/lib/lab-biomarker-contract'
import {
  type RouterResult,
  type AssistantStructuredResponse,
  type ChatAPIResponse,
  ROUTER_JSON_SCHEMA,
  GENERATOR_JSON_SCHEMA,
} from './schemas'
import { buildFewShotMessages } from './examples'

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
    return 'Lab results: none available.'
  }

  const daysSince = Math.round((Date.now() - testDate!.getTime()) / (1000 * 60 * 60 * 24))

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
  sections.push(`Lab: ${labName || 'Unknown'} | ${testDate!.toLocaleDateString()} (${daysSince}d ago)`)
  sections.push(`${biomarkers.length} markers: ${optimal.length} optimal, ${normal.length} normal, ${outOfRange.length} flagged, ${critical.length} critical`)

  if (critical.length > 0) {
    sections.push(`Critical:\n${critical.map(formatMarker).join('\n')}`)
  }
  if (outOfRange.length > 0) {
    sections.push(`Flagged:\n${outOfRange.map(formatMarker).join('\n')}`)
  }
  if (optimal.length > 0) {
    sections.push(`Optimal:\n${optimal.map(formatMarker).join('\n')}`)
  }

  return sections.join('\n')
}

// ─── Router Call (cheap classifier) ─────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `You are a message classifier for a peptide/supplement tracking app.
Analyze the user's message and their known context to determine:
1. What they want (intent)
2. Whether you need more info before answering (needs_clarification)
3. If so, what 1-3 short, high-value questions to ask
4. What context is missing

Rules:
- Max 3 clarifying questions. Fewer is better.
- Questions must be short and specific — not open-ended.
- If the user provides enough context, set needs_clarification=false and questions=[].
- If the user mentions a dose source (clinician, doctor, prescription), do NOT ask about it.
- missing_context should only list what you genuinely cannot infer from their data.`

async function routerCall(
  message: string,
  userContext: string,
  recentHistory: string
): Promise<RouterResult | null> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Known context:\n${userContext || 'No user data available.'}\n\nRecent conversation:\n${recentHistory || 'None'}\n\nNew message: "${message}"`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: ROUTER_JSON_SCHEMA,
      },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return null
    const result = JSON.parse(raw) as RouterResult

    // Enforce max 3 questions
    if (result.clarifying_questions.length > 3) {
      result.clarifying_questions = result.clarifying_questions.slice(0, 3)
    }

    return result
  } catch (e) {
    console.error('[Chat Router] Failed:', e)
    return null
  }
}

// ─── Generator Call (main response) ──────────────────────────────────────────

function buildGeneratorSystemPrompt(
  userContext: string,
  routerResult: RouterResult | null
): string {
  const modeInstruction = routerResult?.recommended_mode === 'ask_then_answer'
    ? 'The user needs clarification. Include your questions in the "questions" array and provide only a light conditional recommendation — do not give an overconfident plan.'
    : routerResult?.recommended_mode === 'conditional_answer'
      ? 'You have some but not all context. Make your assumptions explicit in the "assumptions" array and provide a conditional recommendation.'
      : 'You have sufficient context. Provide a direct, specific recommendation.'

  return `You are a knowledgeable assistant in a peptide/supplement tracking app called Arc Protocol.

${userContext ? `User data:\n${userContext}` : 'The user has not set up any protocols yet.'}

${modeInstruction}

Response rules:
- NO markdown headings (no #, ##, ###). No hashtags. No "Phase 1/2" structure.
- Write in plain text. Short paragraphs. Skimmable.
- Reference the user's actual data when available.
- Be direct and conversational — like a knowledgeable friend.
- "acknowledgment": one sentence acknowledging what they asked.
- "assumptions": list what you are assuming (max 4). Empty if none.
- "questions": clarifying questions (max 3). Empty if none needed.
- "recommendation_paragraphs": 1-3 short paragraphs with your actual advice. Include "why" reasoning. Always provide at least one paragraph even when asking questions.
- "timeline_notes": expected timelines if applicable (max 3). Empty if not relevant.
- "watch_for": 2-5 things to monitor. Always include at least 2.
- "caveat": exactly one short line at the end. Keep it brief and relevant.
- Do NOT use ** for bold or any other markdown formatting in your output.
- Do NOT give protocol-style directives ("take X mg daily") unless the user has confirmed a clinician prescribed that dose.`
}

async function generatorCall(
  message: string,
  userContext: string,
  conversationHistory: OpenAI.ChatCompletionMessageParam[],
  routerResult: RouterResult | null
): Promise<AssistantStructuredResponse | null> {
  try {
    const systemPrompt = buildGeneratorSystemPrompt(userContext, routerResult)

    // Build messages: system + few-shot + conversation history + current
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ]

    // Add few-shot examples
    const fewShot = buildFewShotMessages()
    for (const msg of fewShot) {
      messages.push(msg)
    }

    // Add conversation history (skip system messages)
    for (const msg of conversationHistory) {
      if (msg.role !== 'system') {
        messages.push(msg)
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message })

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 1500,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: GENERATOR_JSON_SCHEMA,
      },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return null

    const response = JSON.parse(raw) as AssistantStructuredResponse

    // Enforce constraints
    if (response.questions.length > 3) {
      response.questions = response.questions.slice(0, 3)
    }
    if (response.assumptions.length > 4) {
      response.assumptions = response.assumptions.slice(0, 4)
    }

    return response
  } catch (e) {
    console.error('[Chat Generator] Failed:', e)
    return null
  }
}

// ─── Flatten structured response to plain text (backward-compat) ────────────

function flattenToPlainText(response: AssistantStructuredResponse): string {
  const parts: string[] = []

  parts.push(response.acknowledgment)

  if (response.assumptions.length > 0) {
    parts.push('')
    parts.push('Assuming: ' + response.assumptions.join('; '))
  }

  if (response.questions.length > 0) {
    parts.push('')
    for (const q of response.questions) {
      parts.push(`- ${q}`)
    }
  }

  for (const p of response.recommendation_paragraphs) {
    parts.push('')
    parts.push(p)
  }

  if (response.timeline_notes.length > 0) {
    parts.push('')
    for (const t of response.timeline_notes) {
      parts.push(`- ${t}`)
    }
  }

  if (response.watch_for.length > 0) {
    parts.push('')
    for (const w of response.watch_for) {
      parts.push(`- ${w}`)
    }
  }

  parts.push('')
  parts.push(response.caveat)

  return parts.join('\n')
}

// ─── POST /api/chat ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const { message, messages, userId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // ── Fetch user context ──
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

      const totalDoses = recentDoses.length
      const completedDoses = recentDoses.filter(d => d.status === 'completed').length
      const skippedDoses = recentDoses.filter(d => d.status === 'skipped').length
      const adherenceRate = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0

      const todaysDoses = recentDoses.filter(d => {
        const doseDate = new Date(d.scheduledDate)
        return doseDate >= startOfDay(today) && doseDate <= endOfDay(today)
      })
      const todayCompleted = todaysDoses.filter(d => d.status === 'completed').length
      const todayTotal = todaysDoses.length

      userContext = `User: ${user?.name || 'Unknown'}
Today: ${todayTotal > 0 ? `${todayCompleted}/${todayTotal} doses done` : 'No doses scheduled'}${todaysDoses.length > 0 ? '\n' + todaysDoses.map(d => `  ${d.protocol.peptide.name}: ${d.status}`).join('\n') : ''}
30-day adherence: ${adherenceRate}% (${completedDoses}/${totalDoses} completed, ${skippedDoses} skipped)
Active protocols: ${protocols
  .filter(p => p.status === 'active')
  .map(p => {
    const days = p.customDays ? JSON.parse(p.customDays).join(', ') : p.frequency
    return `${p.peptide.name} ${p.doseAmount}${p.doseUnit} ${days} ${p.timing || ''}`.trim() +
      (p.notes ? ` [${p.notes}]` : '') +
      ` (started ${new Date(p.startDate).toLocaleDateString()}${p.endDate ? `, ends ${new Date(p.endDate).toLocaleDateString()}` : ''})`
  })
  .join('; ') || 'None'}
Inventory: ${inventory.map(v => {
  const isExpired = v.expirationDate && new Date(v.expirationDate) < today
  const status = v.isExhausted ? ' (empty)' : isExpired ? ' (expired)' : ''
  return `${v.peptide.name} ${v.totalAmount}${v.totalUnit}${status}`
}).join('; ') || 'None'}
Past protocols: ${protocols.filter(p => p.status !== 'active').map(p => `${p.peptide.name} (${p.status})`).join('; ') || 'None'}
${buildLabContext(labUpload, labResult)}`
    }

    // ── Build recent history summary for router ──
    const recentHistory = (messages || [])
      .slice(-6)
      .map((m: ChatMessage) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    // ── Build conversation history for generator ──
    const conversationHistory: OpenAI.ChatCompletionMessageParam[] = []
    if (messages && Array.isArray(messages)) {
      for (const msg of messages.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          conversationHistory.push({ role: msg.role, content: msg.content })
        }
      }
    }

    // ── Step 1: Router (cheap classifier) ──
    const routerResult = await routerCall(message, userContext, recentHistory)

    // ── Step 2: Generator (structured response) ──
    const structured = await generatorCall(
      message,
      userContext,
      conversationHistory,
      routerResult
    )

    // ── Build response ──
    const latencyMs = Date.now() - startTime

    // Telemetry logging
    console.log(JSON.stringify({
      event: 'chat_response',
      intent: routerResult?.intent ?? 'unknown',
      needs_clarification: routerResult?.needs_clarification ?? false,
      questions_count: structured?.questions?.length ?? 0,
      mode: routerResult?.recommended_mode ?? 'unknown',
      latency_ms: latencyMs,
      structured_success: structured !== null,
    }))

    if (structured) {
      const apiResponse: ChatAPIResponse = {
        reply: flattenToPlainText(structured),
        structured,
        router: routerResult,
        schemaVersion: '2.0.0',
      }
      return NextResponse.json(apiResponse)
    }

    // ── Fallback: single unstructured call (if router+generator both fail) ──
    const fallbackCompletion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a knowledgeable assistant in a peptide/supplement tracking app. Be direct and conversational. No markdown headings. Short paragraphs.\n\n${userContext ? `User data:\n${userContext}` : ''}`,
        },
        ...conversationHistory,
        { role: 'user', content: message },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    })

    const fallbackReply = fallbackCompletion.choices[0]?.message?.content
      || 'Sorry, I could not generate a response.'

    return NextResponse.json({
      reply: fallbackReply,
      structured: null,
      router: null,
      schemaVersion: '2.0.0',
    } satisfies ChatAPIResponse)
  } catch (error) {
    console.error('Chat error:', error)
    const { message: errMsg, status } = handleOpenAIError(error)
    return NextResponse.json({ error: errMsg }, { status })
  }
}
