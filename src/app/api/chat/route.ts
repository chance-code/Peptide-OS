import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getOpenAI, handleOpenAIError } from '@/lib/openai'
import {
  type RouterResult,
  type AssistantStructuredResponse,
  type ChatAPIResponse,
  ROUTER_JSON_SCHEMA,
  GENERATOR_JSON_SCHEMA,
} from './schemas'
import { buildFewShotMessages } from './examples'
import { buildRichHealthContext } from './health-context'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ─── Router Call (cheap classifier — stays on gpt-4o-mini) ───────────────────

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

    if (result.clarifying_questions.length > 3) {
      result.clarifying_questions = result.clarifying_questions.slice(0, 3)
    }

    return result
  } catch (e) {
    console.error('[Chat Router] Failed:', e)
    return null
  }
}

// ─── Generator Call (main response — upgraded to gpt-4o) ─────────────────────

function buildGeneratorSystemPrompt(
  userContext: string,
  routerResult: RouterResult | null,
  clientSystemContext: string | null
): string {
  const modeInstruction = routerResult?.recommended_mode === 'ask_then_answer'
    ? 'The user needs clarification. Include your questions in the "questions" array and provide only a light conditional recommendation — do not give an overconfident plan.'
    : routerResult?.recommended_mode === 'conditional_answer'
      ? 'You have some but not all context. Make your assumptions explicit in the "assumptions" array and provide a conditional recommendation.'
      : 'You have sufficient context. Provide a direct, specific recommendation.'

  let prompt = `You are Arc Protocol's AI copilot — an expert in peptides, supplements, health optimization, and biometric interpretation. You have access to the user's full health profile including wearable data, lab results, protocol adherence, and health trend analysis.

${userContext ? `User health profile:\n${userContext}` : 'The user has not set up any protocols yet.'}

${modeInstruction}

Response rules:
- NO markdown headings (no #, ##, ###). No hashtags. No "Phase 1/2" structure.
- Write in plain text. Short paragraphs. Skimmable.
- Reference the user's actual data when available — cite specific numbers, trends, and scores.
- When health domain scores are available, reference them: "Your Recovery is at 42/100 and declining."
- When protocol evidence is available, reference it: "Your BPC-157 shows a likely positive verdict after 21 days."
- When health trends are available, reference the direction and magnitude.
- Be direct and conversational — like a knowledgeable friend who can see your dashboard.
- "acknowledgment": one sentence acknowledging what they asked.
- "assumptions": list what you are assuming (max 4). Empty if none.
- "questions": max 1 clarifying question. Prefer giving a conditional answer over asking. Empty if none needed.
- "recommendation_paragraphs": 1-3 short paragraphs with your actual advice. Include "why" reasoning grounded in their data. Always provide at least one paragraph even when asking questions.
- "timeline_notes": expected timelines if applicable (max 3). Empty if not relevant.
- "watch_for": 2-5 things to monitor. Always include at least 2. Reference their specific metrics when possible.
- "caveat": exactly one short line at the end. Keep it brief and relevant.
- Do NOT use ** for bold or any other markdown formatting in your output.
- Do NOT give protocol-style directives ("take X mg daily") unless the user has confirmed a clinician prescribed that dose.
- When evidence grades are relevant, mention them: "Grade A evidence supports..." or "This is Grade B/C (experimental)..."
- Connect multiple signals when relevant: sleep + HRV + adherence → holistic recommendation.
- You have data from the last 30 days only. Ask if user has longer-term trends in mind.
- Do NOT cite studies you're uncertain about. If asked for evidence, say "Based on published research" without specific study claims.
- When in doubt about dosing, defer to the user's clinician rather than inferring.`

  // Merge client-side system context (from iOS PromptPackager) if present
  if (clientSystemContext) {
    prompt += `\n\nAdditional context from device:\n${clientSystemContext}`
  }

  return prompt
}

async function generatorCall(
  message: string,
  userContext: string,
  conversationHistory: OpenAI.ChatCompletionMessageParam[],
  routerResult: RouterResult | null,
  clientSystemContext: string | null
): Promise<AssistantStructuredResponse | null> {
  try {
    const systemPrompt = buildGeneratorSystemPrompt(userContext, routerResult, clientSystemContext)

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ]

    // Add few-shot examples
    const fewShot = buildFewShotMessages()
    for (const msg of fewShot) {
      messages.push(msg)
    }

    // Add conversation history (user + assistant only — system already set)
    for (const msg of conversationHistory) {
      if (msg.role !== 'system') {
        messages.push(msg)
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message })

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.5,
      max_tokens: 2500,
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

    // ── Fetch rich health context (replaces old ad-hoc context builder) ──
    let userContext = ''
    let hasBrainData = false
    let hasEvidenceData = false

    if (userId) {
      const healthContext = await buildRichHealthContext(userId)
      userContext = healthContext.userContext
      hasBrainData = healthContext.hasBrainData
      hasEvidenceData = healthContext.hasEvidenceData
    }

    // ── Extract client-side system context (from iOS PromptPackager) ──
    let clientSystemContext: string | null = null
    if (messages && Array.isArray(messages)) {
      const systemMsg = messages.find((m: ChatMessage) => m.role === 'system')
      if (systemMsg) {
        clientSystemContext = systemMsg.content
      }
    }

    // ── Build recent history summary for router ──
    const recentHistory = (messages || [])
      .filter((m: ChatMessage) => m.role !== 'system')
      .slice(-6)
      .map((m: ChatMessage) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    // ── Build conversation history for generator ──
    const conversationHistory: OpenAI.ChatCompletionMessageParam[] = []
    if (messages && Array.isArray(messages)) {
      for (const msg of messages.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
          conversationHistory.push({ role: msg.role, content: msg.content })
        }
      }
    }

    // ── Step 1: Router (cheap classifier on gpt-4o-mini) ──
    const routerResult = await routerCall(message, userContext, recentHistory)

    // ── Step 2: Generator (structured response on gpt-4o) ──
    const structured = await generatorCall(
      message,
      userContext,
      conversationHistory,
      routerResult,
      clientSystemContext
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
      has_brain_data: hasBrainData,
      has_evidence_data: hasEvidenceData,
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
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are Arc Protocol's AI copilot — expert in peptides, supplements, and health optimization. Be direct and conversational. No markdown headings. Short paragraphs. Reference the user's actual data.\n\n${userContext ? `User health profile:\n${userContext}` : ''}`,
        },
        ...conversationHistory,
        { role: 'user', content: message },
      ],
      max_tokens: 2500,
      temperature: 0.5,
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
