import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { startOfDay, endOfDay } from 'date-fns'
import { verifyUserAccess } from '@/lib/api-auth'
import { resolveDose } from '@/lib/schedule'
import type { TodayDoseItem, DayOfWeek, ItemType, FrequencyType } from '@/types'

// Unit conversion to mcg (base) — mirrors src/lib/reconstitution.ts
const UNIT_TO_MCG: Record<string, number> = {
  mcg: 1,
  mg: 1000,
  IU: 1, // IU kept as-is (not interchangeable with mg/mcg)
}

/**
 * Compute volume (mL) to draw from a reconstituted vial for a given dose.
 * Handles unit conversion between dose and vial (mcg ↔ mg).
 * Returns null if the vial isn't reconstituted (no concentration) or units are incompatible (e.g. IU ↔ mg).
 *
 * Exported for unit testing.
 */
export function volumePerDoseMl(
  doseAmount: number,
  doseUnit: string,
  vialConcentration: number | null,
  vialUnit: string | null,
): number | null {
  if (!vialConcentration || vialConcentration <= 0 || !vialUnit) return null
  // IU is non-convertible — require exact unit match
  if (doseUnit === 'IU' || vialUnit === 'IU') {
    if (doseUnit !== vialUnit) return null
    return doseAmount / vialConcentration
  }
  const doseMcg = doseAmount * (UNIT_TO_MCG[doseUnit] ?? 1)
  const vialPerMlMcg = vialConcentration * (UNIT_TO_MCG[vialUnit] ?? 1)
  if (vialPerMlMcg <= 0) return null
  const ml = doseMcg / vialPerMlMcg
  // Round to 3 decimals (μL resolution)
  return Math.round(ml * 1000) / 1000
}

/**
 * Suggest the next injection site based on the last logged site for this protocol.
 * Minimal Phase-1 rotation: alternate left ↔ right on the same body part.
 *
 * Exported for unit testing.
 */
export function suggestInjectionSite(lastSite: string | null | undefined): string | null {
  if (!lastSite) return 'left_abdomen' // default starting site
  if (lastSite.startsWith('left_')) return lastSite.replace('left_', 'right_')
  if (lastSite.startsWith('right_')) return lastSite.replace('right_', 'left_')
  return lastSite
}

