import { describe, it, expect } from 'vitest'
import {
  COMPOUNDED_MG_TAURATE_NAME,
  inferCompoundName,
  normalizeScannedPeptideName,
  namesAppearInRawText,
  normalizeVialScanResult,
  parseScanJson,
  scanKey,
} from '../vial-scan'

describe('normalizeScannedPeptideName', () => {
  it('maps vendor abbreviations of MOTS-c to the canonical name', () => {
    for (const spelling of ['MOTC', 'motc', 'MOTS-C', 'MOTSc', 'MOTS c', 'MOT-C']) {
      expect(normalizeScannedPeptideName(spelling)).toBe('MOTS-c')
    }
  })

  it('recognises blends and compounded products', () => {
    expect(normalizeScannedPeptideName('KLOW')).toBe('KLOW')
    expect(normalizeScannedPeptideName('klow blend')).toBe('KLOW')
    expect(normalizeScannedPeptideName('Glow Peptide Blend')).toBe('GLOW')
    expect(normalizeScannedPeptideName('Magnesium Taurate / B6 / Glycine')).toBe(COMPOUNDED_MG_TAURATE_NAME)
  })

  it('returns null for unknown names so callers keep the label text', () => {
    expect(normalizeScannedPeptideName('Some New Thing')).toBeNull()
    expect(normalizeScannedPeptideName(null)).toBeNull()
    expect(normalizeScannedPeptideName('   ')).toBeNull()
  })

  it('scanKey strips case and punctuation', () => {
    expect(scanKey('B.P.C - 157 ')).toBe('bpc157')
  })
})

describe('inferCompoundName', () => {
  it('names the compounded magnesium taurate vial from its ingredients', () => {
    const name = inferCompoundName([
      { name: 'Magnesium Taurate', amount: 25, unit: 'mg/mL' },
      { name: 'Pyridoxine HCl', amount: 25, unit: 'mg/mL' },
      { name: 'Glycine', amount: 5, unit: 'mg/mL' },
    ])
    expect(name).toBe(COMPOUNDED_MG_TAURATE_NAME)
  })

  it('prefers KLOW over GLOW when KPV is present', () => {
    const glow = [
      { name: 'GHK-Cu', amount: 50, unit: 'mg' },
      { name: 'BPC-157', amount: 10, unit: 'mg' },
      { name: 'TB-500', amount: 10, unit: 'mg' },
    ]
    expect(inferCompoundName(glow)).toBe('GLOW')
    expect(inferCompoundName([{ name: 'KPV', amount: 10, unit: 'mg' }, ...glow])).toBe('KLOW')
  })

  it('joins unknown multi-ingredient labels and ignores single ingredients', () => {
    expect(inferCompoundName([{ name: 'Glutathione', amount: 200, unit: 'mg/mL' }, { name: 'Vitamin C', amount: 500, unit: 'mg/mL' }]))
      .toBe('Glutathione + Vitamin C')
    expect(inferCompoundName([{ name: 'BPC-157', amount: 10, unit: 'mg' }])).toBeNull()
  })
})

describe('normalizeVialScanResult', () => {
  it('handles a single dry peptide vial unchanged', () => {
    const result = normalizeVialScanResult({
      peptideName: 'BPC 157',
      amount: 10,
      unit: 'mg',
      manufacturer: 'Acme',
      lotNumber: 'L123',
      expirationDate: '2027-01-01',
      confidence: 'high',
      rawText: 'BPC 157 10mg',
    })
    expect(result.peptideName).toBe('BPC-157')
    expect(result.amount).toBe(10)
    expect(result.unit).toBe('mg')
    expect(result.ingredients).toEqual([])
    expect(result.isPreMixed).toBe(false)
    expect(result.confidence).toBe('high')
  })

  it('derives total amount and canonical name for a pre-mixed compounded vial', () => {
    const result = normalizeVialScanResult({
      productName: null,
      peptideName: 'Magnesium Taurate',
      ingredients: [
        { name: 'Magnesium Taurate', amount: '25', unit: 'mg/mL' },
        { name: 'Vitamin B6', amount: 25, unit: 'mg/mL' },
        { name: 'Glycine', amount: 5, unit: 'mg/mL' },
      ],
      volumeMl: 2,
      amount: null,
      unit: 'mg/mL',
      confidence: 'medium',
    })
    expect(result.peptideName).toBe(COMPOUNDED_MG_TAURATE_NAME)
    expect(result.isPreMixed).toBe(true)
    expect(result.volumeMl).toBe(2)
    expect(result.amount).toBe(50)
    expect(result.unit).toBe('mg')
    expect(result.ingredients).toHaveLength(3)
    expect(result.ingredients[0]).toEqual({ name: 'Magnesium Taurate', amount: 25, unit: 'mg/mL' })
  })

  it('canonicalises MOTC labels', () => {
    const result = normalizeVialScanResult({ peptideName: 'MOTC', amount: 10, unit: 'mg', confidence: 0.9 })
    expect(result.peptideName).toBe('MOTS-c')
    expect(result.productName).toBe('MOTC')
    expect(result.confidence).toBe('high')
  })

  it('keeps the printed name for a blend and lists its components', () => {
    const result = normalizeVialScanResult({
      productName: 'KLOW Blend',
      ingredients: [
        { name: 'KPV', amount: 10, unit: 'mg' },
        { name: 'GHK-Cu', amount: 50, unit: 'mg' },
        { name: 'BPC-157', amount: 10, unit: 'mg' },
        { name: 'TB-500', amount: 10, unit: 'mg' },
      ],
      amount: 80,
      unit: 'mg',
    })
    expect(result.peptideName).toBe('KLOW')
    expect(result.amount).toBe(80)
    expect(result.isPreMixed).toBe(false)
  })

  it('degrades to a low-confidence empty result for garbage', () => {
    expect(normalizeVialScanResult(null).confidence).toBe('low')
    expect(normalizeVialScanResult('nope').peptideName).toBeNull()
    expect(normalizeVialScanResult({ confidence: 'sure' }).confidence).toBe('low')
  })
})

describe('parseScanJson', () => {
  it('strips markdown fences', () => {
    expect(parseScanJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('returns null on invalid JSON', () => {
    expect(parseScanJson('not json')).toBeNull()
  })
})

describe('rawText sanity check', () => {
  it('drops confidence when a reported name is absent from the label text', () => {
    const result = normalizeVialScanResult({
      productName: 'Tirzepatide',
      ingredients: [{ name: 'Tirzepatide', amount: 25, unit: 'mg/mL' }],
      volumeMl: 2,
      confidence: 'high',
      rawText: 'Magnesium Taurate 25mg/mL Pyridoxine 25mg/mL Glycine 5mg/mL 2mL',
    })
    expect(result.confidence).toBe('low')
  })

  it('keeps confidence when names are on the label', () => {
    expect(namesAppearInRawText(['Magnesium Taurate', 'Vitamin B6'], 'MAGNESIUM TAURATE 25 MG/ML VITAMIN B6 25 MG/ML')).toBe(true)
    expect(namesAppearInRawText(['BPC-157'], 'BPC 157 10mg lyophilized')).toBe(true)
  })
})
