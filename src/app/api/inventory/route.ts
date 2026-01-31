import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/inventory - List inventory for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const includeExpired = searchParams.get('includeExpired') === 'true'
    const includeExhausted = searchParams.get('includeExhausted') === 'true'

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Check expiration by date directly in query (no separate update needed)
    const today = new Date()

    const inventory = await prisma.inventoryVial.findMany({
      where: {
        userId,
        ...(!includeExpired && {
          OR: [
            { expirationDate: null },
            { expirationDate: { gte: today } },
          ],
        }),
        ...(!includeExhausted && { isExhausted: false }),
      },
      include: {
        peptide: true,
      },
      orderBy: [
        { isExpired: 'asc' },
        { expirationDate: 'asc' },
      ],
    })

    return NextResponse.json(inventory, {
      headers: {
        'Cache-Control': 'private, max-age=60', // 1 min cache
      },
    })
  } catch (error) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
  }
}

// POST /api/inventory - Create a new inventory vial
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      peptideId,
      identifier,
      totalAmount,
      totalUnit,
      diluentVolume,
      dateReceived,
      dateReconstituted,
      expirationDate,
      notes,
    } = body

    if (!userId || !peptideId || !totalAmount || !totalUnit) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Calculate concentration if diluent volume is provided
    let concentration: number | null = null
    let concentrationUnit: string | null = null
    if (diluentVolume) {
      concentration = totalAmount / diluentVolume
      concentrationUnit = `${totalUnit}/ml`
    }

    const vial = await prisma.inventoryVial.create({
      data: {
        userId,
        peptideId,
        identifier,
        totalAmount,
        totalUnit,
        diluentVolume,
        concentration,
        concentrationUnit,
        dateReceived: dateReceived ? new Date(dateReceived) : null,
        dateReconstituted: dateReconstituted ? new Date(dateReconstituted) : null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        remainingAmount: totalAmount,
        notes,
      },
      include: {
        peptide: true,
      },
    })

    return NextResponse.json(vial, { status: 201 })
  } catch (error) {
    console.error('Error creating inventory vial:', error)
    return NextResponse.json({ error: 'Failed to create inventory vial' }, { status: 500 })
  }
}
