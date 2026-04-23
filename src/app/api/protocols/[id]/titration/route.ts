import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { titrationStepsPutSchema, validate } from '@/lib/validations'

// 0..N TitrationStep per protocol. PUT replaces the whole set atomically.
// Also toggles protocol.cycleMode ('titrated' when PUT with steps, 'continuous' when empty or DELETE).

async function getProtocolOrForbid(id: string, authUserId: string) {
  const protocol = await prisma.protocol.findUnique({ where: { id } })
  if (!protocol) return { error: NextResponse.json({ error: 'Protocol not found' }, { status: 404 }) }
  if (protocol.userId !== authUserId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { protocol }
}

// GET /api/protocols/[id]/titration — returns steps sorted by weekOffset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const r = await getProtocolOrForbid(id, auth.userId)
    if ('error' in r) return r.error

    const steps = await prisma.titrationStep.findMany({
      where: { protocolId: id },
      orderBy: { weekOffset: 'asc' },
    })
    return NextResponse.json({ steps })
  } catch (error) {
    console.error('Error fetching titration steps:', error)
    return NextResponse.json({ error: 'Failed to fetch titration steps' }, { status: 500 })
  }
}

// PUT /api/protocols/[id]/titration — replace the whole set + flip cycleMode
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const r = await getProtocolOrForbid(id, auth.userId)
    if ('error' in r) return r.error

    const body = await request.json()
    const validation = validate(titrationStepsPutSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { steps } = validation.data

    // Reject duplicate stepIndex (unique constraint would also catch this but 400 is friendlier)
    const indices = steps.map((s) => s.stepIndex)
    if (new Set(indices).size !== indices.length) {
      return NextResponse.json(
        { error: 'Duplicate stepIndex values are not allowed' },
        { status: 400 },
      )
    }

    const created = await prisma.$transaction(async (tx) => {
      // Replace entire set: delete existing + recreate
      await tx.titrationStep.deleteMany({ where: { protocolId: id } })

      if (steps.length > 0) {
        await tx.titrationStep.createMany({
          data: steps.map((s) => ({
            protocolId: id,
            stepIndex: s.stepIndex,
            weekOffset: s.weekOffset,
            doseAmount: s.doseAmount,
            doseUnit: s.doseUnit,
            notes: s.notes ?? null,
          })),
        })
      }

      // Flip cycleMode based on whether we have steps now
      await tx.protocol.update({
        where: { id },
        data: { cycleMode: steps.length > 0 ? 'titrated' : 'continuous' },
      })

      return tx.titrationStep.findMany({
        where: { protocolId: id },
        orderBy: { weekOffset: 'asc' },
      })
    })

    return NextResponse.json({ steps: created })
  } catch (error) {
    console.error('Error saving titration steps:', error)
    return NextResponse.json({ error: 'Failed to save titration steps' }, { status: 500 })
  }
}

// DELETE /api/protocols/[id]/titration — clear all steps + cycleMode='continuous'
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const r = await getProtocolOrForbid(id, auth.userId)
    if ('error' in r) return r.error

    await prisma.$transaction(async (tx) => {
      await tx.titrationStep.deleteMany({ where: { protocolId: id } })
      await tx.protocol.update({
        where: { id },
        data: { cycleMode: 'continuous' },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting titration steps:', error)
    return NextResponse.json({ error: 'Failed to delete titration steps' }, { status: 500 })
  }
}
