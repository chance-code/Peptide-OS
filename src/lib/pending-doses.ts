/**
 * pending-doses.ts — count how many doses are DUE but not yet COMPLETED for a user on a given date.
 *
 * Refocus Phase 1.H: the old reminder cron counted `DoseLog` rows with status='pending',
 * but those rows are never created up-front — DoseLog is created on the first user interaction.
 * The result: users who never logged anything got zero reminders even though they had 5 active
 * protocols due today.
 *
 * This helper derives "expected" from the protocols + resolveDose() (cycle + titration aware),
 * then subtracts "already completed" DoseLog rows. The difference is the true pending count.
 *
 * Exported as a pure-ish function over a narrowly-typed Prisma-like interface so it can be
 * unit-tested without a real DB.
 */
import { endOfDay, startOfDay } from 'date-fns'
import { resolveDose } from './schedule'
import type { DayOfWeek, FrequencyType } from '@/types'

/** Shape matching Prisma protocol + cycle + titrationSteps relation. Keeps this helper testable. */
export interface ProtocolWithPhase {
  id: string
  startDate: Date
  endDate: Date | null
  frequency: string
  customDays: string | null
  timing: string | null
  timings: string | null
  doseAmount: number
  doseUnit: string
  cycleMode: string
  cycle: { onDays: number; offDays: number; cycleStartDate: Date; repeatCount: number | null } | null
  titrationSteps: Array<{ stepIndex: number; weekOffset: number; doseAmount: number; doseUnit: string }>
}

export interface CompletedDoseRow {
  protocolId: string
  timing: string | null
}

/**
 * Compute the number of (protocol × timing) slots that are:
 *   (a) due today per resolveDose (frequency + cycle + titration)
 *   (b) NOT yet represented by a DoseLog with status='completed'
 *
 * Returns 0 if everything due today is already checked off.
 */
export function countPendingDoseSlots(
  date: Date,
  protocols: ProtocolWithPhase[],
  completedLogs: CompletedDoseRow[],
): number {
  const dayStart = startOfDay(date)
  const dayEnd = endOfDay(date)

  const completedKeys = new Set(
    completedLogs.map((l) => `${l.protocolId}-${l.timing ?? ''}`),
  )

  let pending = 0

  for (const p of protocols) {
    // Skip if protocol isn't active for this date
    if (p.startDate > dayEnd) continue
    if (p.endDate && p.endDate < dayStart) continue

    // Parse customDays
    let customDays: DayOfWeek[] | undefined
    if (p.customDays) {
      try {
        customDays = JSON.parse(p.customDays) as DayOfWeek[]
      } catch {
        customDays = undefined
      }
    }

    const resolved = resolveDose(date, {
      startDate: p.startDate,
      frequency: p.frequency as FrequencyType,
      customDays,
      cycleMode: p.cycleMode as 'continuous' | 'cycled' | 'titrated',
      cycle: p.cycle
        ? {
            onDays: p.cycle.onDays,
            offDays: p.cycle.offDays,
            cycleStartDate: p.cycle.cycleStartDate,
            repeatCount: p.cycle.repeatCount ?? -1,
          }
        : null,
      titrationSteps: p.titrationSteps,
      doseAmount: p.doseAmount,
      doseUnit: p.doseUnit,
    })

    if (!resolved.isDue) continue

    // Each protocol may have multiple timings per day
    let timings: (string | null)[] = [p.timing]
    if (p.timings) {
      try {
        const parsed = JSON.parse(p.timings) as string[]
        if (parsed.length > 0) timings = parsed
      } catch {
        /* fallback */
      }
    }

    for (const t of timings) {
      const key = `${p.id}-${t ?? ''}`
      if (!completedKeys.has(key)) pending++
    }
  }

  return pending
}
