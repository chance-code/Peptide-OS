import { describe, it, expect } from 'vitest'
import {
  calculateReconstitution,
  mlToUnits,
  unitsToMl,
  formatVolume,
  formatConcentration,
} from '../reconstitution'

// ────────────────────────────────────────────────────────────────────────────
// calculateReconstitution — the math the refocus Today flow depends on.
// Each scenario represents a real peptide workflow the owner will use.
// ────────────────────────────────────────────────────────────────────────────

describe('calculateReconstitution — typical concentrations', () => {
  it('BPC-157: 10 mg vial + 2 mL BAC water → 5 mg/mL, 0.05 mL per 250 mcg dose', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 2,
      targetDose: 250,
      targetUnit: 'mcg',
    })
    expect(r.concentration).toBe(5)
    expect(r.concentrationUnit).toBe('mg/ml')
    // 250 mcg = 0.25 mg; 0.25 mg ÷ 5 mg/ml = 0.05 ml
    expect(r.volumePerDose).toBeCloseTo(0.05, 5)
    // 2 ml / 0.05 ml = 40 doses
    expect(r.totalDoses).toBe(40)
  })

  it('Tirzepatide: 10 mg + 1 mL → 10 mg/mL, 2.5 mg dose → 0.25 mL (25 insulin units)', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 1,
      targetDose: 2.5,
      targetUnit: 'mg',
    })
    expect(r.concentration).toBe(10)
    expect(r.volumePerDose).toBeCloseTo(0.25, 5)
    expect(r.totalDoses).toBe(4)
    expect(mlToUnits(r.volumePerDose!)).toBe(25)
  })

  it('Retatrutide (refocus reference dose): 10 mg + 2 mL → 5 mg/mL, 2 mg → 0.4 mL', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 2,
      targetDose: 2,
      targetUnit: 'mg',
    })
    expect(r.concentration).toBe(5)
    expect(r.volumePerDose).toBeCloseTo(0.4, 5)
    expect(r.totalDoses).toBe(5)
  })

  it('Selank: 10 mg + 2 mL → 5 mg/mL, 600 mcg dose → 0.12 mL', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 2,
      targetDose: 600,
      targetUnit: 'mcg',
    })
    expect(r.concentration).toBe(5)
    // 600 mcg = 0.6 mg; 0.6 / 5 = 0.12 ml
    expect(r.volumePerDose).toBeCloseTo(0.12, 5)
    expect(r.totalDoses).toBe(16) // 2 / 0.12 = 16.67 → floor = 16
  })
})

describe('calculateReconstitution — edge concentrations', () => {
  it('very low dose: 10 mg vial + 10 mL → 1 mg/mL, 100 mcg dose → 0.1 mL (robust to small numbers)', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 10,
      targetDose: 100,
      targetUnit: 'mcg',
    })
    expect(r.concentration).toBe(1)
    expect(r.volumePerDose).toBeCloseTo(0.1, 5)
    expect(r.totalDoses).toBe(100)
  })

  it('very high concentration: 50 mg vial + 1 mL → 50 mg/mL, 5 mg dose → 0.1 mL', () => {
    const r = calculateReconstitution({
      vialAmount: 50,
      vialUnit: 'mg',
      diluentVolume: 1,
      targetDose: 5,
      targetUnit: 'mg',
    })
    expect(r.concentration).toBe(50)
    expect(r.volumePerDose).toBeCloseTo(0.1, 5)
    expect(r.totalDoses).toBe(10)
  })

  it('tiny-volume fractional dose: 10 mg + 1 mL → 10 mg/mL, 50 mcg → 0.005 mL (5 µL)', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 1,
      targetDose: 50,
      targetUnit: 'mcg',
    })
    expect(r.concentration).toBe(10)
    // 50 mcg = 0.05 mg; 0.05 / 10 = 0.005 ml
    expect(r.volumePerDose).toBeCloseTo(0.005, 6)
    expect(r.totalDoses).toBe(200)
  })

  it('no targetDose → only concentration computed, no volumePerDose', () => {
    const r = calculateReconstitution({
      vialAmount: 5,
      vialUnit: 'mg',
      diluentVolume: 2,
    })
    expect(r.concentration).toBe(2.5)
    expect(r.volumePerDose).toBeUndefined()
    expect(r.totalDoses).toBeUndefined()
  })

  it('returns step-by-step math used by the UI', () => {
    const r = calculateReconstitution({
      vialAmount: 10,
      vialUnit: 'mg',
      diluentVolume: 2,
      targetDose: 250,
      targetUnit: 'mcg',
    })
    // Concentration step + unit conversion + volume + total doses = 4 steps
    expect(r.steps.length).toBe(4)
    expect(r.steps[0].description).toMatch(/concentration/i)
    expect(r.steps[r.steps.length - 1].description).toMatch(/total doses/i)
  })
})

describe('mlToUnits / unitsToMl (insulin syringe conversion)', () => {
  it('100 insulin units = 1 mL', () => {
    expect(mlToUnits(1)).toBe(100)
    expect(unitsToMl(100)).toBe(1)
  })
  it('round-trips typical draw volumes', () => {
    expect(unitsToMl(mlToUnits(0.15))).toBeCloseTo(0.15, 6)
    expect(unitsToMl(mlToUnits(0.05))).toBeCloseTo(0.05, 6)
  })
})

describe('formatVolume', () => {
  it('uses mL for volumes ≥ 0.01 mL', () => {
    expect(formatVolume(0.05)).toBe('0.050 ml')
    expect(formatVolume(1)).toBe('1.000 ml')
  })
  it('switches to µL for sub-0.01 mL', () => {
    expect(formatVolume(0.005)).toBe('5.00 µl')
  })
})
