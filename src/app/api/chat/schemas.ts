// ─── AI Assistant Response Contract ─────────────────────────────────────────
// Strict schemas for Router (classifier) and Generator (response) calls.
// UI owns all headings/labels — model outputs plain text only.

// ─── Router Result ──────────────────────────────────────────────────────────

export interface RouterResult {
  intent:
    | 'optimize_timing'
    | 'protocol_creation'
    | 'dosing_question'
    | 'education'
    | 'logging'
    | 'troubleshooting'
    | 'lab_interpretation'
    | 'other'
  needs_clarification: boolean
  clarifying_questions: string[] // 0–3 only
  missing_context: string[] // e.g. ["timeline", "goal", "experience", "dose_source"]
  recommended_mode:
    | 'ask_then_answer'
    | 'conditional_answer'
    | 'create_protocol'
    | 'direct_answer'
}

export const ROUTER_JSON_SCHEMA = {
  name: 'router_result',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string' as const,
        enum: [
          'optimize_timing',
          'protocol_creation',
          'dosing_question',
          'education',
          'logging',
          'troubleshooting',
          'lab_interpretation',
          'other',
        ],
      },
      needs_clarification: { type: 'boolean' as const },
      clarifying_questions: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      missing_context: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      recommended_mode: {
        type: 'string' as const,
        enum: [
          'ask_then_answer',
          'conditional_answer',
          'create_protocol',
          'direct_answer',
        ],
      },
    },
    required: [
      'intent',
      'needs_clarification',
      'clarifying_questions',
      'missing_context',
      'recommended_mode',
    ],
    additionalProperties: false,
  },
}

// ─── Assistant Structured Response ──────────────────────────────────────────

export interface AssistantStructuredResponse {
  acknowledgment: string // one line
  assumptions: string[] // optional, max 4
  questions: string[] // optional, max 3
  recommendation_paragraphs: string[] // 1–3 short paragraphs
  timeline_notes: string[] // optional, max 3
  watch_for: string[] // 2–5 bullets
  caveat: string // exactly one line
}

export const GENERATOR_JSON_SCHEMA = {
  name: 'assistant_response',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      acknowledgment: { type: 'string' as const },
      assumptions: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      questions: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      recommendation_paragraphs: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      timeline_notes: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      watch_for: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      caveat: { type: 'string' as const },
    },
    required: [
      'acknowledgment',
      'assumptions',
      'questions',
      'recommendation_paragraphs',
      'timeline_notes',
      'watch_for',
      'caveat',
    ],
    additionalProperties: false,
  },
}

// ─── Combined API Response ──────────────────────────────────────────────────

export interface ChatAPIResponse {
  reply: string // backward-compatible plain text fallback
  structured: AssistantStructuredResponse | null
  router: RouterResult | null
  schemaVersion: string
}
