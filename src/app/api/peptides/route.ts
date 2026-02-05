import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { normalizeProtocolName } from '@/lib/supplement-normalization'
import { PROTOCOL_MECHANISMS } from '@/lib/protocol-mechanisms'
import OpenAI from 'openai'

let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

const KNOWN_CANONICAL_NAMES = Object.keys(PROTOCOL_MECHANISMS)

/**
 * Classify a supplement/peptide name to its canonical mechanism name.
 * Tries local normalization first (free/instant), then falls back to AI.
 */
async function classifyCanonicalName(name: string): Promise<string | null> {
  // 1. Try existing normalization (instant, free)
  const { canonical } = normalizeProtocolName(name)
  if (canonical !== name && KNOWN_CANONICAL_NAMES.includes(canonical)) {
    return canonical
  }

  // 2. Try direct key match in mechanisms
  if (PROTOCOL_MECHANISMS[name]) {
    return name
  }

  // 3. Fall back to AI classification
  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content: `You are a supplement and peptide classifier. Given a product name, identify which canonical category it belongs to from this list:\n\n${KNOWN_CANONICAL_NAMES.join(', ')}\n\nReturn ONLY the exact canonical name from the list above. If the product does not match any category, return "unknown". Do not explain.`,
        },
        {
          role: 'user',
          content: name,
        },
      ],
    })

    const result = response.choices[0]?.message?.content?.trim()
    if (result && result !== 'unknown' && KNOWN_CANONICAL_NAMES.includes(result)) {
      return result
    }
    return null
  } catch (error) {
    console.error('AI classification failed, using null:', error)
    return null
  }
}

// GET /api/peptides - List all peptides
export async function GET() {
  try {
    const peptides = await prisma.peptide.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(peptides)
  } catch (error) {
    console.error('Error fetching peptides:', error)
    return NextResponse.json({ error: 'Failed to fetch peptides' }, { status: 500 })
  }
}

// POST /api/peptides - Create a new peptide or supplement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, category, description, storageNotes } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Classify the canonical name for mechanism lookups
    const canonicalName = await classifyCanonicalName(name)

    const peptide = await prisma.peptide.create({
      data: {
        name,
        canonicalName,
        type: type || 'peptide', // 'peptide' | 'supplement'
        category,
        description,
        storageNotes,
      },
    })

    return NextResponse.json(peptide, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating peptide:', error)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Peptide with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create peptide' }, { status: 500 })
  }
}
