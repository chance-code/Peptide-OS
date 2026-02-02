import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyUserAccess } from '@/lib/api-auth'
import { createProtocolSchema, validate } from '@/lib/validations'

// GET /api/protocols - List protocols for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

    const protocols = await prisma.protocol.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      include: {
        peptide: true,
        // Note: doseLogs removed - fetch separately when needed for specific protocol
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(protocols, {
      headers: {
        'Cache-Control': 'private, max-age=60', // 1 min cache
      },
    })
  } catch (error) {
    console.error('Error fetching protocols:', error)
    return NextResponse.json({ error: 'Failed to fetch protocols' }, { status: 500 })
  }
}

// POST /api/protocols - Create a new protocol
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validation = validate(createProtocolSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const data = validation.data

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(data.userId)
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
    console.error('Error creating protocol:', error)
    return NextResponse.json({ error: 'Failed to create protocol' }, { status: 500 })
  }
}
