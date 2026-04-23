import { describe, it, expect } from 'vitest'
import {
  countPendingDoseSlots,
  type ProtocolWithPhase,
  type CompletedDoseRow,
} from '../pending-doses'

const d = (iso: string) => new Date(`${iso}T12:00:00Z`)

const baseProtocol = (overrides: Partial<ProtocolWithPhase> = {}): ProtocolWithPhase => ({
  id: 'p1',
  startDate: d('2026-01-01'),
  endDate: null,
  frequency: 'daily',
  customDays: null,
  timing: 'morning',
  timings: null,
  doseAmount: 250,
  doseUnit: 'mcg',
  cycleMode: 'continuous',
  cycle: null,
  titrationSteps: [],
  ...overrides,
})

describe('countPendingDoseSlots — core reminder math', () => {
  it('continuous daily protocol with no logs → 1 pending', () => {
    const n = countPendingDoseSlots(d('2026-01-15'), [baseProtocol()], [])
    expect(n).toBe(1)
  })

  it('continuous daily protocol with completed log → 0 pending', () => {
    const n = countPendingDoseSlots(d('2026-01-15'), [baseProtocol()], [
      { protocolId: 'p1', timing: 'morning' },
    ])
    expect(n).toBe(0)
  })

  it('cycled protocol on off-phase day → 0 pending (THE CORE PHASE-AWARE TEST)', () => {
    const p = baseProtocol({
      id: 'retatrutide',
      cycleMode: 'cycled',
      cycle: {
        onDays: 28,
        offDays: 14,
        cycleStartDate: d('2026-01-01'),
        repeatCount: -1,
      },
    })
    // day 29 (2026-01-29) is off-phase
    const n = countPendingDoseSlots(d('2026-01-29'), [p], [])
    expect(n).toBe(0)
  })

  it('cycled protocol on on-phase day with no log → 1 pending', () => {
    const p = baseProtocol({
      cycleMode: 'cycled',
      cycle: { onDays: 28, offDays: 14, cycleStartDate: d('2026-01-01'), repeatCount: -1 },
    })
    const n = countPendingDoseSlots(d('2026-01-15'), [p], [])
    expect(n).toBe(1)
  })

  it('multiple timings per protocol → each unlogged slot counts separately', () => {
    const p = baseProtocol({
      timings: JSON.stringify(['morning', 'evening']),
    })
    // Only morning logged; evening still pending
    const logs: CompletedDoseRow[] = [{ protocolId: 'p1', timing: 'morning' }]
    expect(countPendingDoseSlots(d('2026-01-15'), [p], logs)).toBe(1)
  })

  it('multiple protocols: one off-phase, one continuous → only continuous counts', () => {
    const continuous = baseProtocol({ id: 'daily-supplement' })
    const cycled = baseProtocol({
      id: 'cycled-peptide',
      cycleMode: 'cycled',
      cycle: { onDays: 28, offDays: 14, cycleStartDate: d('2026-01-01'), repeatCount: -1 },
    })
    // day 29: off-phase for cycled, still active for continuous
    const n = countPendingDoseSlots(d('2026-01-29'), [continuous, cycled], [])
    expect(n).toBe(1)
  })

  it('protocol that has not started yet → 0 pending', () => {
    const p = baseProtocol({ startDate: d('2026-02-01') })
    const n = countPendingDoseSlots(d('2026-01-15'), [p], [])
    expect(n).toBe(0)
  })

  it('protocol that ended before today → 0 pending', () => {
    const p = baseProtocol({ endDate: d('2026-01-10') })
    const n = countPendingDoseSlots(d('2026-01-15'), [p], [])
    expect(n).toBe(0)
  })

  it('titrated protocol: frequency matches → pending (regardless of step)', () => {
    const p = baseProtocol({
      frequency: 'weekly', // start Thursday
      cycleMode: 'titrated',
      titrationSteps: [
        { stepIndex: 0, weekOffset: 0, doseAmount: 2, doseUnit: 'mg' },
        { stepIndex: 1, weekOffset: 4, doseAmount: 4, doseUnit: 'mg' },
      ],
    })
    // 2026-01-29 is Thursday (week 4 → step 1 active, frequency matches)
    expect(countPendingDoseSlots(d('2026-01-29'), [p], [])).toBe(1)
    // 2026-01-28 is Wednesday, frequency does not match
    expect(countPendingDoseSlots(d('2026-01-28'), [p], [])).toBe(0)
  })

  it('custom frequency with empty customDays → 0 pending', () => {
    const p = baseProtocol({ frequency: 'custom', customDays: '[]' })
    expect(countPendingDoseSlots(d('2026-01-15'), [p], [])).toBe(0)
  })

  it('malformed customDays JSON → 0 pending (treated as empty)', () => {
    const p = baseProtocol({ frequency: 'custom', customDays: 'not-json' })
    expect(countPendingDoseSlots(d('2026-01-15'), [p], [])).toBe(0)
  })
})
