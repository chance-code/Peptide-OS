import { describe, it, expect } from 'vitest'
import {
  getExpectedMarkersForProtocol,
  scoreProtocolEffectiveness,
  type ProtocolLabEffectiveness,
} from '../lab-protocol-effectiveness'
import { generateAttributionEntries } from '../lab-evidence-ledger'
import { type MarkerDelta, BioDomain } from '../lab-domains'
import type { BiomarkerFlag } from '@/lib/lab-biomarker-contract'

// ─── Test Helpers ──────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function makeProtocol(overrides: Partial<{
  id: string
  name: string
  type: string
  startDate: Date
  adherencePercent: number
}> = {}) {
  return {
    id: overrides.id ?? 'test-protocol-1',
    name: overrides.name ?? 'Enclomiphene Citrate',
    type: overrides.type ?? 'peptide',
    startDate: overrides.startDate ?? daysAgo(120),
    adherencePercent: overrides.adherencePercent ?? 85,
  }
}

function makeDelta(overrides: Partial<MarkerDelta>): MarkerDelta {
  return {
    biomarkerKey: overrides.biomarkerKey ?? 'total_testosterone',
    displayName: overrides.displayName ?? 'Total Testosterone',
    currentValue: overrides.currentValue ?? 650,
    previousValue: overrides.previousValue ?? 381,
    unit: overrides.unit ?? 'ng/dL',
    absoluteDelta: overrides.absoluteDelta ?? 269,
    percentDelta: overrides.percentDelta ?? 70.6,
    currentFlag: overrides.currentFlag ?? 'normal',
    previousFlag: overrides.previousFlag ?? 'normal',
    flagTransition: overrides.flagTransition ?? 'improved',
    velocityPerMonth: overrides.velocityPerMonth ?? 67.25,
    isSignificant: overrides.isSignificant ?? true,
    domain: overrides.domain ?? BioDomain.HORMONES,
  }
}

function makeBiomarkerMap(
  entries: Array<[string, { value: number; flag: BiomarkerFlag }]>
): Map<string, { value: number; flag: BiomarkerFlag }> {
  return new Map(entries)
}

// ─── getExpectedMarkersForProtocol ─────────────────────────────────────────

describe('getExpectedMarkersForProtocol', () => {
  it('returns expected markers for Enclomiphene Citrate', () => {
    const markers = getExpectedMarkersForProtocol('Enclomiphene Citrate')
    const keys = markers.map(m => m.biomarkerKey)
    expect(keys).toContain('total_testosterone')
    expect(keys).toContain('free_testosterone')
    expect(keys).toContain('lh')
    expect(keys).toContain('fsh')
    expect(markers.length).toBe(4)
    // All should be 'increase' for enclomiphene
    for (const marker of markers) {
      expect(marker.expectedDirection).toBe('increase')
    }
  })

  it('returns expected markers for Vitamin D3 5000 IU', () => {
    const markers = getExpectedMarkersForProtocol('Vitamin D3 5000 IU')
    const keys = markers.map(m => m.biomarkerKey)
    expect(keys).toContain('vitamin_d')
    expect(markers.length).toBe(1)
    expect(markers[0].expectedDirection).toBe('increase')
  })

  it('returns expected markers for Fish Oil EPA/DHA', () => {
    const markers = getExpectedMarkersForProtocol('Fish Oil EPA/DHA')
    const keys = markers.map(m => m.biomarkerKey)
    expect(keys).toContain('triglycerides')
    expect(keys).toContain('hs_crp')
    expect(keys).toContain('omega_3_index')
    expect(markers.length).toBe(3)
  })

  it('returns empty array for unknown supplement', () => {
    const markers = getExpectedMarkersForProtocol('Some Unknown Supplement')
    expect(markers).toEqual([])
  })

  it('returns expected markers for Testosterone Cypionate', () => {
    const markers = getExpectedMarkersForProtocol('Testosterone Cypionate')
    const keys = markers.map(m => m.biomarkerKey)
    expect(keys).toContain('total_testosterone')
    expect(keys).toContain('free_testosterone')
    expect(keys).toContain('hematocrit')
    expect(keys).toContain('hemoglobin')
    expect(keys).toContain('lh')
    expect(keys).toContain('fsh')
    expect(keys).toContain('estradiol')
  })

  it('matches case-insensitively (ENCLOMIPHENE)', () => {
    const markers = getExpectedMarkersForProtocol('ENCLOMIPHENE')
    const keys = markers.map(m => m.biomarkerKey)
    expect(keys).toContain('total_testosterone')
    expect(keys).toContain('free_testosterone')
    expect(keys).toContain('lh')
    expect(keys).toContain('fsh')
  })

  it('matches partial names via includes (e.g. "Vitamin D" in "Vitamin D3 5000 IU")', () => {
    // "Vitamin D3 5000 IU".toLowerCase() includes "vitamin d3" which is in the map
    const markers = getExpectedMarkersForProtocol('Vitamin D3 5000 IU')
    expect(markers.length).toBeGreaterThan(0)
    expect(markers[0].biomarkerKey).toBe('vitamin_d')
  })

  it('returns markers for Berberine', () => {
    const markers = getExpectedMarkersForProtocol('Berberine 500mg')
    const keys = markers.map(m => m.biomarkerKey)
    expect(keys).toContain('hba1c')
    expect(keys).toContain('fasting_glucose')
    expect(keys).toContain('ldl_cholesterol')
  })
})

