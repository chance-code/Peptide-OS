import { describe, it, expect } from 'vitest'
import { parseHHLabsDocument, parseHHLabsPDF } from '../hh-labs-parser'
import { detectLabSource, routeLabPDF } from '../lab-parser-router'

// ─── Test Fixtures ──────────────────────────────────────────────────────────

/**
 * Real H&H Labs PDF text extraction output from unpdf.
 * Single spaces between columns (not double spaces or tabs).
 * Copied from actual `extractTextFromPDF()` output.
 */
const HH_LABS_TEXT = `Ordered Items
Testosterone Eligibility Panel - Chem/Immuno
Specimen ID: 41C038EEBDBC Specimen Type: SERUM
Test Name Result Unit Flag Reference Range
Albumin 4.6 g/dL 3.97 - 4.94
Estradiol < 25 pg/mL 11.3 - 43.2
Follicle Stimulating Hormone 3.010 mIU/mL 1.5 - 12.4
Free Testosterone 7.24 ng/dL 5 - 21
Luteinizing Hormone 1.8 mIU/mL 1.7 - 8.6
SHBG 34.7 nmol/L 16.5 - 55.9
Total PSA 0.428 ng/mL 0 - 4
Total Testosterone 381.00 ng/dL 249.00 - 836.00
Testosterone Eligibility Panel - Hematology
Specimen ID: 49254D7FE918 Specimen Type: WHOLE_BLOOD
Test Name Result Unit Flag Reference Range
Hematocrit 49.4 % 39.9 - 51
The Hematocrit (HCT) test measured by the Sysmex XN-1000 Automated Hematology Analyzer is an indirectly calculated parameter based
on red blood cell count (RBC) and mean corpuscular volume (MCV). The Sysmex XN 1000 uses automated impedance and flow cytometry
technology to provide consistent and standardized hematological results. While this method ensures efficiency and reproducibility,
hematocrit values may be influenced by sample quality, high leukocyte counts, cold agglutinins, or abnormal cell morphology. Results
should always be interpreted in the context of clinical presentation and, if necessary, verified by manual methods. This test is categorized
as moderate complexity under CLIA regulations.
This collection kit was developed and its performance characteristics determined by H&H Labs. It has not been cleared or approved by the
Food and Drug Administration.
Ron Gambardella PhD
CLIA # 31D2261577
67 Walnut Ave Suite 403 Clark, NJ 07066 Phone Number: 848.202.7221
Patient Details Specimen Details Physician Details
Name: Chance Olson
DOB: 12/19/1982
Gender: M
Date Collected: 10/08/2025 07:20 AM
Date Received: 10/09/2025 12:57 PM
Date Reported: 10/09/2025 06:17 PM
Facility: H&H
Ordering Provider: Folake Osibanjo
NPI: 1144651894
FINAL REPORT
2025 H&H – The information contained in this document is private and confidential health information protected by
state and federal law. If you have received this document in error, please call 848.202.7221
Printed: 10/09/2025 05:15 PM Page 1 of 1`

/**
 * Function Health / Quest Diagnostics style text (existing format).
 */
const QUEST_TEXT = `
Printed from Health Gorilla
Function Health

PATIENT INFORMATION
DOB: 01/15/1990
Gender: Male

Collection Date: 12/04/2025 01:58 PM

IRON, TOTAL 176 50-180 mcg/dL KS
CHOLESTEROL, TOTAL 169 <200 mg/dL KS
HDL CHOLESTEROL 50 > OR = 40 mg/dL KS
LDL CHOLESTEROL 101 H mg/dL KS
TRIGLYCERIDES 90 <150 mg/dL KS
`

/**
 * Ambiguous text with no strong signals.
 */
const AMBIGUOUS_TEXT = `
Lab Report
Date: 01/15/2025

Glucose  95  mg/dL  70 - 100
Creatinine  1.1  mg/dL  0.6 - 1.3
`

// ─── Source Detection Tests ─────────────────────────────────────────────────

