import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyUserAccess } from '@/lib/api-auth'

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
    const {
      userId: requestedUserId,
      peptideId,
      startDate,
      endDate,
      frequency,
      customDays,
      doseAmount,
      doseUnit,
      timing,
      timings,
      notes,
      vialAmount,
      vialUnit,
      diluentVolume,
      servingSize,
      servingUnit,
    } = body

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(requestedUserId)
    if (!auth.success) return auth.response
    const { userId } = auth

    if (!peptideId || !startDate || !frequency || !doseAmount || !doseUnit) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const protocol = await prisma.protocol.create({
      data: {
        userId,
        peptideId,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        frequency,
        customDays: customDays ? JSON.stringify(customDays) : null,
        doseAmount,
        doseUnit,
        timing,
        timings: timings || null,
        notes,
        status: 'active',
        vialAmount: vialAmount || null,
        vialUnit: vialUnit || null,
        diluentVolume: diluentVolume || null,
        servingSize: servingSize || null,
        servingUnit: servingUnit || null,
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
          peptideId,
          startDate,
          endDate,
          frequency,
          doseAmount,
          doseUnit,
          timing,
        }),
      },
    })

    return NextResponse.json(protocol, { status: 201 })
  } catch (error) {
    console.error('Error creating protocol:', error)
    return NextResponse.json({ error: 'Failed to create protocol' }, { status: 500 })
  }
}
