import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay, isSameDay, getDay } from 'date-fns'
import type { TodayDoseItem, DayOfWeek, ItemType } from '@/types'

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
    case 'every_other_day': {
      // Calculate days since start date, dose on even days (0, 2, 4, ...)
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

    // Run all database queries in parallel for better performance
    const today = new Date()
    const [protocols, existingLogs, allInventory] = await Promise.all([
      // Get all active protocols for user
      prisma.protocol.findMany({
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
      }),
      // Get existing dose logs for today
      prisma.doseLog.findMany({
        where: {
          userId,
          scheduledDate: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      }),
      // Batch load all inventory status
      prisma.inventoryVial.findMany({
        where: { userId },
        select: {
          peptideId: true,
          expirationDate: true,
          isExhausted: true,
        },
      }),
    ])

    // Map logs by protocol ID + timing for multi-timing support
    const logsByProtocolAndTiming = new Map(
      existingLogs.map((log) => [`${log.protocolId}-${log.timing || ''}`, log])
    )

    // Build lookup maps
    const expiredPeptideIds = new Set<string>()
    const validPeptideIds = new Set<string>()
    for (const vial of allInventory) {
      const isExpired = vial.expirationDate && vial.expirationDate < today
      if (isExpired) {
        expiredPeptideIds.add(vial.peptideId)
      }
      if (!isExpired && !vial.isExhausted) {
        validPeptideIds.add(vial.peptideId)
      }
    }

    // Build today's checklist
    const todayItems: TodayDoseItem[] = []

    for (const protocol of protocols) {
      // Check if today is a dose day for this protocol
      if (!isDoseDay(targetDate, protocol.frequency, protocol.startDate, protocol.customDays)) {
        continue
      }

      const hasExpiredVial = expiredPeptideIds.has(protocol.peptideId)
      const hasValidInventory = validPeptideIds.has(protocol.peptideId)

      // Calculate pen units if reconstitution info is available
      let penUnits: number | null = null
      let concentration: string | null = null

      if (protocol.vialAmount && protocol.diluentVolume) {
        const conc = protocol.vialAmount / protocol.diluentVolume
        concentration = `${conc.toFixed(2)} ${protocol.vialUnit || 'mg'}/mL`

        // Convert dose to vial units if different
        let doseInVialUnits = protocol.doseAmount
        if (protocol.doseUnit === 'mcg' && protocol.vialUnit === 'mg') {
          doseInVialUnits = protocol.doseAmount / 1000
        } else if (protocol.doseUnit === 'mg' && protocol.vialUnit === 'mcg') {
          doseInVialUnits = protocol.doseAmount * 1000
        }

        const volumeMl = doseInVialUnits / conc
        penUnits = Math.round(volumeMl * 100)
      }

      // Get timings - either from new timings array or legacy single timing
      let timingsToProcess: (string | null)[] = [protocol.timing]
      if (protocol.timings) {
        try {
          const parsedTimings = JSON.parse(protocol.timings) as string[]
          if (parsedTimings.length > 0) {
            timingsToProcess = parsedTimings
          }
        } catch {
          // Fall back to single timing
        }
      }

      // Create one item per timing
      for (const timing of timingsToProcess) {
        const logKey = `${protocol.id}-${timing || ''}`
        const existingLog = logsByProtocolAndTiming.get(logKey)

        todayItems.push({
          id: existingLog?.id || `temp-${protocol.id}-${timing || 'default'}`,
          protocolId: protocol.id,
          scheduleId: existingLog?.scheduleId || undefined,
          peptideName: protocol.peptide.name,
          itemType: (protocol.peptide.type || 'peptide') as ItemType,
          doseAmount: protocol.doseAmount,
          doseUnit: protocol.doseUnit,
          timing: timing,
          status: existingLog?.status as TodayDoseItem['status'] || 'pending',
          notes: existingLog?.notes,
          vialExpired: !hasValidInventory && hasExpiredVial,
          penUnits,
          concentration,
          servingSize: protocol.servingSize,
          servingUnit: protocol.servingUnit,
        })
      }
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
      // Sort by type first (peptides before supplements)
      if (a.itemType !== b.itemType) {
        return a.itemType === 'peptide' ? -1 : 1
      }
      // Then by timing
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
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30', // 30 second cache
      },
    })
  } catch (error) {
    console.error('Error fetching today checklist:', error)
    return NextResponse.json({ error: 'Failed to fetch today checklist' }, { status: 500 })
  }
}
