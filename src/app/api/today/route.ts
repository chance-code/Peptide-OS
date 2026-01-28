import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay, isSameDay, getDay } from 'date-fns'
import type { TodayDoseItem, DayOfWeek } from '@/types'

// Map day of week index to our DayOfWeek type (0 = Sunday)
const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
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

// GET /api/today - Get today's dose checklist for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const dateParam = searchParams.get('date')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Parse date in local timezone (dateParam is 'yyyy-MM-dd')
    let targetDate: Date
    if (dateParam) {
      const [year, month, day] = dateParam.split('-').map(Number)
      targetDate = new Date(year, month - 1, day) // month is 0-indexed
    } else {
      targetDate = new Date()
    }
    const dayStart = startOfDay(targetDate)
    const dayEnd = endOfDay(targetDate)

    // Get all active protocols for user
    const protocols = await prisma.protocol.findMany({
      where: {
        userId,
        status: 'active',
        startDate: { lte: dayEnd },
        OR: [
          { endDate: null },
          { endDate: { gte: dayStart } },
        ],
      },
      include: {
        peptide: true,
      },
    })

    // Get existing dose logs for today
    const existingLogs = await prisma.doseLog.findMany({
      where: {
        userId,
        scheduledDate: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    })

    const logsByProtocol = new Map(existingLogs.map((log) => [log.protocolId, log]))

    // Check for expired vials
    const expiredVials = await prisma.inventoryVial.findMany({
      where: {
        userId,
        isExpired: true,
      },
      select: {
        peptideId: true,
      },
    })

    const expiredPeptideIds = new Set(expiredVials.map((v) => v.peptideId))

    // Build today's checklist
    const todayItems: TodayDoseItem[] = []

    for (const protocol of protocols) {
      // Check if today is a dose day for this protocol
      if (!isDoseDay(targetDate, protocol.frequency, protocol.startDate, protocol.customDays)) {
        continue
      }

      const existingLog = logsByProtocol.get(protocol.id)
      const hasExpiredVial = expiredPeptideIds.has(protocol.peptideId)

      // Check if there's any valid (non-expired) inventory for this peptide
      const validInventory = await prisma.inventoryVial.findFirst({
        where: {
          userId,
          peptideId: protocol.peptideId,
          isExpired: false,
          isExhausted: false,
        },
      })

      todayItems.push({
        id: existingLog?.id || `temp-${protocol.id}`,
        protocolId: protocol.id,
        scheduleId: existingLog?.scheduleId || undefined,
        peptideName: protocol.peptide.name,
        doseAmount: protocol.doseAmount,
        doseUnit: protocol.doseUnit,
        timing: protocol.timing,
        status: existingLog?.status as TodayDoseItem['status'] || 'pending',
        notes: existingLog?.notes,
        vialExpired: !validInventory && hasExpiredVial,
      })
    }

    // Sort by timing (morning first, then afternoon, evening, etc.)
    const timingOrder: Record<string, number> = {
      morning: 1,
      'before breakfast': 2,
      'after breakfast': 3,
      afternoon: 4,
      'before lunch': 5,
      'after lunch': 6,
      evening: 7,
      'before dinner': 8,
      'after dinner': 9,
      'before bed': 10,
      night: 11,
    }

    todayItems.sort((a, b) => {
      const aOrder = a.timing ? timingOrder[a.timing.toLowerCase()] || 50 : 50
      const bOrder = b.timing ? timingOrder[b.timing.toLowerCase()] || 50 : 50
      return aOrder - bOrder
    })

    return NextResponse.json({
      date: targetDate.toISOString(),
      items: todayItems,
      summary: {
        total: todayItems.length,
        completed: todayItems.filter((i) => i.status === 'completed').length,
        pending: todayItems.filter((i) => i.status === 'pending').length,
        skipped: todayItems.filter((i) => i.status === 'skipped').length,
      },
    })
  } catch (error) {
    console.error('Error fetching today checklist:', error)
    return NextResponse.json({ error: 'Failed to fetch today checklist' }, { status: 500 })
  }
}