// ─── scoreProtocolEffectiveness ────────────────────────────────────────────

describe('scoreProtocolEffectiveness', () => {
  it('returns "working" verdict when matched markers move in expected direction', () => {
    const protocol = makeProtocol({
      name: 'Vitamin D3 5000 IU',
      startDate: daysAgo(120),
      adherencePercent: 85,
    })
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 62,
        previousValue: 28,
        unit: 'ng/mL',
        absoluteDelta: 34,
        percentDelta: 121.4,
        currentFlag: 'optimal',
        previousFlag: 'low',
        flagTransition: 'improved',
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['vitamin_d', { value: 62, flag: 'optimal' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('working')
    expect(result.targetMarkers.length).toBe(1)
    expect(result.targetMarkers[0].effectMatch).toBe('matched')
    expect(result.recommendation).toBe('continue')
  })

  it('returns "possible_adverse" when markers move opposite to expected direction', () => {
    const protocol = makeProtocol({
      name: 'Vitamin D3 5000 IU',
      startDate: daysAgo(90),
      adherencePercent: 85,
    })
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 22,
        previousValue: 35,
        unit: 'ng/mL',
        absoluteDelta: -13,
        percentDelta: -37.1,
        currentFlag: 'low',
        previousFlag: 'normal',
        flagTransition: 'worsened',
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['vitamin_d', { value: 22, flag: 'low' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('possible_adverse')
    expect(result.targetMarkers[0].effectMatch).toBe('opposite')
    expect(result.recommendation).toBe('discuss_with_clinician')
  })

  it('returns "unclear" verdict when no delta data is available', () => {
    const protocol = makeProtocol({
      name: 'Vitamin D3 5000 IU',
      startDate: daysAgo(120),
      adherencePercent: 85,
    })
    // No deltas provided
    const deltas: MarkerDelta[] = []
    const biomarkers = makeBiomarkerMap([])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('unclear')
    expect(result.labVerdictConfidence).toBe('low')
    expect(result.targetMarkers.length).toBe(0)
  })

  it('returns "early_signal" when positive movement but less than 60 days', () => {
    const protocol = makeProtocol({
      name: 'Vitamin D3 5000 IU',
      startDate: daysAgo(30),
      adherencePercent: 85,
    })
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 42,
        previousValue: 28,
        unit: 'ng/mL',
        absoluteDelta: 14,
        percentDelta: 50,
        currentFlag: 'normal',
        previousFlag: 'low',
        flagTransition: 'improved',
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['vitamin_d', { value: 42, flag: 'normal' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('early_signal')
    expect(result.labVerdictConfidence).toBe('low')
    expect(result.daysOnProtocol).toBeLessThan(60)
    expect(result.nextCheckpoint).toContain('60')
  })

  it('returns "unclear" verdict when adherence is low', () => {
    const protocol = makeProtocol({
      name: 'Vitamin D3 5000 IU',
      startDate: daysAgo(120),
      adherencePercent: 25,
    })
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 30,
        previousValue: 28,
        unit: 'ng/mL',
        absoluteDelta: 2,
        percentDelta: 7.1,
        currentFlag: 'normal',
        previousFlag: 'low',
        flagTransition: 'improved',
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['vitamin_d', { value: 30, flag: 'normal' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    // matchCount=1 but adherence < 70, so falls through to "unclear" at the end
    expect(result.labVerdict).toBe('unclear')
    expect(result.labVerdictExplanation).toContain('Adherence')
  })

  it('returns "unclear" when no target markers are in the lab panel', () => {
    const protocol = makeProtocol({
      name: 'Fish Oil EPA/DHA',
      startDate: daysAgo(120),
      adherencePercent: 90,
    })
    // Provide deltas for markers NOT in the fish oil expected list
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'total_testosterone',
        displayName: 'Total Testosterone',
        currentValue: 500,
        previousValue: 450,
        absoluteDelta: 50,
        percentDelta: 11.1,
        domain: BioDomain.HORMONES,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['total_testosterone', { value: 500, flag: 'normal' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('unclear')
    expect(result.labVerdictExplanation).toContain('Target markers were not included')
  })

  it('computes correct daysOnProtocol', () => {
    const protocol = makeProtocol({ startDate: daysAgo(90) })
    const result = scoreProtocolEffectiveness(protocol, [], makeBiomarkerMap([]))
    // Should be approximately 90 (might be off by 1 due to time-of-day)
    expect(result.daysOnProtocol).toBeGreaterThanOrEqual(89)
    expect(result.daysOnProtocol).toBeLessThanOrEqual(91)
  })

  it('sets adherenceNote based on adherence level', () => {
    const highAdherence = scoreProtocolEffectiveness(
      makeProtocol({ adherencePercent: 90 }),
      [],
      makeBiomarkerMap([])
    )
    expect(highAdherence.adherenceNote).toContain('sufficient')

    const midAdherence = scoreProtocolEffectiveness(
      makeProtocol({ adherencePercent: 60 }),
      [],
      makeBiomarkerMap([])
    )
    expect(midAdherence.adherenceNote).toContain('moderate')

    const lowAdherence = scoreProtocolEffectiveness(
      makeProtocol({ adherencePercent: 30 }),
      [],
      makeBiomarkerMap([])
    )
    expect(lowAdherence.adherenceNote).toContain('low adherence')
  })

  it('returns "not_working" when sufficient time and adherence but no effect', () => {
    const protocol = makeProtocol({
      name: 'Vitamin D3 5000 IU',
      startDate: daysAgo(120),
      adherencePercent: 85,
    })
    // For "no_effect" classification: actualDirection must differ from expected AND
    // change must be < 5% (not significant). Since vitamin_d expectedDirection is 'increase',
    // we need a slight decrease (directionMatch=false, significantChange=false → no_effect).
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 27,
        previousValue: 28,
        unit: 'ng/mL',
        absoluteDelta: -1,
        percentDelta: -3.6,
        currentFlag: 'low',
        previousFlag: 'low',
        flagTransition: 'unchanged',
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['vitamin_d', { value: 27, flag: 'low' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('not_working')
    expect(result.recommendation).toBe('pause')
  })

  it('returns high confidence when multiple markers match with high adherence and long duration', () => {
    const protocol = makeProtocol({
      name: 'Fish Oil EPA/DHA',
      startDate: daysAgo(120),
      adherencePercent: 90,
    })
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'triglycerides',
        displayName: 'Triglycerides',
        currentValue: 110,
        previousValue: 180,
        unit: 'mg/dL',
        absoluteDelta: -70,
        percentDelta: -38.9,
        currentFlag: 'normal',
        previousFlag: 'high',
        flagTransition: 'improved',
        domain: BioDomain.LIPIDS,
      }),
      makeDelta({
        biomarkerKey: 'hs_crp',
        displayName: 'hs-CRP',
        currentValue: 0.5,
        previousValue: 2.1,
        unit: 'mg/L',
        absoluteDelta: -1.6,
        percentDelta: -76.2,
        currentFlag: 'optimal',
        previousFlag: 'high',
        flagTransition: 'improved',
        domain: BioDomain.INFLAMMATION,
      }),
      makeDelta({
        biomarkerKey: 'omega_3_index',
        displayName: 'Omega-3 Index',
        currentValue: 8.2,
        previousValue: 4.1,
        unit: '%',
        absoluteDelta: 4.1,
        percentDelta: 100,
        currentFlag: 'optimal',
        previousFlag: 'low',
        flagTransition: 'improved',
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const biomarkers = makeBiomarkerMap([
      ['triglycerides', { value: 110, flag: 'normal' }],
      ['hs_crp', { value: 0.5, flag: 'optimal' }],
      ['omega_3_index', { value: 8.2, flag: 'optimal' }],
    ])

    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdict).toBe('working')
    expect(result.labVerdictConfidence).toBe('high')
    expect(result.targetMarkers.length).toBe(3)
    expect(result.targetMarkers.every(m => m.effectMatch === 'matched')).toBe(true)
  })
})

// ─── generateAttributionEntries ────────────────────────────────────────────

describe('generateAttributionEntries', () => {
  const labEventId = 'lab-event-123'
  const labDate = '2025-10-09'
  const previousLabDate = '2025-06-15'

  it('produces attribution entries for protocols with expected markers and significant deltas', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'total_testosterone',
        displayName: 'Total Testosterone',
        currentValue: 650,
        previousValue: 381,
        absoluteDelta: 269,
        percentDelta: 70.6,
        isSignificant: true,
        domain: BioDomain.HORMONES,
      }),
    ]
    const protocols = [
      {
        id: 'proto-1',
        name: 'Enclomiphene Citrate',
        type: 'peptide',
        adherencePercent: 85,
        daysOnProtocol: 120,
        startDate: '2025-06-10',
        expectedMarkers: ['total_testosterone', 'free_testosterone', 'lh', 'fsh'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(1)
    expect(entries[0].claimType).toBe('attribution')
    expect(entries[0].claim).toContain('Total Testosterone')
    expect(entries[0].claim).toContain('Enclomiphene Citrate')
    expect(entries[0].evidence.protocols[0].protocolId).toBe('proto-1')
  })

  it('filters out protocols with fewer than 30 days on protocol', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 55,
        previousValue: 25,
        absoluteDelta: 30,
        percentDelta: 120,
        isSignificant: true,
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const protocols = [
      {
        id: 'proto-short',
        name: 'Vitamin D3',
        type: 'supplement',
        adherencePercent: 90,
        daysOnProtocol: 15, // Too short
        startDate: '2025-09-24',
        expectedMarkers: ['vitamin_d'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(0)
  })

  it('filters out protocols with fewer than 30% adherence', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        currentValue: 55,
        previousValue: 25,
        absoluteDelta: 30,
        percentDelta: 120,
        isSignificant: true,
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const protocols = [
      {
        id: 'proto-low-adherence',
        name: 'Vitamin D3',
        type: 'supplement',
        adherencePercent: 20, // Too low
        daysOnProtocol: 120,
        startDate: '2025-06-10',
        expectedMarkers: ['vitamin_d'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(0)
  })

  it('produces no entries when protocol has no expected markers matching deltas', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'total_testosterone',
        isSignificant: true,
      }),
    ]
    const protocols = [
      {
        id: 'proto-no-match',
        name: 'Fish Oil',
        type: 'supplement',
        adherencePercent: 90,
        daysOnProtocol: 120,
        startDate: '2025-06-10',
        expectedMarkers: ['triglycerides', 'hs_crp', 'omega_3_index'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(0)
  })

  it('assigns "high" confidence when adherence >= 80%, duration >= 90 days, delta >= 15%', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'total_testosterone',
        percentDelta: 70.6,
        isSignificant: true,
      }),
    ]
    const protocols = [
      {
        id: 'proto-high',
        name: 'Enclomiphene',
        type: 'peptide',
        adherencePercent: 85,
        daysOnProtocol: 120,
        startDate: '2025-06-10',
        expectedMarkers: ['total_testosterone'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(1)
    expect(entries[0].confidence).toBe('high')
  })

  it('assigns "medium" confidence for moderate adherence and duration', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'total_testosterone',
        percentDelta: 10,
        isSignificant: true,
      }),
    ]
    const protocols = [
      {
        id: 'proto-med',
        name: 'Enclomiphene',
        type: 'peptide',
        adherencePercent: 75,
        daysOnProtocol: 70,
        startDate: '2025-08-01',
        expectedMarkers: ['total_testosterone'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(1)
    expect(entries[0].confidence).toBe('medium')
  })

  it('assigns "low" confidence for lower adherence and shorter duration', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'total_testosterone',
        percentDelta: 10,
        isSignificant: true,
      }),
    ]
    const protocols = [
      {
        id: 'proto-low',
        name: 'Enclomiphene',
        type: 'peptide',
        adherencePercent: 55,
        daysOnProtocol: 40,
        startDate: '2025-09-01',
        expectedMarkers: ['total_testosterone'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(1)
    expect(entries[0].confidence).toBe('low')
  })

  it('adds confound notes for low adherence and short duration', () => {
    const deltas: MarkerDelta[] = [
      makeDelta({
        biomarkerKey: 'vitamin_d',
        displayName: 'Vitamin D',
        percentDelta: 50,
        isSignificant: true,
        domain: BioDomain.NUTRIENTS,
      }),
    ]
    const protocols = [
      {
        id: 'proto-confounds',
        name: 'Vitamin D3',
        type: 'supplement',
        adherencePercent: 50, // < 70 → confound
        daysOnProtocol: 45, // < 60 → confound
        startDate: '2025-08-25',
        expectedMarkers: ['vitamin_d'],
      },
    ]

    const entries = generateAttributionEntries(labEventId, deltas, protocols, labDate, previousLabDate)
    expect(entries.length).toBe(1)
    expect(entries[0].confounds).toContain('Low adherence may limit observed effect')
    expect(entries[0].confounds).toContain('Short time on protocol — effect may not be fully realized')
  })
})

// ─── Integration Scenario: Enclomiphene → Testosterone ─────────────────────

describe('integration: Enclomiphene → Testosterone', () => {
  const protocol = makeProtocol({
    id: 'enclomiphene-001',
    name: 'Enclomiphene Citrate',
    type: 'peptide',
    startDate: daysAgo(120),
    adherencePercent: 85,
  })

  const totalTDelta = makeDelta({
    biomarkerKey: 'total_testosterone',
    displayName: 'Total Testosterone',
    currentValue: 650,
    previousValue: 381,
    unit: 'ng/dL',
    absoluteDelta: 269,
    percentDelta: 70.6,
    currentFlag: 'normal',
    previousFlag: 'normal',
    flagTransition: 'improved',
    velocityPerMonth: 67.25,
    isSignificant: true,
    domain: BioDomain.HORMONES,
  })

  const freeTDelta = makeDelta({
    biomarkerKey: 'free_testosterone',
    displayName: 'Free Testosterone',
    currentValue: 15.2,
    previousValue: 7.24,
    unit: 'ng/dL',
    absoluteDelta: 7.96,
    percentDelta: 109.9,
    currentFlag: 'normal',
    previousFlag: 'normal',
    flagTransition: 'improved',
    velocityPerMonth: 1.99,
    isSignificant: true,
    domain: BioDomain.HORMONES,
  })

  const deltas: MarkerDelta[] = [totalTDelta, freeTDelta]

  const biomarkers = makeBiomarkerMap([
    ['total_testosterone', { value: 650, flag: 'normal' }],
    ['free_testosterone', { value: 15.2, flag: 'normal' }],
  ])

  it('scoreProtocolEffectiveness returns "working" verdict with high confidence', () => {
    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)

    expect(result.protocolId).toBe('enclomiphene-001')
    expect(result.protocolName).toBe('Enclomiphene Citrate')
    expect(result.labVerdict).toBe('working')
    expect(result.labVerdictConfidence).toBe('high')
    expect(result.recommendation).toBe('continue')
    expect(result.daysOnProtocol).toBeGreaterThanOrEqual(119)
    expect(result.daysOnProtocol).toBeLessThanOrEqual(121)
    expect(result.adherencePercent).toBe(85)
  })

  it('has correct target markers with matched effects', () => {
    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)

    // Two markers tested (total_testosterone and free_testosterone)
    const testedMarkers = result.targetMarkers
    expect(testedMarkers.length).toBe(2)

    const totalT = testedMarkers.find(m => m.biomarkerKey === 'total_testosterone')
    expect(totalT).toBeDefined()
    expect(totalT!.effectMatch).toBe('matched')
    expect(totalT!.actualEffect).toContain('increased')
    expect(totalT!.actualEffect).toContain('70.6%')

    const freeT = testedMarkers.find(m => m.biomarkerKey === 'free_testosterone')
    expect(freeT).toBeDefined()
    expect(freeT!.effectMatch).toBe('matched')
    expect(freeT!.actualEffect).toContain('increased')
  })

  it('generates a "high" confidence attribution entry from the evidence ledger', () => {
    const protocolForLedger = {
      id: 'enclomiphene-001',
      name: 'Enclomiphene Citrate',
      type: 'peptide',
      adherencePercent: 85,
      daysOnProtocol: 120,
      startDate: '2025-06-10',
      expectedMarkers: ['total_testosterone', 'free_testosterone', 'lh', 'fsh'],
    }

    const entries = generateAttributionEntries(
      'lab-event-real',
      deltas,
      [protocolForLedger],
      '2025-10-09',
      '2025-06-15'
    )

    // Should generate entries for total_testosterone and free_testosterone (both are significant)
    expect(entries.length).toBe(2)

    const totalTEntry = entries.find(e => e.evidence.markers[0].biomarkerKey === 'total_testosterone')
    expect(totalTEntry).toBeDefined()
    expect(totalTEntry!.confidence).toBe('high')
    expect(totalTEntry!.claimType).toBe('attribution')
    expect(totalTEntry!.claim).toContain('Enclomiphene Citrate')
    expect(totalTEntry!.claim).toContain('85% adherence')
    expect(totalTEntry!.claim).toContain('120 days')

    const freeTEntry = entries.find(e => e.evidence.markers[0].biomarkerKey === 'free_testosterone')
    expect(freeTEntry).toBeDefined()
    expect(freeTEntry!.confidence).toBe('high')
  })

  it('verdict explanation references matched marker count', () => {
    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.labVerdictExplanation).toContain('2 of 2')
    expect(result.labVerdictExplanation).toContain('expected direction')
  })

  it('next checkpoint says 90 days for "working" verdict', () => {
    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.nextCheckpoint).toContain('90')
  })

  it('wearable alignment defaults to no_wearable_data', () => {
    const result = scoreProtocolEffectiveness(protocol, deltas, biomarkers)
    expect(result.wearableAlignment).toBe('no_wearable_data')
  })
})
