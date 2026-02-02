import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay } from 'date-fns'

// GET /api/doses - List dose logs for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const protocolId = searchParams.get('protocolId')
    const date = searchParams.get('date')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const where: Record<string, unknown> = { userId }

    if (protocolId) {
      where.protocolId = protocolId
    }

    if (date) {
      const targetDate = new Date(date)
      where.scheduledDate = {
        gte: startOfDay(targetDate),
        lte: endOfDay(targetDate),
      }
    } else if (startDate && endDate) {
      where.scheduledDate = {
        gte: startOfDay(new Date(startDate)),
        lte: endOfDay(new Date(endDate)),
      }
    }

    const doses = await prisma.doseLog.findMany({
      where,
      include: {
        protocol: {
          include: { peptide: true },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    })

    return NextResponse.json(doses)
  } catch (error) {
    console.error('Error fetching doses:', error)
    return NextResponse.json({ error: 'Failed to fetch doses' }, { status: 500 })
  }
}

// POST /api/doses - Create or update a dose log
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      protocolId,
      scheduleId,
      scheduledDate,
      status,
      actualDose,
      actualUnit,
      notes,
      timing, // For multi-timing protocols
    } = body

    if (!userId || !protocolId || !scheduledDate || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if a dose log already exists for this protocol, date, and timing
    const existingLog = await prisma.doseLog.findFirst({
      where: {
        userId,
        protocolId,
        timing: timing || null,
        scheduledDate: {
          gte: startOfDay(new Date(scheduledDate)),
          lte: endOfDay(new Date(scheduledDate)),
        },
      },
    })

    let doseLog

    if (existingLog) {
      // Update existing
      doseLog = await prisma.doseLog.update({
        where: { id: existingLog.id },
        data: {
          status,
          completedAt: status === 'completed' ? new Date() : null,
          actualDose,
          actualUnit,
          notes,
        },
        include: {
          protocol: {
            include: { peptide: true },
          },
        },
      })
    } else {
      // Create new
      doseLog = await prisma.doseLog.create({
        data: {
          userId,
          protocolId,
          scheduleId,
          scheduledDate: new Date(scheduledDate),
          timing: timing || null,
          status,
          completedAt: status === 'completed' ? new Date() : null,
          actualDose,
          actualUnit,
          notes,
        },
        include: {
          protocol: {
            include: { peptide: true },
          },
        },
      })
    }

    return NextResponse.json(doseLog, { status: existingLog ? 200 : 201 })
  } catch (error) {
    console.error('Error creating/updating dose log:', error)
    return NextResponse.json({ error: 'Failed to create/update dose log' }, { status: 500 })
  }
}
