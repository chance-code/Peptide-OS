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

/**
 * Check if a date matches the protocol frequency
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
