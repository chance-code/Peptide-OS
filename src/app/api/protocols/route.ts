import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { createProtocolSchema, validate } from '@/lib/validations'

// GET /api/protocols - List protocols for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    const protocols = await prisma.protocol.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      include: {
        peptide: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(protocols, {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    console.error('[protocols] Error fetching:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed to fetch protocols' }, { status: 500 })
  }
}

// POST /api/protocols - Create a new protocol
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input (userId is optional in body — we use the session)
    const validation = validate(createProtocolSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const data = validation.data

    // Always use authenticated user's ID, ignore body.userId
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const protocol = await prisma.protocol.create({
      data: {
        userId,
        peptideId: data.peptideId,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        frequency: data.frequency,
        customDays: data.customDays ? JSON.stringify(data.customDays) : null,
        doseAmount: data.doseAmount,
        doseUnit: data.doseUnit,
        timing: data.timing || null,
        timings: data.timings || null,
        notes: data.notes || null,
        status: 'active',
        vialAmount: data.vialAmount || null,
        vialUnit: data.vialUnit || null,
        diluentVolume: data.diluentVolume || null,
        servingSize: data.servingSize || null,
        servingUnit: data.servingUnit || null,
      },
      include: {
        peptide: true,
      },
    })

    // Create protocol history entry
    await prisma.protocolHistory.create({
      data: {
        protocolId: protocol.id,
        changeType: 'created',
        changeData: JSON.stringify({
          peptideId: data.peptideId,
          startDate: data.startDate,
          endDate: data.endDate,
          frequency: data.frequency,
          doseAmount: data.doseAmount,
          doseUnit: data.doseUnit,
          timing: data.timing,
        }),
      },
    })

    return NextResponse.json(protocol, { status: 201 })
  } catch (error) {
    console.error('[protocols] Error creating:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed to create protocol' }, { status: 500 })
  }
}
