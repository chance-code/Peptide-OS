import {
  startOfDay,
  endOfDay,
  addDays,
  differenceInDays,
  isWithinInterval,
  getDay,
  format,
  parseISO,
  isBefore,
  isAfter,
  isSameDay,
} from 'date-fns'
import type { DayOfWeek, FrequencyType } from '@/types'

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

// ────────────────────────────────────────────────────────────────────────────
// Cycle + titration types (structural matches to Prisma models;
// kept local so unit tests don't need a DB).
// ────────────────────────────────────────────────────────────────────────────
export type CycleMode = 'continuous' | 'cycled' | 'titrated'

export interface ProtocolCycleLike {
  onDays: number
  offDays: number
  cycleStartDate: Date
  /** -1 = indefinite; positive N = stop after N full cycles. Honored by phaseFor(). */
  repeatCount?: number
}

export interface TitrationStepLike {
  stepIndex: number
  /** Weeks from protocol start at which this step becomes active. */
  weekOffset: number
  doseAmount: number
  doseUnit: string
}

export interface ProtocolScheduleContext {
  startDate: Date
  frequency: FrequencyType
  customDays?: DayOfWeek[]
  /** Default: 'continuous' */
  cycleMode?: CycleMode
  /** Required when cycleMode='cycled'. */
  cycle?: ProtocolCycleLike | null
  /** Required when cycleMode='titrated'. Order doesn't matter; we sort by weekOffset. */
  titrationSteps?: TitrationStepLike[] | null
  /** Base dose (used when cycleMode !== 'titrated' or when date is before any titration step). */
  doseAmount: number
  doseUnit: string
}

export interface PhaseInfo {
  /** 'on' | 'off' | `titration_step_N` | null (continuous). */
  phase: string | null
  /** 0-based day within the current phase. */
  dayInPhase?: number
  /** Days until the next phase boundary (>=1). Undefined for continuous or finished cycles. */
  daysUntilNextPhaseBoundary?: number
  /** Whether the cycle has completed all its configured repeats. */
  cycleFinished?: boolean
}

export interface ResolvedDose extends PhaseInfo {
  /** True iff user should take a dose today (frequency matches AND on-phase). */
  isDue: boolean
  /** Effective dose amount for this date (titration steps can override). */
  doseAmount: number
  doseUnit: string
}

/**
 * Check if a date matches the protocol frequency.
 * Pure frequency matching — does NOT consider cycle/phase. Use resolveDose() for the full picture.
 */
export function isDoseDay(
  date: Date,
  frequency: FrequencyType,
  startDate: Date,
  customDays?: DayOfWeek[]
): boolean {
  const targetDate = startOfDay(date)
  const protocolStart = startOfDay(startDate)

  // Can't have doses before start
  if (isBefore(targetDate, protocolStart)) {
    return false
  }

  switch (frequency) {
    case 'daily':
      return true

    case 'weekly':
      // Same day of week as start date
      return getDay(targetDate) === getDay(protocolStart)

    case 'custom':
      if (!customDays || customDays.length === 0) return false
      const dayOfWeek = DAY_INDEX_MAP[getDay(targetDate)]
      return customDays.includes(dayOfWeek)

    default:
      return false
  }
}

/**
 * Resolve the cycle phase for a given date.
 * Returns { phase: 'on'|'off', dayInPhase, daysUntilNextPhaseBoundary, cycleFinished }.
 *
 * If `cycleStartDate` is in the future → both phases return dayInPhase=0, phase='off' (not started).
 * If `repeatCount > 0` and the date is past the final cycle, `cycleFinished=true` and phase='off'.
 */
export function phaseFor(date: Date, cycle: ProtocolCycleLike): PhaseInfo {
  const target = startOfDay(date)
  const start = startOfDay(cycle.cycleStartDate)
  const cycleLen = cycle.onDays + cycle.offDays

  if (cycleLen <= 0) {
    return { phase: 'off', dayInPhase: 0, cycleFinished: true }
  }

  const diff = differenceInDays(target, start)
  if (diff < 0) {
    // Before cycle start → pre-cycle; treat as off-phase
    return {
      phase: 'off',
      dayInPhase: 0,
      daysUntilNextPhaseBoundary: -diff,
    }
  }

  const repeatCount = cycle.repeatCount ?? -1
  if (repeatCount > 0) {
    const totalDays = cycleLen * repeatCount
    if (diff >= totalDays) {
      return { phase: 'off', dayInPhase: 0, cycleFinished: true }
    }
  }

  const cycleDay = diff % cycleLen
  if (cycleDay < cycle.onDays) {
    return {
      phase: 'on',
      dayInPhase: cycleDay,
      daysUntilNextPhaseBoundary: cycle.onDays - cycleDay,
    }
  }
  return {
    phase: 'off',
    dayInPhase: cycleDay - cycle.onDays,
    daysUntilNextPhaseBoundary: cycleLen - cycleDay,
  }
}

/**
 * Resolve the active titration step for a given date.
 * The active step is the one with the highest `weekOffset` whose offset is <= current weekDelta.
 * Returns null if date is before the earliest step or the steps list is empty.
 */