describe('detectLabSource', () => {
  it('detects H&H Labs from strong signals', () => {
    const result = detectLabSource(HH_LABS_TEXT)
    expect(result.source).toBe('hh_labs')
    expect(result.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('detects Function Health / Quest from strong signals', () => {
    const result = detectLabSource(QUEST_TEXT)
    expect(result.source).toBe('function_health')
    expect(result.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('defaults to function_health for ambiguous text', () => {
    const result = detectLabSource(AMBIGUOUS_TEXT)
    expect(result.source).toBe('function_health')
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('scores H&H signals: Specimen ID, Specimen Type, Panel headers', () => {
    const text = 'Specimen ID: ABC123\nSpecimen Type: SERUM\nPanel - Chem/Immuno'
    const result = detectLabSource(text)
    expect(result.source).toBe('hh_labs')
  })

  it('scores Quest signals: Health Gorilla, Accession, lab codes', () => {
    const text = 'Printed from Health Gorilla\nQuest Diagnostics\nAccession\nIRON 100 50-180 mcg/dL KS'
    const result = detectLabSource(text)
    expect(result.source).toBe('function_health')
  })
})

// ─── H&H Labs Parser Tests ─────────────────────────────────────────────────

describe('parseHHLabsDocument', () => {
  it('extracts patient info', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.patient.name).toBe('Chance Olson')
    expect(doc.patient.dob).toBe('12/19/1982')
    expect(doc.patient.gender).toBe('M')
  })

  it('extracts collection date (lab date, not upload date)', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.collectedAt).toBeInstanceOf(Date)
    expect(doc.collectedAt!.getMonth()).toBe(9) // October = 9
    expect(doc.collectedAt!.getDate()).toBe(8)
    expect(doc.collectedAt!.getFullYear()).toBe(2025)
  })

  it('extracts report date', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.reportedAt).toBeInstanceOf(Date)
  })

  it('sets source to hh_labs', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.source).toBe('hh_labs')
  })

  it('parses two panels', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.panels).toHaveLength(2)
    expect(doc.panels[0].name).toContain('Chem/Immuno')
    expect(doc.panels[1].name).toContain('Hematology')
  })

  it('parses specimen metadata', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.panels[0].specimenId).toBe('41C038EEBDBC')
    expect(doc.panels[0].specimenType).toBe('SERUM')
    expect(doc.panels[1].specimenId).toBe('49254D7FE918')
    expect(doc.panels[1].specimenType).toBe('WHOLE_BLOOD')
  })

  it('parses 8 tests from Chem/Immuno panel', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.panels[0].tests.length).toBe(8)
  })

  it('parses 1 test from Hematology panel', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.panels[1].tests.length).toBe(1)
  })

  it('parses standard numeric result (Total Testosterone)', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    const tt = doc.panels[0].tests.find(t => t.name === 'Total Testosterone')
    expect(tt).toBeDefined()
    expect(tt!.resultRaw).toBe('381.00')
    expect(tt!.resultNumeric).toBe(381)
    expect(tt!.unit).toBe('ng/dL')
    expect(tt!.referenceLow).toBe(249)
    expect(tt!.referenceHigh).toBe(836)
  })

  it('parses below-detection result (Estradiol < 25)', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    const est = doc.panels[0].tests.find(t => t.name === 'Estradiol')
    expect(est).toBeDefined()
    expect(est!.resultRaw).toBe('< 25')
    expect(est!.resultOperator).toBe('<')
    expect(est!.resultNumeric).toBe(25)
    expect(est!.referenceLow).toBe(11.3)
    expect(est!.referenceHigh).toBe(43.2)
  })

  it('parses Albumin with reference range', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    const alb = doc.panels[0].tests.find(t => t.name === 'Albumin')
    expect(alb).toBeDefined()
    expect(alb!.resultNumeric).toBe(4.6)
    expect(alb!.unit).toBe('g/dL')
    expect(alb!.referenceLow).toBe(3.97)
    expect(alb!.referenceHigh).toBe(4.94)
  })

  it('parses Hematocrit', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    const hct = doc.panels[1].tests.find(t => t.name === 'Hematocrit')
    expect(hct).toBeDefined()
    expect(hct!.resultNumeric).toBe(49.4)
    expect(hct!.unit).toBe('%')
    expect(hct!.referenceLow).toBe(39.9)
    expect(hct!.referenceHigh).toBe(51)
  })

  it('parses Follicle Stimulating Hormone (multi-word name)', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    const fsh = doc.panels[0].tests.find(t => t.name === 'Follicle Stimulating Hormone')
    expect(fsh).toBeDefined()
    expect(fsh!.resultNumeric).toBe(3.01)
    expect(fsh!.unit).toBe('mIU/mL')
    expect(fsh!.referenceLow).toBe(1.5)
    expect(fsh!.referenceHigh).toBe(12.4)
  })

  it('preserves raw text on document', () => {
    const doc = parseHHLabsDocument(HH_LABS_TEXT)
    expect(doc.rawText).toBe(HH_LABS_TEXT)
  })
})

