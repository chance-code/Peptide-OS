import { describe, it, expect } from 'vitest'
import { createProtocolSchema } from '../validations'

const base = {
  peptideId: 'clx0000000000000000000000',
  startDate: '2026-09-17',
  frequency: 'custom',
  doseAmount: 12.5,
  doseUnit: 'mg',
}

describe('createProtocolSchema.customDays', () => {
  it('accepts the JSON string the iOS app sends', () => {
    const r = createProtocolSchema.safeParse({ ...base, customDays: '["mon","wed","fri"]' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.customDays).toEqual(['mon', 'wed', 'fri'])
  })
  it('accepts the full day names the iOS app actually sends', () => {
    const r = createProtocolSchema.safeParse({ ...base, customDays: '["monday","wednesday","Friday"]' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.customDays).toEqual(['mon', 'wed', 'fri'])
  })
  it('accepts a plain array', () => {
    expect(createProtocolSchema.safeParse({ ...base, customDays: ['sat'] }).success).toBe(true)
  })
  it('rejects unknown day names', () => {
    expect(createProtocolSchema.safeParse({ ...base, customDays: '["funday"]' }).success).toBe(false)
  })
})

import { parseCustomDays, normalizeDayOfWeek } from '../schedule'

describe('parseCustomDays', () => {
  it('normalizes stored full names and drops junk', () => {
    expect(parseCustomDays('["monday","Wed","fri","nope"]')).toEqual(['mon', 'wed', 'fri'])
    expect(parseCustomDays(null)).toEqual([])
    expect(parseCustomDays('not json')).toEqual([])
  })
  it('normalizeDayOfWeek handles case and length', () => {
    expect(normalizeDayOfWeek('SUNDAY')).toBe('sun')
    expect(normalizeDayOfWeek(3)).toBeNull()
  })
})
