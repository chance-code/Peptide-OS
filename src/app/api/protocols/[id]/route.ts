import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/protocols/[id] - Get a single protocol with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const protocol = await prisma.protocol.findUnique({
      where: { id },
      include: {
        peptide: true,
        doseLogs: {
          orderBy: { scheduledDate: 'desc' },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    return NextResponse.json(protocol)
  } catch (error) {
    console.error('Error fetching protocol:', error)
    return NextResponse.json({ error: 'Failed to fetch protocol' }, { status: 500 })
  }
}

// PUT /api/protocols/[id] - Update a protocol
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      peptideId,
      startDate,
      endDate,
      frequency,
      customDays,
      doseAmount,
      doseUnit,
      timing,
      status,
      notes,
      vialAmount,
      vialUnit,
      diluentVolume,
    } = body

    // Get current state for history
    const currentProtocol = await prisma.protocol.findUnique({
      where: { id },
    })

    if (!currentProtocol) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const changes: Record<string, { from: unknown; to: unknown }> = {}

    // Track changes
    if (peptideId !== undefined && peptideId !== currentProtocol.peptideId) {
      updateData.peptideId = peptideId
      changes.peptideId = { from: currentProtocol.peptideId, to: peptideId }
    }
    if (startDate !== undefined) {
      const newDate = new Date(startDate)
      if (newDate.getTime() !== currentProtocol.startDate.getTime()) {
        updateData.startDate = newDate
        changes.startDate = { from: currentProtocol.startDate, to: newDate }
      }
    }
    if (endDate !== undefined) {
      const newDate = endDate ? new Date(endDate) : null
      updateData.endDate = newDate
      changes.endDate = { from: currentProtocol.endDate, to: newDate }
    }
    if (frequency !== undefined && frequency !== currentProtocol.frequency) {
      updateData.frequency = frequency
      changes.frequency = { from: currentProtocol.frequency, to: frequency }
    }
    if (customDays !== undefined) {
      const newCustomDays = customDays ? JSON.stringify(customDays) : null
      updateData.customDays = newCustomDays
      changes.customDays = { from: currentProtocol.customDays, to: newCustomDays }
    }
    if (doseAmount !== undefined && doseAmount !== currentProtocol.doseAmount) {
      updateData.doseAmount = doseAmount
      changes.doseAmount = { from: currentProtocol.doseAmount, to: doseAmount }
    }
    if (doseUnit !== undefined && doseUnit !== currentProtocol.doseUnit) {
      updateData.doseUnit = doseUnit
      changes.doseUnit = { from: currentProtocol.doseUnit, to: doseUnit }
    }
    if (timing !== undefined && timing !== currentProtocol.timing) {
      updateData.timing = timing
      changes.timing = { from: currentProtocol.timing, to: timing }
    }
    if (notes !== undefined && notes !== currentProtocol.notes) {
      updateData.notes = notes
      changes.notes = { from: currentProtocol.notes, to: notes }
    }

    // Reconstitution fields
    if (vialAmount !== undefined) {
      updateData.vialAmount = vialAmount
      changes.vialAmount = { from: currentProtocol.vialAmount, to: vialAmount }
    }
    if (vialUnit !== undefined) {
      updateData.vialUnit = vialUnit
      changes.vialUnit = { from: currentProtocol.vialUnit, to: vialUnit }
    }
    if (diluentVolume !== undefined) {
      updateData.diluentVolume = diluentVolume
      changes.diluentVolume = { from: currentProtocol.diluentVolume, to: diluentVolume }
    }

    // Handle status changes
    let changeType = 'updated'
    if (status !== undefined && status !== currentProtocol.status) {
      updateData.status = status
      changes.status = { from: currentProtocol.status, to: status }

      if (status === 'paused') {
        updateData.pausedAt = new Date()
        changeType = 'paused'
      } else if (status === 'active' && currentProtocol.status === 'paused') {
        updateData.pausedAt = null
        changeType = 'resumed'
      } else if (status === 'completed') {
        changeType = 'completed'
      }
    }

    const protocol = await prisma.protocol.update({
      where: { id },
      data: updateData,
      include: {
        peptide: true,
      },
    })

    // Create history entry if there were changes
    if (Object.keys(changes).length > 0) {
      await prisma.protocolHistory.create({
        data: {
          protocolId: id,
          changeType,
          changeData: JSON.stringify(changes),
        },
      })
    }

    return NextResponse.json(protocol)
  } catch (error) {
    console.error('Error updating protocol:', error)
    return NextResponse.json({ error: 'Failed to update protocol' }, { status: 500 })
  }
}

// DELETE /api/protocols/[id] - Delete a protocol
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if protocol is completed - prevent deletion
    const protocol = await prisma.protocol.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }

    if (protocol.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot delete completed protocols. They are kept for historical records.' },
        { status: 403 }
      )
    }

    await prisma.protocol.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting protocol:', error)
    return NextResponse.json({ error: 'Failed to delete protocol' }, { status: 500 })
  }
}
