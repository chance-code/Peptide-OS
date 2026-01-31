import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/protocols - List protocols for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const protocols = await prisma.protocol.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      include: {
        peptide: true,
        doseLogs: {
          orderBy: { scheduledDate: 'desc' },
          take: 30,
        },
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
      userId,
      peptideId,
      startDate,
      endDate,
      frequency,
      customDays,
      doseAmount,
      doseUnit,
      timing,
      notes,
      vialAmount,
      vialUnit,
      diluentVolume,
    } = body

    if (!userId || !peptideId || !startDate || !frequency || !doseAmount || !doseUnit) {
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
        notes,
        status: 'active',
        vialAmount: vialAmount || null,
        vialUnit: vialUnit || null,
        diluentVolume: diluentVolume || null,
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
