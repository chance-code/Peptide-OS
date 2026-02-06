import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'

// GET /api/inventory/[id] - Get a single inventory vial
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const vial = await prisma.inventoryVial.findUnique({
      where: { id },
      include: {
        peptide: true,
      },
    })

    if (!vial) {
      return NextResponse.json({ error: 'Vial not found' }, { status: 404 })
    }

    if (vial.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(vial)
  } catch (error) {
    console.error('Error fetching vial:', error)
    return NextResponse.json({ error: 'Failed to fetch vial' }, { status: 500 })
  }
}

// PUT /api/inventory/[id] - Update an inventory vial
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const body = await request.json()
    const {
      peptideId,
      identifier,
      totalAmount,
      totalUnit,
      diluentVolume,
      dateReceived,
      dateReconstituted,
      expirationDate,
      remainingAmount,
      isExhausted,
      notes,
    } = body

    // Get current vial to check for reconstitution update
    const currentVial = await prisma.inventoryVial.findUnique({
      where: { id },
    })

    if (!currentVial) {
      return NextResponse.json({ error: 'Vial not found' }, { status: 404 })
    }

    if (currentVial.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Calculate concentration if needed
    let concentration = currentVial.concentration
    let concentrationUnit = currentVial.concentrationUnit
    const effectiveTotalAmount = totalAmount ?? currentVial.totalAmount
    const effectiveTotalUnit = totalUnit ?? currentVial.totalUnit
    const effectiveDiluentVolume = diluentVolume ?? currentVial.diluentVolume

    if (effectiveDiluentVolume) {
      concentration = effectiveTotalAmount / effectiveDiluentVolume
      concentrationUnit = `${effectiveTotalUnit}/ml`
    }

    // Check if expired
    const effectiveExpirationDate = expirationDate
      ? new Date(expirationDate)
      : currentVial.expirationDate
    const isExpired = effectiveExpirationDate
      ? effectiveExpirationDate < new Date()
      : false

    const vial = await prisma.inventoryVial.update({
      where: { id },
      data: {
        ...(peptideId && { peptideId }),
        ...(identifier !== undefined && { identifier }),
        ...(totalAmount !== undefined && { totalAmount }),
        ...(totalUnit !== undefined && { totalUnit }),
        ...(diluentVolume !== undefined && { diluentVolume }),
        concentration,
        concentrationUnit,
        ...(dateReceived !== undefined && {
          dateReceived: dateReceived ? new Date(dateReceived) : null,
        }),
        ...(dateReconstituted !== undefined && {
          dateReconstituted: dateReconstituted ? new Date(dateReconstituted) : null,
        }),
        ...(expirationDate !== undefined && {
          expirationDate: expirationDate ? new Date(expirationDate) : null,
        }),
        ...(remainingAmount !== undefined && { remainingAmount }),
        ...(isExhausted !== undefined && { isExhausted }),
        isExpired,
        ...(notes !== undefined && { notes }),
      },
      include: {
        peptide: true,
      },
    })

    return NextResponse.json(vial)
  } catch (error) {
    console.error('Error updating vial:', error)
    return NextResponse.json({ error: 'Failed to update vial' }, { status: 500 })
  }
}

// DELETE /api/inventory/[id] - Delete an inventory vial
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params

    const vial = await prisma.inventoryVial.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!vial) {
      return NextResponse.json({ error: 'Vial not found' }, { status: 404 })
    }

    if (vial.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.inventoryVial.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting vial:', error)
    return NextResponse.json({ error: 'Failed to delete vial' }, { status: 500 })
  }
}
