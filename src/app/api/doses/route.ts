import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay } from 'date-fns'
import { verifyUserAccess } from '@/lib/api-auth'

// GET /api/doses - List dose logs for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const protocolId = searchParams.get('protocolId')
    const date = searchParams.get('date')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

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
    } else if (startDateParam && endDateParam) {
      where.scheduledDate = {
        gte: startOfDay(new Date(startDateParam)),
        lte: endOfDay(new Date(endDateParam)),
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

    return NextResponse.json(doses, {
      headers: {
        'Cache-Control': 'private, max-age=30', // 30 second cache
      },
    })
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
      userId: requestedUserId,
      protocolId,
      scheduleId,
      scheduledDate,
      status,
      actualDose,
      actualUnit,
      notes,
      timing, // For multi-timing protocols
    } = body

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(requestedUserId)
    if (!auth.success) return auth.response
    const { userId } = auth

    if (!protocolId || !scheduledDate || !status) {
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