// Sorting: peptides before supplements, then by timing of day
const TIMING_ORDER: Record<string, number> = {
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

// GET /api/today - Get today's dose checklist for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateParam = searchParams.get('date')

    // Verify user has access to requested userId
    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

    // Parse date in local timezone (dateParam is 'yyyy-MM-dd')
    let targetDate: Date
    if (dateParam) {
      const [year, month, day] = dateParam.split('-').map(Number)
      targetDate = new Date(year, month - 1, day)
    } else {
      targetDate = new Date()
    }
    const dayStart = startOfDay(targetDate)
    const dayEnd = endOfDay(targetDate)

    const today = new Date()
    // Parallel load: scheduled rows for the date, protocols (for metadata), logs, inventory, sites
    // Refocus Phase 1.J: DoseSchedule is authoritative for "is this due today and at what dose."
    //   Protocol data still needed for non-scheduling fields (peptide, timings, serving info, site rotation).
    const [scheduleRows, protocols, existingLogs, allInventory, recentLogsWithSite] =
      await Promise.all([
        prisma.doseSchedule.findMany({
          where: {
            scheduledDate: { gte: dayStart, lte: dayEnd },
            protocol: {
              userId,
              status: 'active',
              startDate: { lte: dayEnd },
              OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
            },
          },
        }),
        prisma.protocol.findMany({
          where: {
            userId,
            status: 'active',
            startDate: { lte: dayEnd },
            OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
          },
          include: {
            peptide: true,
            cycle: true,
            titrationSteps: { orderBy: { weekOffset: 'asc' } },
          },
        }),
        prisma.doseLog.findMany({
          where: {
            userId,
            scheduledDate: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.inventoryVial.findMany({
          where: { userId, isExhausted: false },
          orderBy: [{ dateReconstituted: 'desc' }, { createdAt: 'desc' }],
        }),
        // Last dose-log per protocol that has an injectionSite set — for rotation suggestion
        prisma.doseLog.findMany({
          where: {
            userId,
            injectionSite: { not: null },
          },
          orderBy: { scheduledDate: 'desc' },
          take: 100,
          select: { protocolId: true, injectionSite: true, scheduledDate: true },
        }),
      ])

    // Build a set of protocolIds with a scheduled row for this date → "is due" gate.
    // Also capture the resolved dose/phase from the schedule row for downstream use.
    const scheduledByProtocol = new Map<string, (typeof scheduleRows)[number]>(
      scheduleRows.map((s) => [s.protocolId, s]),
    )

    // Log lookup (protocolId-timing → DoseLog) for today
    const logsByProtocolAndTiming = new Map(
      existingLogs.map((log) => [`${log.protocolId}-${log.timing || ''}`, log]),
    )

    // Vial resolution: first active non-expired vial per peptide (ordered by most-recently-reconstituted)
    const vialsByPeptide = new Map<string, (typeof allInventory)[number]>()
    const expiredPeptideIds = new Set<string>()
    for (const v of allInventory) {
      const isExpired = v.expirationDate && v.expirationDate < today
      if (isExpired) {
        expiredPeptideIds.add(v.peptideId)
        continue
      }
      // Because allInventory is already ordered newest-first, only first hit per peptide wins
      if (!vialsByPeptide.has(v.peptideId)) {
        vialsByPeptide.set(v.peptideId, v)
      }
    }

    // Last injection site per protocol — for rotation suggestion
    const lastSiteByProtocol = new Map<string, string>()
    for (const log of recentLogsWithSite) {
      if (!lastSiteByProtocol.has(log.protocolId) && log.injectionSite) {
        lastSiteByProtocol.set(log.protocolId, log.injectionSite)
      }
    }

    const todayItems: TodayDoseItem[] = []

    for (const protocol of protocols) {
      // Parse customDays from the stored JSON string (for phase/banner metadata even when scheduled)
      let customDaysArr: DayOfWeek[] | undefined
      if (protocol.customDays) {
        try {
          customDaysArr = JSON.parse(protocol.customDays) as DayOfWeek[]
        } catch {
          // fall through — undefined
        }
      }

      // Primary gate: is this protocol scheduled for today?
      const scheduleRow = scheduledByProtocol.get(protocol.id)

      // Fallback: if no schedule row exists (new/migrated protocol, cache not yet populated),
      // compute on-the-fly via resolveDose. This keeps the response correct during the
      // brief window between protocol create and the first materialization run.
      let resolved
      if (scheduleRow) {
        // Still call resolveDose to get phase + daysUntilNextPhaseBoundary metadata
        // (these aren't cached in DoseSchedule, only the resolved dose is)
        resolved = resolveDose(targetDate, {
          startDate: protocol.startDate,
          frequency: protocol.frequency as FrequencyType,
          customDays: customDaysArr,
          cycleMode: (protocol.cycleMode ?? 'continuous') as 'continuous' | 'cycled' | 'titrated',
          cycle: protocol.cycle,
          titrationSteps: protocol.titrationSteps,
          // Prefer the materialized doseAmount (correct for titration windows)
          doseAmount: scheduleRow.doseAmount,
          doseUnit: scheduleRow.doseUnit,
        })
        // Trust the schedule: force isDue=true even if resolveDose disagrees
        // (e.g. schedule was materialized yesterday when cycle said on-phase; today
        //  the user hasn't migrated. Schedule is authoritative.)
        resolved.isDue = true
      } else {
        resolved = resolveDose(targetDate, {
          startDate: protocol.startDate,
          frequency: protocol.frequency as FrequencyType,
          customDays: customDaysArr,
          cycleMode: (protocol.cycleMode ?? 'continuous') as 'continuous' | 'cycled' | 'titrated',
          cycle: protocol.cycle,
          titrationSteps: protocol.titrationSteps,
          doseAmount: protocol.doseAmount,
          doseUnit: protocol.doseUnit,
        })
      }

      if (!resolved.isDue) continue

      // Active vial (peptides only — supplements use itemCount/remainingCount, no volume math)
      const activeVial = vialsByPeptide.get(protocol.peptideId)
      const hasExpiredVial = expiredPeptideIds.has(protocol.peptideId) && !activeVial

      // Volume to draw (peptides w/ reconstituted vial)
      let volumeDrawnMl: number | null = null
      let vialId: string | null = null
      let vialLabel: string | null = null
      let concentration: string | null = null
      let penUnits: number | null = null

      if (activeVial && activeVial.concentration && activeVial.totalUnit) {
        vialId = activeVial.id
        vialLabel = activeVial.identifier ?? null
        concentration = `${activeVial.concentration.toFixed(2)} ${activeVial.totalUnit}/mL`
        volumeDrawnMl = volumePerDoseMl(
          resolved.doseAmount,
          resolved.doseUnit,
          activeVial.concentration,
          activeVial.totalUnit,
        )
        if (volumeDrawnMl !== null) {
          penUnits = Math.round(volumeDrawnMl * 100)
        }
      } else if (protocol.vialAmount && protocol.diluentVolume) {
        // Legacy fallback: compute from protocol-level reconstitution fields
        const conc = protocol.vialAmount / protocol.diluentVolume
        concentration = `${conc.toFixed(2)} ${protocol.vialUnit || 'mg'}/mL`
        volumeDrawnMl = volumePerDoseMl(
          resolved.doseAmount,
          resolved.doseUnit,
          conc,
          protocol.vialUnit || null,
        )
        if (volumeDrawnMl !== null) {
          penUnits = Math.round(volumeDrawnMl * 100)
        }
      }

      // Injection site (only when the protocol opts in)
      const injectionSiteSuggestion = protocol.siteRotationEnabled
        ? suggestInjectionSite(lastSiteByProtocol.get(protocol.id))
        : null

      // Timings - new JSON array or legacy single timing
      let timingsToProcess: (string | null)[] = [protocol.timing]
      if (protocol.timings) {
        try {
          const parsed = JSON.parse(protocol.timings) as string[]
          if (parsed.length > 0) timingsToProcess = parsed
        } catch {
          // keep fallback
        }
      }

      for (const timing of timingsToProcess) {
        const logKey = `${protocol.id}-${timing || ''}`
        const existingLog = logsByProtocolAndTiming.get(logKey)

        todayItems.push({
          id: existingLog?.id || `temp-${protocol.id}-${timing || 'default'}`,
          protocolId: protocol.id,
          scheduleId: existingLog?.scheduleId || undefined,
          peptideName: protocol.peptide.name,
          itemType: (protocol.peptide.type || 'peptide') as ItemType,
          // Use resolved.doseAmount/Unit so titration overrides take effect
          doseAmount: resolved.doseAmount,
          doseUnit: resolved.doseUnit,
          timing,
          status: (existingLog?.status as TodayDoseItem['status']) || 'pending',
          notes: existingLog?.notes,
          vialExpired: hasExpiredVial,
          penUnits,
          concentration,
          servingSize: protocol.servingSize,
          servingUnit: protocol.servingUnit,
          // Refocus Phase 1 additions
          vialId,
          vialLabel,
          volumeDrawnMl,
          injectionSiteSuggestion,
          phase: resolved.phase,
          daysUntilNextPhaseBoundary: resolved.daysUntilNextPhaseBoundary ?? null,
        })
      }
    }

    todayItems.sort((a, b) => {
      if (a.itemType !== b.itemType) return a.itemType === 'peptide' ? -1 : 1
      const aOrder = a.timing ? TIMING_ORDER[a.timing.toLowerCase()] || 50 : 50
      const bOrder = b.timing ? TIMING_ORDER[b.timing.toLowerCase()] || 50 : 50
      return aOrder - bOrder
    })

    return NextResponse.json(
      {
        date: targetDate.toISOString(),
        items: todayItems,
        summary: {
          total: todayItems.length,
          completed: todayItems.filter((i) => i.status === 'completed').length,
          pending: todayItems.filter((i) => i.status === 'pending').length,
          skipped: todayItems.filter((i) => i.status === 'skipped').length,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=30',
        },
      },
    )
  } catch (error) {
    console.error('Error fetching today checklist:', error)
    return NextResponse.json({ error: 'Failed to fetch today checklist' }, { status: 500 })
  }
}
