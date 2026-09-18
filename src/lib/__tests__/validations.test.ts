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
  it('accepts a plain array', () => {
    expect(createProtocolSchema.safeParse({ ...base, customDays: ['sat'] }).success).toBe(true)
  })
  it('rejects unknown day names', () => {
    expect(createProtocolSchema.safeParse({ ...base, customDays: '["monday"]' }).success).toBe(false)
  })
})
