import { describe, it, expect } from 'vitest'
import {
  isDoseDay,
  phaseFor,
  titrationStepFor,
  resolveDose,
  type ProtocolCycleLike,
  type TitrationStepLike,
  type ProtocolScheduleContext,
} from '../schedule'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
const d = (iso: string) => new Date(`${iso}T12:00:00Z`)

// ────────────────────────────────────────────────────────────────────────────
// isDoseDay (existing, covered for regression)
// ────────────────────────────────────────────────────────────────────────────
describe('isDoseDay — continuous protocol', () => {
  const start = d('2026-01-01') // Thursday

  it('daily: every day after start is due', () => {
    expect(isDoseDay(d('2026-01-01'), 'daily', start)).toBe(true)
    expect(isDoseDay(d('2026-01-07'), 'daily', start)).toBe(true)
    expect(isDoseDay(d('2026-03-15'), 'daily', start)).toBe(true)
  })

  it('daily: dates before start are not due', () => {
    expect(isDoseDay(d('2025-12-31'), 'daily', start)).toBe(false)
  })

  it('weekly: only matches the same weekday as start', () => {
    // start is a Thursday
    expect(isDoseDay(d('2026-01-08'), 'weekly', start)).toBe(true) // Thursday
    expect(isDoseDay(d('2026-01-09'), 'weekly', start)).toBe(false) // Friday
    expect(isDoseDay(d('2026-01-15'), 'weekly', start)).toBe(true) // Thursday
  })

  it('custom: only fires on listed days', () => {
    // Dec 31 2025 is a Wednesday; Jan 1 2026 is Thursday; Jan 2 is Friday; Jan 3 is Saturday
    const starts = d('2026-01-01')
    expect(isDoseDay(d('2026-01-05'), 'custom', starts, ['mon'])).toBe(true) // Mon
    expect(isDoseDay(d('2026-01-06'), 'custom', starts, ['mon'])).toBe(false) // Tue
    expect(isDoseDay(d('2026-01-07'), 'custom', starts, ['mon', 'wed', 'fri'])).toBe(true) // Wed
    expect(isDoseDay(d('2026-01-05'), 'custom', starts, [])).toBe(false) // empty list
  })

  it('every_other_day: fires on days 0, 2, 4, ... from start', () => {
    const starts = d('2026-01-01')
    expect(isDoseDay(d('2026-01-01'), 'every_other_day', starts)).toBe(true) // day 0
    expect(isDoseDay(d('2026-01-02'), 'every_other_day', starts)).toBe(false) // day 1
    expect(isDoseDay(d('2026-01-03'), 'every_other_day', starts)).toBe(true) // day 2
    expect(isDoseDay(d('2026-01-15'), 'every_other_day', starts)).toBe(true) // day 14 (even)
    expect(isDoseDay(d('2026-01-16'), 'every_other_day', starts)).toBe(false) // day 15 (odd)
    // Before start
    expect(isDoseDay(d('2025-12-31'), 'every_other_day', starts)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// phaseFor — on/off cycle resolution
// ────────────────────────────────────────────────────────────────────────────
describe('phaseFor — cycled protocol', () => {
  // 28 days on, 14 days off, starting Jan 1 2026 — cycle length 42
  const cycle: ProtocolCycleLike = {
    onDays: 28,
    offDays: 14,
    cycleStartDate: d('2026-01-01'),
    repeatCount: -1,
  }

  it('first day of cycle is on-phase, day 0', () => {
    const p = phaseFor(d('2026-01-01'), cycle)
    expect(p.phase).toBe('on')
    expect(p.dayInPhase).toBe(0)
    expect(p.daysUntilNextPhaseBoundary).toBe(28)
  })

  it('day 27 still on-phase (last on-day)', () => {
    const p = phaseFor(d('2026-01-28'), cycle)
    expect(p.phase).toBe('on')
    expect(p.dayInPhase).toBe(27)
    expect(p.daysUntilNextPhaseBoundary).toBe(1)
  })

  it('day 28 flips to off-phase (first off-day)', () => {
    const p = phaseFor(d('2026-01-29'), cycle)
    expect(p.phase).toBe('off')
    expect(p.dayInPhase).toBe(0)
    expect(p.daysUntilNextPhaseBoundary).toBe(14)
  })

  it('day 41 is last off-day', () => {
    const p = phaseFor(d('2026-02-11'), cycle)
    expect(p.phase).toBe('off')
    expect(p.dayInPhase).toBe(13)
    expect(p.daysUntilNextPhaseBoundary).toBe(1)
  })

  it('day 42 starts a new cycle (on-phase day 0 again)', () => {
    const p = phaseFor(d('2026-02-12'), cycle)
    expect(p.phase).toBe('on')
    expect(p.dayInPhase).toBe(0)
    expect(p.daysUntilNextPhaseBoundary).toBe(28)
  })

  it('dates before cycle start are off-phase with countdown', () => {
    const p = phaseFor(d('2025-12-25'), cycle)
    expect(p.phase).toBe('off')
    expect(p.dayInPhase).toBe(0)
    expect(p.daysUntilNextPhaseBoundary).toBe(7) // 7 days until Jan 1
  })

  it('finite repeatCount: past the last cycle returns cycleFinished', () => {
    const finite: ProtocolCycleLike = { ...cycle, repeatCount: 2 }
    // 2 cycles * 42 days = 84 days; day 84 is past the end
    const p = phaseFor(d('2026-03-26'), finite) // day 84
    expect(p.cycleFinished).toBe(true)
    expect(p.phase).toBe('off')
  })

  it('zero-length cycle is cycleFinished immediately', () => {
    const degenerate: ProtocolCycleLike = {
      onDays: 0,
      offDays: 0,
      cycleStartDate: d('2026-01-01'),
    }
    expect(phaseFor(d('2026-01-01'), degenerate).cycleFinished).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// titrationStepFor — step resolution by weekOffset
// ────────────────────────────────────────────────────────────────────────────
describe('titrationStepFor — titrated protocol', () => {
  // Retatrutide-style: week 0 = 2mg, week 4 = 4mg, week 8 = 6mg, week 12 = 8mg
  const steps: TitrationStepLike[] = [
    { stepIndex: 0, weekOffset: 0, doseAmount: 2, doseUnit: 'mg' },
    { stepIndex: 1, weekOffset: 4, doseAmount: 4, doseUnit: 'mg' },
    { stepIndex: 2, weekOffset: 8, doseAmount: 6, doseUnit: 'mg' },
    { stepIndex: 3, weekOffset: 12, doseAmount: 8, doseUnit: 'mg' },
  ]
  const start = d('2026-01-01') // Thursday

  it('returns null for dates before protocol start', () => {
    expect(titrationStepFor(d('2025-12-31'), start, steps)).toBeNull()
  })

  it('week 0 resolves to step 0 (2mg)', () => {
    const s = titrationStepFor(d('2026-01-01'), start, steps)
    expect(s?.stepIndex).toBe(0)
    expect(s?.doseAmount).toBe(2)
  })

  it('week 3 (pre-ramp) still resolves to step 0', () => {
    const s = titrationStepFor(d('2026-01-22'), start, steps)
    expect(s?.stepIndex).toBe(0)
  })

  it('week 4 (28 days) flips to step 1 (4mg)', () => {
    const s = titrationStepFor(d('2026-01-29'), start, steps)
    expect(s?.stepIndex).toBe(1)
    expect(s?.doseAmount).toBe(4)
  })

  it('week 8 flips to step 2 (6mg)', () => {
    const s = titrationStepFor(d('2026-02-26'), start, steps)
    expect(s?.stepIndex).toBe(2)
    expect(s?.doseAmount).toBe(6)
  })

  it('week 15 stays at step 3 (last step holds after its weekOffset)', () => {
    const s = titrationStepFor(d('2026-04-16'), start, steps)
    expect(s?.stepIndex).toBe(3)
  })

  it('empty or null steps returns null', () => {
    expect(titrationStepFor(d('2026-01-10'), start, [])).toBeNull()
    expect(titrationStepFor(d('2026-01-10'), start, null)).toBeNull()
  })

  it('unsorted steps are handled correctly', () => {
    const shuffled = [steps[2], steps[0], steps[3], steps[1]]
    const s = titrationStepFor(d('2026-01-29'), start, shuffled)
    expect(s?.stepIndex).toBe(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// resolveDose — the full picture
// ────────────────────────────────────────────────────────────────────────────
describe('resolveDose — combined frequency + cycle + titration', () => {
  const baseCtx: ProtocolScheduleContext = {
    startDate: d('2026-01-01'),
    frequency: 'daily',
    doseAmount: 250,
    doseUnit: 'mcg',
  }

  it('continuous: always due when frequency matches', () => {
    const r = resolveDose(d('2026-01-15'), baseCtx)
    expect(r.isDue).toBe(true)
    expect(r.doseAmount).toBe(250)
    expect(r.phase).toBeNull()
  })

  it('cycled: suppresses dose on off-phase days (core reminder test)', () => {
    const cycled: ProtocolScheduleContext = {
      ...baseCtx,
      cycleMode: 'cycled',
      cycle: {
        onDays: 28,
        offDays: 14,
        cycleStartDate: d('2026-01-01'),
        repeatCount: -1,
      },
    }
    // Day 15 — on phase, frequency matches (daily)
    expect(resolveDose(d('2026-01-16'), cycled).isDue).toBe(true)
    // Day 29 (2026-01-29) — off phase
    const off = resolveDose(d('2026-01-29'), cycled)
    expect(off.isDue).toBe(false)
    expect(off.phase).toBe('off')
    expect(off.dayInPhase).toBe(0)
  })

  it('cycled: finished cycle returns isDue=false regardless of frequency', () => {
    const finite: ProtocolScheduleContext = {
      ...baseCtx,
      cycleMode: 'cycled',
      cycle: {
        onDays: 28,
        offDays: 14,
        cycleStartDate: d('2026-01-01'),
        repeatCount: 1, // one full cycle only (42 days)
      },
    }
    const r = resolveDose(d('2026-03-01'), finite) // past day 42
    expect(r.isDue).toBe(false)
    expect(r.cycleFinished).toBe(true)
  })

  it('titrated: doseAmount overrides base dose based on weekOffset', () => {
    const titrated: ProtocolScheduleContext = {
      ...baseCtx,
      frequency: 'weekly',
      doseAmount: 2,
      doseUnit: 'mg',
      cycleMode: 'titrated',
      titrationSteps: [
        { stepIndex: 0, weekOffset: 0, doseAmount: 2, doseUnit: 'mg' },
        { stepIndex: 1, weekOffset: 4, doseAmount: 4, doseUnit: 'mg' },
      ],
    }
    // Week 4 (2026-01-29, Thursday — same weekday as start)
    const r = resolveDose(d('2026-01-29'), titrated)
    expect(r.isDue).toBe(true)
    expect(r.doseAmount).toBe(4)
    expect(r.doseUnit).toBe('mg')
    expect(r.phase).toBe('titration_step_1')
  })

  it('titrated: frequency mismatch returns isDue=false even if step is active', () => {
    const titrated: ProtocolScheduleContext = {
      ...baseCtx,
      frequency: 'weekly', // start is Thursday
      cycleMode: 'titrated',
      titrationSteps: [{ stepIndex: 0, weekOffset: 0, doseAmount: 2, doseUnit: 'mg' }],
    }
    // 2026-01-05 is Monday (not Thursday) → frequency does not match
    const r = resolveDose(d('2026-01-05'), titrated)
    expect(r.isDue).toBe(false)
    expect(r.phase).toBe('titration_step_0')
  })

  it('continuous with cycle data ignored when cycleMode is default', () => {
    // Even if cycle is present, default 'continuous' means it's ignored.
    const ctx: ProtocolScheduleContext = {
      ...baseCtx,
      cycle: {
        onDays: 28,
        offDays: 14,
        cycleStartDate: d('2026-01-01'),
        repeatCount: -1,
      },
    }
    const r = resolveDose(d('2026-01-29'), ctx) // would be off-phase if cycled
    expect(r.isDue).toBe(true)
    expect(r.phase).toBeNull()
  })
})
