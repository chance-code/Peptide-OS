import { describe, it, expect } from 'vitest'
import { volumePerDoseMl, suggestInjectionSite } from '../route'

// ────────────────────────────────────────────────────────────────────────────
// volumePerDoseMl — the computation the Today view renders as "draw X mL"
// ────────────────────────────────────────────────────────────────────────────

describe('volumePerDoseMl', () => {
  it('same units (mg dose, mg/mL vial): BPC-157 250 mcg from 5 mg/mL → 0.05 mL', () => {
    // 250 mcg = 0.25 mg; vial 5 mg/mL → 0.25 / 5 = 0.05 mL
    expect(volumePerDoseMl(250, 'mcg', 5, 'mg')).toBe(0.05)
  })

  it('same units all mg: Tirzepatide 2.5 mg from 10 mg/mL → 0.25 mL', () => {
    expect(volumePerDoseMl(2.5, 'mg', 10, 'mg')).toBe(0.25)
  })

  it('dose mg, vial mcg/mL: 0.5 mg dose from 500 mcg/mL → 1.0 mL', () => {
    // 0.5 mg = 500 mcg; 500 / 500 = 1.0 mL
    expect(volumePerDoseMl(0.5, 'mg', 500, 'mcg')).toBe(1.0)
  })

  it('dose mcg, vial mcg/mL: 100 mcg from 250 mcg/mL → 0.4 mL', () => {
    expect(volumePerDoseMl(100, 'mcg', 250, 'mcg')).toBe(0.4)
  })

  it('IU requires exact unit match (incompatible with mg → null)', () => {
    expect(volumePerDoseMl(10, 'IU', 100, 'mg')).toBeNull()
    expect(volumePerDoseMl(10, 'mg', 100, 'IU')).toBeNull()
  })

  it('IU with IU vial: returns dose / concentration directly', () => {
    expect(volumePerDoseMl(10, 'IU', 100, 'IU')).toBe(0.1)
  })

  it('null or zero concentration → null', () => {
    expect(volumePerDoseMl(1, 'mg', null, 'mg')).toBeNull()
    expect(volumePerDoseMl(1, 'mg', 0, 'mg')).toBeNull()
    expect(volumePerDoseMl(1, 'mg', -1, 'mg')).toBeNull()
  })

  it('rounds to 3 decimals (μL resolution)', () => {
    // 50 mcg from 10 mg/mL: 50/10000 = 0.005 mL
    expect(volumePerDoseMl(50, 'mcg', 10, 'mg')).toBe(0.005)
    // 33 mcg from 7 mg/mL: 33/7000 = 0.00471... → 0.005
    expect(volumePerDoseMl(33, 'mcg', 7, 'mg')).toBe(0.005)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// suggestInjectionSite — rotation hint
// ────────────────────────────────────────────────────────────────────────────

describe('suggestInjectionSite', () => {
  it('null last site → default starting site (left_abdomen)', () => {
    expect(suggestInjectionSite(null)).toBe('left_abdomen')
    expect(suggestInjectionSite(undefined)).toBe('left_abdomen')
  })

  it('left → right on same body part', () => {
    expect(suggestInjectionSite('left_abdomen')).toBe('right_abdomen')
    expect(suggestInjectionSite('left_thigh')).toBe('right_thigh')
    expect(suggestInjectionSite('left_deltoid')).toBe('right_deltoid')
  })

  it('right → left on same body part', () => {
    expect(suggestInjectionSite('right_abdomen')).toBe('left_abdomen')
    expect(suggestInjectionSite('right_thigh')).toBe('left_thigh')
  })

  it('unknown format returns unchanged (caller decides)', () => {
    expect(suggestInjectionSite('center_abdomen')).toBe('center_abdomen')
    expect(suggestInjectionSite('glute')).toBe('glute')
  })
})
