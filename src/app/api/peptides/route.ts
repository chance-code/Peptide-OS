import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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

    const peptide = await prisma.peptide.create({
      data: {
        name,
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
