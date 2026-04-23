/**
 * schedule-materializer.ts — pre-populate DoseSchedule rows for a rolling window.
 *
 * Purpose (2026-04-23 refocus Phase 1.J):
 *   Turn the dormant `DoseSchedule` table into the authoritative cache of "what is due
 *   on date X" for each active protocol. `/api/today` and `/api/cron/reminders` read
 *   from it; this module populates it.
 *
 * Invariants:
 *   - One DoseSchedule row per (protocolId, scheduledDate). Multiple-timing protocols
 *     still get one row per day; iOS expands per-timing dose items at render time.
 *   - Past DoseSchedule rows are treated as historical record and are NEVER deleted
 *     by this module — only future rows (scheduledDate >= today) are invalidated and
 *     regenerated.
 *   - Horizon default is 90 days (about a cycle of GLP-1 titration).
 *   - Rows carry the RESOLVED doseAmount/doseUnit so titrated protocols (whose dose
 *     changes week-over-week) show the correct dose at every date.
 */
import { addDays, differenceInDays, startOfDay } from 'date-fns'
import type { Prisma } from '@prisma/client'
import { resolveDose, type CycleMode } from './schedule'
import type { DayOfWeek, FrequencyType } from '@/types'

export const DEFAULT_SCHEDULE_HORIZON_DAYS = 90

/**
 * (Re)materialize the DoseSchedule for a single protocol over the horizon window.
 * MUST be called inside a Prisma transaction so the delete+insert are atomic.
 *
 * Returns { created, deletedFuture } for logging / telemetry.
 */
export async function materializeScheduleForProtocol(
  tx: Prisma.TransactionClient,
  protocolId: string,
  horizonDays: number = DEFAULT_SCHEDULE_HORIZON_DAYS,
): Promise<{ created: number; deletedFuture: number }> {
  const protocol = await tx.protocol.findUnique({
    where: { id: protocolId },
    include: {
      cycle: true,
      titrationSteps: { orderBy: { weekOffset: 'asc' } },
    },
  })

  if (!protocol) return { created: 0, deletedFuture: 0 }

  const today = startOfDay(new Date())

  // Always clear future rows first
  const deleted = await tx.doseSchedule.deleteMany({
    where: { protocolId, scheduledDate: { gte: today } },
  })

  // Inactive protocols get no new rows (paused/completed)
  if (protocol.status !== 'active') {
    return { created: 0, deletedFuture: deleted.count }
  }

  // Horizon: min(today + horizon, protocol.endDate)
  const horizonEnd = addDays(today, horizonDays)
  const effectiveEnd =
    protocol.endDate && protocol.endDate < horizonEnd
      ? startOfDay(protocol.endDate)
      : horizonEnd

  // Parse customDays once
  let customDays: DayOfWeek[] | undefined
  if (protocol.customDays) {
    try {
      customDays = JSON.parse(protocol.customDays) as DayOfWeek[]
    } catch {
      customDays = undefined
    }
  }

  // Walk dates from max(today, protocol.startDate) through effectiveEnd
  const startCursor =
    protocol.startDate > today ? startOfDay(protocol.startDate) : today

  const rows: Array<{
    protocolId: string
    scheduledDate: Date
    doseAmount: number
    doseUnit: string
    timing: string | null
  }> = []

  let current = startCursor
  while (current <= effectiveEnd) {
    const resolved = resolveDose(current, {
      startDate: protocol.startDate,
      frequency: protocol.frequency as FrequencyType,
      customDays,
      cycleMode: protocol.cycleMode as CycleMode,
      cycle: protocol.cycle,
      titrationSteps: protocol.titrationSteps,
      doseAmount: protocol.doseAmount,
      doseUnit: protocol.doseUnit,
    })

    if (resolved.isDue) {
      rows.push({
        protocolId: protocol.id,
        scheduledDate: new Date(current),
        doseAmount: resolved.doseAmount,
        doseUnit: resolved.doseUnit,
        timing: protocol.timing ?? null,
      })
    }

    current = addDays(current, 1)
  }

  if (rows.length > 0) {
    await tx.doseSchedule.createMany({ data: rows })
  }

  return { created: rows.length, deletedFuture: deleted.count }
}

/**
 * (Re)materialize all active protocols for a user. Used by the nightly cron to extend
 * the rolling window and by the post-login boot to guarantee coverage.
 */
export async function materializeScheduleForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  horizonDays: number = DEFAULT_SCHEDULE_HORIZON_DAYS,
): Promise<{ protocolsTouched: number; rowsCreated: number; rowsDeleted: number }> {
  const protocols = await tx.protocol.findMany({
    where: { userId, status: 'active' },
    select: { id: true },
  })

  let created = 0
  let deleted = 0
  for (const p of protocols) {
    const r = await materializeScheduleForProtocol(tx, p.id, horizonDays)
    created += r.created
    deleted += r.deletedFuture
  }
  return { protocolsTouched: protocols.length, rowsCreated: created, rowsDeleted: deleted }
}

/**
 * (Re)materialize all active protocols for ALL users (nightly cron).
 * Horizon-extending: each night, the rolling window shifts forward by 1 day. Rather than
 * doing incremental math, we regenerate fully — it's O(N*horizon) with small constants
 * and runs once a night.
 */
export async function materializeScheduleForAllActive(
  tx: Prisma.TransactionClient,
  horizonDays: number = DEFAULT_SCHEDULE_HORIZON_DAYS,
): Promise<{ protocolsTouched: number; rowsCreated: number; rowsDeleted: number }> {
  const protocols = await tx.protocol.findMany({
    where: { status: 'active' },
    select: { id: true },
  })

  let created = 0
  let deleted = 0
  for (const p of protocols) {
    const r = await materializeScheduleForProtocol(tx, p.id, horizonDays)
    created += r.created
    deleted += r.deletedFuture
  }
  return { protocolsTouched: protocols.length, rowsCreated: created, rowsDeleted: deleted }
}
