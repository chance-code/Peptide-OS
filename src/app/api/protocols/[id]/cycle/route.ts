import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { protocolCycleSchema, validate } from '@/lib/validations'

// 0..1 ProtocolCycle per protocol. Upsert via PUT, clear via DELETE.
// Also toggles protocol.cycleMode ('cycled' when PUT, 'continuous' when DELETE).

async function getProtocolOrForbid(id: string, authUserId: string) {
  const protocol = await prisma.protocol.findUnique({ where: { id } })
  if (!protocol) return { error: NextResponse.json({ error: 'Protocol not found' }, { status: 404 }) }
  if (protocol.userId !== authUserId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { protocol }
}

// GET /api/protocols/[id]/cycle
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

    const cycle = await prisma.protocolCycle.findUnique({ where: { protocolId: id } })
    if (!cycle) return NextResponse.json({ cycle: null })
    return NextResponse.json({ cycle })
  } catch (error) {
    console.error('Error fetching protocol cycle:', error)
    return NextResponse.json({ error: 'Failed to fetch cycle' }, { status: 500 })
  }
}

// PUT /api/protocols/[id]/cycle — upserts the cycle + flips cycleMode='cycled'
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
    const validation = validate(protocolCycleSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const data = validation.data

    const result = await prisma.$transaction(async (tx) => {
      const cycle = await tx.protocolCycle.upsert({
        where: { protocolId: id },
        create: {
          protocolId: id,
          onDays: data.onDays,
          offDays: data.offDays,
          cycleStartDate: new Date(data.cycleStartDate),
          repeatCount: data.repeatCount ?? -1,
        },
        update: {
          onDays: data.onDays,
          offDays: data.offDays,
          cycleStartDate: new Date(data.cycleStartDate),
          repeatCount: data.repeatCount ?? -1,
        },
      })

      await tx.protocol.update({
        where: { id },
        data: { cycleMode: 'cycled' },
      })

      return cycle
    })

    return NextResponse.json({ cycle: result })
  } catch (error) {
    console.error('Error upserting protocol cycle:', error)
    return NextResponse.json({ error: 'Failed to upsert cycle' }, { status: 500 })
  }
}

// DELETE /api/protocols/[id]/cycle — removes cycle + flips cycleMode='continuous'
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
      await tx.protocolCycle.deleteMany({ where: { protocolId: id } })
      await tx.protocol.update({
        where: { id },
        data: { cycleMode: 'continuous' },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting protocol cycle:', error)
    return NextResponse.json({ error: 'Failed to delete cycle' }, { status: 500 })
  }
}
