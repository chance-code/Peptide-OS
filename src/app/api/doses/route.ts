import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay, addDays, getDay } from 'date-fns'
import { verifyUserAccess } from '@/lib/api-auth'
import { createDoseSchema, validate } from '@/lib/validations'

type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
}

function isDoseDay(
  date: Date,
  frequency: string,
  startDate: Date,
  customDays?: string | null
): boolean {
  const dayOfWeek = DAY_INDEX_MAP[getDay(date)]
  switch (frequency) {
    case 'daily':
      return true
    case 'every_other_day': {
      const start = startOfDay(startDate)
      const target = startOfDay(date)
      const daysDiff = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      return daysDiff >= 0 && daysDiff % 2 === 0
    }
    case 'weekly':
      return getDay(date) === getDay(startDate)
    case 'custom':
      if (!customDays) return false
      try {
        const days = JSON.parse(customDays) as DayOfWeek[]
        return days.includes(dayOfWeek)
      } catch {
        return false
      }
    default:
      return false
  }
}

// GET /api/doses - List dose logs for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const protocolId = searchParams.get('protocolId')
    const date = searchParams.get('date')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const includeExpected = searchParams.get('includeExpected') === 'true'

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

    const where: Record<string, unknown> = { userId }

    if (protocolId) {
      where.protocolId = protocolId
    }

    let rangeStart: Date | null = null
    let rangeEnd: Date | null = null

    if (date) {
      const [year, month, day] = date.split('-').map(Number)
      const targetDate = new Date(year, month - 1, day)
      rangeStart = startOfDay(targetDate)
      rangeEnd = endOfDay(targetDate)
      where.scheduledDate = { gte: rangeStart, lte: rangeEnd }
    } else if (startDateParam && endDateParam) {
      const [sy, sm, sd] = startDateParam.split('-').map(Number)
      const [ey, em, ed] = endDateParam.split('-').map(Number)
      rangeStart = startOfDay(new Date(sy, sm - 1, sd))
      rangeEnd = endOfDay(new Date(ey, em - 1, ed))
      where.scheduledDate = { gte: rangeStart, lte: rangeEnd }
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

    // If includeExpected, generate synthetic "pending" entries for scheduled-but-unlogged doses
    if (includeExpected && rangeStart && rangeEnd) {
      const protocols = await prisma.protocol.findMany({
        where: {
          userId,
          status: 'active',
          startDate: { lte: rangeEnd },
          OR: [
            { endDate: null },
            { endDate: { gte: rangeStart } },
          ],
        },
        include: { peptide: true },
      })

      // Build a set of existing log keys (protocolId-timing-dateStr) for fast lookup
      const existingLogKeys = new Set<string>()
      for (const dose of doses) {
        const dateStr = dose.scheduledDate.toISOString().slice(0, 10)
        existingLogKeys.add(`${dose.protocolId}-${dose.timing || ''}-${dateStr}`)
      }

      // Walk each day in the range
      const today = startOfDay(new Date())
      let current = rangeStart
      while (current <= rangeEnd && current <= today) {
        for (const protocol of protocols) {
          if (current < startOfDay(protocol.startDate)) continue
          if (protocol.endDate && current > endOfDay(protocol.endDate)) continue
          if (!isDoseDay(current, protocol.frequency, protocol.startDate, protocol.customDays)) continue

          // Get timings
          let timingsToProcess: (string | null)[] = [protocol.timing]
          if (protocol.timings) {
            try {
              const parsed = JSON.parse(protocol.timings) as string[]
              if (parsed.length > 0) timingsToProcess = parsed
            } catch { /* fallback */ }
          }

          for (const timing of timingsToProcess) {
            const dateStr = current.toISOString().slice(0, 10)
            const key = `${protocol.id}-${timing || ''}-${dateStr}`
            if (existingLogKeys.has(key)) continue

            // This dose was expected but never logged — synthesize as "missed" for past days
            doses.push({
              id: `expected-${protocol.id}-${timing || 'default'}-${dateStr}`,
              userId,
              protocolId: protocol.id,
              scheduleId: null,
              scheduledDate: current,
              completedAt: null,
              timing: timing,
              status: 'missed',
              actualDose: null,
              actualUnit: null,
              notes: null,
              createdAt: current,
              updatedAt: current,
              protocol: {
                ...protocol,
                peptide: protocol.peptide,
              },
            } as typeof doses[number])
          }
        }
        current = addDays(current, 1)
      }
    }

    return NextResponse.json(doses, {
      headers: {
        'Cache-Control': 'private, max-age=30',
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
