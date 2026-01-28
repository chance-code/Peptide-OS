import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { calculateReconstitution } from '@/lib/reconstitution'
import type { DoseUnit } from '@/types'

// GET /api/reconstitution - List saved reconstitutions for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const reconstitutions = await prisma.reconstitution.findMany({
      where: { userId },
      include: {
        peptide: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(reconstitutions)
  } catch (error) {
    console.error('Error fetching reconstitutions:', error)
    return NextResponse.json({ error: 'Failed to fetch reconstitutions' }, { status: 500 })
  }
}

// POST /api/reconstitution - Calculate and optionally save a reconstitution
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      peptideId,
      vialAmount,
      vialUnit,
      diluentVolume,
      targetDose,
      targetUnit,
      save,
      notes,
    } = body

    if (!vialAmount || !vialUnit || !diluentVolume) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Calculate reconstitution
    const result = calculateReconstitution({
      vialAmount,
      vialUnit: vialUnit as DoseUnit,
      diluentVolume,
      targetDose,
      targetUnit: targetUnit as DoseUnit | undefined,
    })

    // Optionally save
    let savedRecord = null
    if (save && userId && peptideId) {
      savedRecord = await prisma.reconstitution.create({
        data: {
          userId,
          peptideId,
          vialAmount,
          vialUnit,
          diluentVolume,
          concentration: result.concentration,
          concentrationUnit: result.concentrationUnit,
          targetDose,
          targetUnit,
          volumePerDose: result.volumePerDose,
          notes,
        },
        include: {
          peptide: true,
        },
      })
    }

    return NextResponse.json({
      calculation: result,
      saved: savedRecord,
    })
  } catch (error) {
    console.error('Error calculating reconstitution:', error)
    return NextResponse.json({ error: 'Failed to calculate reconstitution' }, { status: 500 })
  }
}