export function titrationStepFor(
  date: Date,
  protocolStart: Date,
  steps: TitrationStepLike[] | null | undefined
): TitrationStepLike | null {
  if (!steps || steps.length === 0) return null
  const target = startOfDay(date)
  const start = startOfDay(protocolStart)
  const daysDiff = differenceInDays(target, start)
  if (daysDiff < 0) return null
  const weeksDiff = Math.floor(daysDiff / 7)

  const sorted = [...steps].sort((a, b) => a.weekOffset - b.weekOffset)
  let active: TitrationStepLike | null = null
  for (const s of sorted) {
    if (s.weekOffset <= weeksDiff) {
      active = s
    } else {
      break
    }
  }
  return active
}

/**
 * Full resolution: should this protocol fire today, and at what dose + phase?
 * Used by /api/today, /api/cron/reminders, and DoseSchedule population.
 */
export function resolveDose(date: Date, ctx: ProtocolScheduleContext): ResolvedDose {
  const mode: CycleMode = ctx.cycleMode ?? 'continuous'
  const frequencyMatches = isDoseDay(date, ctx.frequency, ctx.startDate, ctx.customDays)

  // Cycled: gate on phase
  if (mode === 'cycled' && ctx.cycle) {
    const p = phaseFor(date, ctx.cycle)
    const isDue = frequencyMatches && p.phase === 'on' && !p.cycleFinished
    return {
      isDue,
      doseAmount: ctx.doseAmount,
      doseUnit: ctx.doseUnit,
      phase: p.phase,
      dayInPhase: p.dayInPhase,
      daysUntilNextPhaseBoundary: p.daysUntilNextPhaseBoundary,
      cycleFinished: p.cycleFinished,
    }
  }

  // Titrated: frequency matches + find the active step's dose (fallback to base dose if pre-ramp)
  if (mode === 'titrated' && ctx.titrationSteps && ctx.titrationSteps.length > 0) {
    const step = titrationStepFor(date, ctx.startDate, ctx.titrationSteps)
    const phase = step ? `titration_step_${step.stepIndex}` : null
    return {
      isDue: frequencyMatches,
      doseAmount: step?.doseAmount ?? ctx.doseAmount,
      doseUnit: step?.doseUnit ?? ctx.doseUnit,
      phase,
    }
  }

  // Continuous (default): frequency-only
  return {
    isDue: frequencyMatches,
    doseAmount: ctx.doseAmount,
    doseUnit: ctx.doseUnit,
    phase: null,
  }
}

/**
 * Get all dose dates within a range for a protocol
 */
export function getDoseDatesInRange(
  startDate: Date,
  endDate: Date | null | undefined,
  frequency: FrequencyType,
  customDays?: DayOfWeek[],
  rangeStart?: Date,
  rangeEnd?: Date
): Date[] {
  const dates: Date[] = []
  const protocolStart = startOfDay(startDate)
  const protocolEnd = endDate ? startOfDay(endDate) : null

  // Default range is next 30 days if not specified
  const effectiveRangeStart = startOfDay(rangeStart || new Date())
  const effectiveRangeEnd = startOfDay(rangeEnd || addDays(new Date(), 30))

  // Determine actual start (max of protocol start and range start)
  const iterStart = isAfter(effectiveRangeStart, protocolStart)
    ? effectiveRangeStart
    : protocolStart

  // Determine actual end (min of protocol end and range end)
  let iterEnd = effectiveRangeEnd
  if (protocolEnd && isBefore(protocolEnd, effectiveRangeEnd)) {
    iterEnd = protocolEnd
  }

  // Iterate through each day in range
  let current = iterStart
  while (!isAfter(current, iterEnd)) {
    if (isDoseDay(current, frequency, protocolStart, customDays)) {
      dates.push(current)
    }
    current = addDays(current, 1)
  }

  return dates
}

/**
 * Calculate days completed in a protocol
 */
export function calculateDaysCompleted(startDate: Date, endDate?: Date | null): number {
  const start = startOfDay(startDate)
  const end = endDate ? startOfDay(endDate) : startOfDay(new Date())
  const today = startOfDay(new Date())

  // If protocol hasn't started yet
  if (isAfter(start, today)) {
    return 0
  }

  // Use the earlier of today or end date
  const effectiveEnd = endDate && isBefore(end, today) ? end : today

  return Math.max(0, differenceInDays(effectiveEnd, start) + 1)
}

/**
 * Calculate days remaining in a protocol
 */
export function calculateDaysRemaining(endDate?: Date | null): number | null {
  if (!endDate) return null // Indefinite

  const end = startOfDay(endDate)
  const today = startOfDay(new Date())

  // If already ended
  if (isBefore(end, today)) {
    return 0
  }

  return differenceInDays(end, today)
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
}

/**
 * Format date for short display
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d')
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date
  return isSameDay(d, new Date())
}

/**
 * Get today's date at start of day
 */
export function getToday(): Date {
  return startOfDay(new Date())
}

/**
 * Parse custom days from JSON string
 */
export function parseCustomDays(customDaysJson?: string | null): DayOfWeek[] {
  if (!customDaysJson) return []
  try {
    return JSON.parse(customDaysJson) as DayOfWeek[]
  } catch {
    return []
  }
}

/**
 * Calculate adherence percentage
 */
export function calculateAdherence(completed: number, total: number): number {
  if (total === 0) return 100
  return Math.round((completed / total) * 100)
}
