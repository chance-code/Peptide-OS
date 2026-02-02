import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay } from 'date-fns'
import { verifyUserAccess } from '@/lib/api-auth'
import { createDoseSchema, validate } from '@/lib/validations'

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

    // Validate input
    const validation = validate(createDoseSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const data = validation.data

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(data.userId)
    if (!auth.success) return auth.response
    const { userId } = auth

    // Check if a dose log already exists for this protocol, date, and timing
    const existingLog = await prisma.doseLog.findFirst({
      where: {
        userId,
        protocolId: data.protocolId,
        timing: data.timing || null,
        scheduledDate: {
          gte: startOfDay(new Date(data.scheduledDate)),
          lte: endOfDay(new Date(data.scheduledDate)),
        },
      },
    })

    let doseLog

    if (existingLog) {
      // Update existing
      doseLog = await prisma.doseLog.update({
        where: { id: existingLog.id },
        data: {
          status: data.status,
          completedAt: data.status === 'completed' ? new Date() : null,
          actualDose: data.actualDose,
          actualUnit: data.actualUnit,
          notes: data.notes,
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
          protocolId: data.protocolId,
          scheduleId: data.scheduleId,
          scheduledDate: new Date(data.scheduledDate),
          timing: data.timing || null,
          status: data.status,
          completedAt: data.status === 'completed' ? new Date() : null,
          actualDose: data.actualDose,
          actualUnit: data.actualUnit,
          notes: data.notes,
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
