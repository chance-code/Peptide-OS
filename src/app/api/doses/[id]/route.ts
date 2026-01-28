import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/doses/[id] - Get a single dose log
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const doseLog = await prisma.doseLog.findUnique({
      where: { id },
      include: {
        protocol: {
          include: { peptide: true },
        },
      },
    })

    if (!doseLog) {
      return NextResponse.json({ error: 'Dose log not found' }, { status: 404 })
    }

    return NextResponse.json(doseLog)
  } catch (error) {
    console.error('Error fetching dose log:', error)
    return NextResponse.json({ error: 'Failed to fetch dose log' }, { status: 500 })
  }
}

// PUT /api/doses/[id] - Update a dose log
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, actualDose, actualUnit, notes } = body

    const doseLog = await prisma.doseLog.update({
      where: { id },
      data: {
        ...(status && {
          status,
          completedAt: status === 'completed' ? new Date() : null,
        }),
        ...(actualDose !== undefined && { actualDose }),
        ...(actualUnit !== undefined && { actualUnit }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        protocol: {
          include: { peptide: true },
        },
      },
    })

    return NextResponse.json(doseLog)
  } catch (error) {
    console.error('Error updating dose log:', error)
    return NextResponse.json({ error: 'Failed to update dose log' }, { status: 500 })
  }
}

// DELETE /api/doses/[id] - Delete a dose log
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await prisma.doseLog.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting dose log:', error)
    return NextResponse.json({ error: 'Failed to delete dose log' }, { status: 500 })
  }
}