// ─── ParseResult Conversion Tests ───────────────────────────────────────────

describe('parseHHLabsPDF → ParseResult', () => {
  it('returns a valid ParseResult', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    expect(result.markers).toBeDefined()
    expect(result.markers.length).toBeGreaterThan(0)
    expect(result.parseWarnings).toBeDefined()
    expect(result.overallConfidence).toBeGreaterThan(0)
  })

  it('uses collection date as testDate', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    expect(result.testDate).toBeInstanceOf(Date)
    expect(result.testDate!.getMonth()).toBe(9) // October
    expect(result.testDate!.getFullYear()).toBe(2025)
  })

  it('sets labName to H&H Labs', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    expect(result.labName).toBe('H&H Labs')
  })

  it('normalizes known biomarkers', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    const tt = result.markers.find(m => m.normalizedKey === 'total_testosterone')
    expect(tt).toBeDefined()
    expect(tt!.value).toBe(381)
    expect(tt!.displayName).toBe('Total Testosterone')
  })

  it('handles below-detection estradiol', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    const est = result.markers.find(m =>
      m.rawName.toLowerCase().includes('estradiol')
    )
    expect(est).toBeDefined()
    expect(est!.value).toBe(25)
    // Below-detection reduces confidence
    expect(est!.confidence).toBeLessThan(0.9)
  })

  it('flattens panels into single markers array', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    // Should include markers from both panels
    const hct = result.markers.find(m =>
      m.rawName.toLowerCase().includes('hematocrit')
    )
    expect(hct).toBeDefined()
  })

  it('includes overall confidence score', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    expect(result.overallConfidence).toBeGreaterThan(0)
    expect(result.overallConfidence).toBeLessThanOrEqual(1)
  })
})

// ─── Router Tests ───────────────────────────────────────────────────────────

describe('routeLabPDF', () => {
  it('routes H&H text to H&H parser', () => {
    const result = routeLabPDF(HH_LABS_TEXT)
    expect(result.labName).toBe('H&H Labs')
    expect(result.markers.length).toBeGreaterThan(0)
  })

  it('routes Quest/FH text to Quest parser', () => {
    const result = routeLabPDF(QUEST_TEXT)
    // Quest parser returns "Quest Diagnostics (Function Health)" or similar
    expect(result.labName).toContain('Function Health')
  })

  it('preserves Function Health parsing behavior for existing PDFs', () => {
    const result = routeLabPDF(QUEST_TEXT)
    // Should find iron, cholesterol, etc.
    const iron = result.markers.find(m =>
      m.rawName.toLowerCase().includes('iron')
    )
    expect(iron).toBeDefined()
  })

  it('routes ambiguous text to Quest parser (backward compat default)', () => {
    const result = routeLabPDF(AMBIGUOUS_TEXT)
    // Should fall through to Quest parser, which is the existing default
    expect(result).toBeDefined()
    expect(result.markers).toBeDefined()
  })
})

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty text', () => {
    const doc = parseHHLabsDocument('')
    expect(doc.panels).toHaveLength(0)
    expect(doc.source).toBe('hh_labs')
  })

  it('handles text with panel headers but no results', () => {
    const text = `
Testosterone Eligibility Panel - Chem/Immuno
Specimen ID: ABC123  Specimen Type: SERUM
Test Name  Result  Unit  Flag  Reference Range
FINAL REPORT
`
    const doc = parseHHLabsDocument(text)
    expect(doc.panels).toHaveLength(0)
  })

  it('handles single panel document', () => {
    const text = `H&H Labs
Name: Test Patient
Date Collected: 01/15/2025
Basic Panel - Hematology
Specimen ID: ABC123 Specimen Type: WHOLE_BLOOD
Test Name Result Unit Flag Reference Range
Hematocrit 45.0 % 38.5 - 50.0`
    const doc = parseHHLabsDocument(text)
    expect(doc.panels).toHaveLength(1)
    expect(doc.panels[0].tests).toHaveLength(1)
    expect(doc.patient.name).toBe('Test Patient')
  })

  it('does not duplicate tests with same name across panels', () => {
    const result = parseHHLabsPDF(HH_LABS_TEXT)
    const names = result.markers.map(m => m.rawName)
    const uniqueNames = new Set(names)
    // Each raw name should be unique (deduplication in labDocumentToParseResult)
    expect(names.length).toBe(uniqueNames.size)
  })
})
