import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getAuthenticatedUserId } from '@/lib/api-auth'

/**
 * POST /api/supplements/photo-parse
 *
 * Refocus Phase 2.F fallback for the photo-add flow:
 *   iOS first runs Apple Vision VNRecognizeTextRequest on-device.
 *   If the on-device parse is incomplete (missing name + doseAmount + doseUnit)
 *   or the fuzzy-match confidence against SupplementReference is < 60%,
 *   iOS POSTs the image here for a GPT-4o vision parse.
 *
 * Request:
 *   multipart/form-data with field "image" = JPEG (≤ 1024 px long edge, q≈0.7)
 *   Alternate: JSON body { imageBase64: string }  (base64-encoded JPEG)
 *
 * Response:
 *   200 { name, doseAmount, doseUnit, servingSize, servingUnit, brand, confidence }
 *   4xx { error }
 *
 * Cost note:
 *   GPT-4o vision on a compressed JPEG ≈ $0.003/call. Monitor via analytics
 *   event supplement.photo.llm_fallback on the client.
 */

interface ParseResult {
  name: string | null
  type: 'supplement' | 'medication' | 'peptide'
  doseAmount: number | null
  doseUnit: 'mcg' | 'mg' | 'IU' | null
  servingSize: number | null
  servingUnit: string | null
  brand: string | null
  confidence: 'high' | 'medium' | 'low'
  timing: 'morning' | 'evening' | 'before bed' | null
  vialAmount: number | null
  vialUnit: string | null
}

const SYSTEM_PROMPT = `You identify and extract dose information from supplement bottles, medication bottles, and peptide vials.

Return ONLY a JSON object (no prose, no markdown). Include every field with null when unknown.

Fields:
- name        (canonical name, e.g. "Citalopram", "BPC-157", "Magnesium Glycinate")
- type        ("medication" | "supplement" | "peptide")
              medication = pharmaceutical drug: SSRIs, antidepressants, blood pressure, statins, antibiotics, hormones, sleep aids, pain meds, diabetes drugs
              supplement = vitamins, minerals, herbs, amino acids, adaptogens (e.g. Vitamin D, Fish Oil, Ashwagandha, Creatine)
              peptide = research peptides or GLP-1/GIP agonists in lyophilized vials (e.g. BPC-157, Semaglutide, Tirzepatide, TB-500)
- doseAmount  (numeric, active ingredient per serving or per injection for peptides)
- doseUnit    ("mcg" | "mg" | "IU" only; use "IU" for vitamins A/D/E)
- servingSize (integer, units per serving; null for peptide vials)
- servingUnit ("capsule" | "tablet" | "softgel" | "scoop" | "injection" | null)
- brand       (manufacturer name)
- confidence  ("high" | "medium" | "low" based on label legibility)
- timing      typical administration: "morning" | "evening" | "before bed" | null
- vialAmount  (peptides only: total mg in vial, e.g. 5 for a "5 mg" vial; null otherwise)
- vialUnit    (peptides only: "mg"; null otherwise)

Rules:
- doseAmount is PER SERVING for oral items, or PER INJECTION for peptides — not total vial content.
- For peptides, doseAmount is the injection dose in mcg (e.g. 250 for a typical 250 mcg BPC-157 injection).
- If multiple ingredients listed, use the primary active ingredient matching the product name.
- For medications, use the labeled dose shown on the bottle.
- Ignore "Daily Value %" numbers.`

let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    let imageBase64: string | null = null

    // Accept either multipart form or JSON body with base64
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('image')
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: 'Missing image field' }, { status: 400 })
      }
      const buf = Buffer.from(await file.arrayBuffer())
      // Cap at 2 MB to keep OpenAI token costs predictable
      if (buf.byteLength > 2 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 })
      }
      imageBase64 = buf.toString('base64')
    } else {
      const body = await request.json()
      if (typeof body?.imageBase64 !== 'string' || body.imageBase64.length < 100) {
        return NextResponse.json({ error: 'Missing imageBase64 field' }, { status: 400 })
      }
      imageBase64 = body.imageBase64
    }

    const client = getOpenAI()

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the structured dose data from this supplement bottle.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    })

    const raw = response.choices?.[0]?.message?.content
    if (!raw) {
      return NextResponse.json({ error: 'Empty LLM response' }, { status: 502 })
    }

    let parsed: ParseResult
    try {
      parsed = JSON.parse(raw) as ParseResult
    } catch {
      return NextResponse.json(
        { error: 'LLM returned non-JSON', raw: raw.slice(0, 500) },
        { status: 502 },
      )
    }

    // Coerce types defensively
    const result: ParseResult = {
      name: typeof parsed.name === 'string' ? parsed.name.trim() || null : null,
      type:
        parsed.type === 'medication' || parsed.type === 'peptide' ? parsed.type : 'supplement',
      doseAmount:
        typeof parsed.doseAmount === 'number' && parsed.doseAmount > 0
          ? parsed.doseAmount
          : null,
      doseUnit:
        parsed.doseUnit === 'mcg' || parsed.doseUnit === 'mg' || parsed.doseUnit === 'IU'
          ? parsed.doseUnit
          : null,
      servingSize:
        typeof parsed.servingSize === 'number' && parsed.servingSize > 0
          ? Math.round(parsed.servingSize)
          : null,
      servingUnit: typeof parsed.servingUnit === 'string' ? parsed.servingUnit : null,
      brand: typeof parsed.brand === 'string' ? parsed.brand.trim() || null : null,
      confidence:
        parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
          ? parsed.confidence
          : 'low',
      timing:
        parsed.timing === 'morning' || parsed.timing === 'evening' || parsed.timing === 'before bed'
          ? parsed.timing
          : null,
      vialAmount:
        typeof parsed.vialAmount === 'number' && parsed.vialAmount > 0 ? parsed.vialAmount : null,
      vialUnit: typeof parsed.vialUnit === 'string' ? parsed.vialUnit.trim() || null : null,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[photo-parse] error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Photo parse failed' }, { status: 500 })
  }
}
