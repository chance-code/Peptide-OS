import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'

// GET /api/peptides/[id] - Get a single peptide (public - peptides are shared definitions)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const peptide = await prisma.peptide.findUnique({
      where: { id },
    })

    if (!peptide) {
      return NextResponse.json({ error: 'Peptide not found' }, { status: 404 })
    }

    return NextResponse.json(peptide)
  } catch (error) {
    console.error('Error fetching peptide:', error)
    return NextResponse.json({ error: 'Failed to fetch peptide' }, { status: 500 })
  }
}

// PUT /api/peptides/[id] - Update a peptide (requires authentication)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const body = await request.json()
    const { name, category, description, storageNotes } = body

    const peptide = await prisma.peptide.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(storageNotes !== undefined && { storageNotes }),
      },
    })

    return NextResponse.json(peptide)
  } catch (error) {
    console.error('Error updating peptide:', error)
    return NextResponse.json({ error: 'Failed to update peptide' }, { status: 500 })
  }
}

// DELETE /api/peptides/[id] - Delete a peptide (requires authentication)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params

    await prisma.peptide.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting peptide:', error)
    return NextResponse.json({ error: 'Failed to delete peptide' }, { status: 500 })
  }
}
