// Lab Domains — Biomarker Domain Ontology & Domain Summary Computation
// Maps every biomarker in BIOMARKER_REGISTRY into 10 canonical biological domains
// and computes per-domain status summaries from lab data.

import {
  BIOMARKER_REGISTRY,
  type BiomarkerFlag,
  type BiomarkerDefinition,
  computeFlag,
  getBiomarkerDisplayName,
} from '@/lib/lab-biomarker-contract'
import { computeTrajectory, adjustTrajectoryForPolarity } from './lab-longitudinal'

// ─── Domain Enum ────────────────────────────────────────────────────────────

export enum BioDomain {
  LIPIDS = 'lipids',
  METABOLIC = 'metabolic',
  INFLAMMATION = 'inflammation',
  THYROID = 'thyroid',
  LIVER = 'liver',
  KIDNEY = 'kidney',
  HORMONES = 'hormones',
  NUTRIENTS = 'nutrients',
  HEMATOLOGY = 'hematology',
  LONGEVITY = 'longevity',
}

// ─── Domain Config ──────────────────────────────────────────────────────────

export interface DomainConfig {
  domain: BioDomain
  displayName: string
  markers: string[]           // Ordered by clinical importance
  primaryMarkers: string[]    // 2-3 markers that most define this domain
  crossReferenceDomains: BioDomain[]
  protocolCategories: string[] // Protocol types expected to affect this domain
}

export const DOMAIN_CONFIGS: Record<BioDomain, DomainConfig> = {
  [BioDomain.LIPIDS]: {
    domain: BioDomain.LIPIDS,
    displayName: 'Lipids & Cardiovascular',
    markers: [
      'apolipoprotein_b', 'ldl_cholesterol', 'hdl_cholesterol', 'triglycerides',
      'total_cholesterol', 'lipoprotein_a', 'ldl_particle_number', 'ldl_small',
      'non_hdl_cholesterol', 'fibrinogen',
    ],
    primaryMarkers: ['apolipoprotein_b', 'ldl_cholesterol', 'triglycerides'],
    crossReferenceDomains: [BioDomain.METABOLIC, BioDomain.INFLAMMATION, BioDomain.THYROID],
    protocolCategories: ['supplement'],
  },
  [BioDomain.METABOLIC]: {
    domain: BioDomain.METABOLIC,
    displayName: 'Metabolic Health',
    markers: [
      'fasting_insulin', 'hba1c', 'fasting_glucose', 'homa_ir',
      'uric_acid', 'leptin', 'adiponectin',
    ],
    primaryMarkers: ['fasting_insulin', 'hba1c', 'fasting_glucose'],
    crossReferenceDomains: [BioDomain.LIPIDS, BioDomain.INFLAMMATION, BioDomain.HORMONES],
    protocolCategories: ['supplement'],
  },
  [BioDomain.INFLAMMATION]: {
    domain: BioDomain.INFLAMMATION,
    displayName: 'Inflammation',
    markers: ['hs_crp', 'homocysteine', 'esr', 'ferritin'],
    primaryMarkers: ['hs_crp', 'homocysteine'],
    crossReferenceDomains: [BioDomain.METABOLIC, BioDomain.LIPIDS, BioDomain.HEMATOLOGY],
    protocolCategories: ['supplement', 'peptide'],
  },
  [BioDomain.THYROID]: {
    domain: BioDomain.THYROID,
    displayName: 'Thyroid Function',
    markers: ['tsh', 'free_t3', 'free_t4', 'reverse_t3', 'tpo_antibodies', 'thyroglobulin_antibodies'],
    primaryMarkers: ['tsh', 'free_t3'],
    crossReferenceDomains: [BioDomain.METABOLIC, BioDomain.LIPIDS, BioDomain.HORMONES],
    protocolCategories: ['supplement'],
  },
  [BioDomain.LIVER]: {
    domain: BioDomain.LIVER,
    displayName: 'Liver Function',
    markers: ['alt', 'ast', 'ggt', 'alkaline_phosphatase', 'total_bilirubin', 'albumin', 'total_protein'],
    primaryMarkers: ['alt', 'ggt'],
    crossReferenceDomains: [BioDomain.METABOLIC, BioDomain.INFLAMMATION],
    protocolCategories: ['supplement', 'peptide'],
  },
  [BioDomain.KIDNEY]: {
    domain: BioDomain.KIDNEY,
    displayName: 'Kidney Function',
    markers: ['creatinine', 'egfr', 'bun', 'cystatin_c', 'uric_acid'],
    primaryMarkers: ['egfr', 'creatinine'],
    crossReferenceDomains: [BioDomain.METABOLIC],
    protocolCategories: ['supplement', 'peptide'],
  },
  [BioDomain.HORMONES]: {
    domain: BioDomain.HORMONES,
    displayName: 'Hormones',
    markers: [
      'total_testosterone', 'free_testosterone', 'estradiol', 'shbg',
      'cortisol', 'dhea_s', 'fsh', 'lh', 'progesterone', 'amh',
    ],
    primaryMarkers: ['free_testosterone', 'cortisol', 'dhea_s'],
    crossReferenceDomains: [BioDomain.METABOLIC, BioDomain.THYROID, BioDomain.INFLAMMATION],
    protocolCategories: ['peptide', 'supplement'],
  },
  [BioDomain.NUTRIENTS]: {
    domain: BioDomain.NUTRIENTS,
    displayName: 'Nutrients & Vitamins',
    markers: [
      'vitamin_d', 'vitamin_b12', 'folate', 'ferritin', 'iron', 'magnesium',
      'rbc_magnesium', 'omega_3_index', 'zinc', 'tibc', 'transferrin_saturation',
      'methylmalonic_acid',
    ],
    primaryMarkers: ['vitamin_d', 'omega_3_index', 'ferritin'],
    crossReferenceDomains: [BioDomain.INFLAMMATION, BioDomain.HEMATOLOGY, BioDomain.HORMONES],
    protocolCategories: ['supplement'],
  },
  [BioDomain.HEMATOLOGY]: {
    domain: BioDomain.HEMATOLOGY,
    displayName: 'Blood Counts',
    markers: ['wbc', 'rbc', 'hemoglobin', 'hematocrit', 'mcv', 'platelets'],
    primaryMarkers: ['hemoglobin', 'wbc'],
    crossReferenceDomains: [BioDomain.NUTRIENTS, BioDomain.INFLAMMATION],
    protocolCategories: ['supplement', 'peptide'],
  },
  [BioDomain.LONGEVITY]: {
    domain: BioDomain.LONGEVITY,
    displayName: 'Longevity Markers',
    markers: [
      'apolipoprotein_b', 'hs_crp', 'hba1c', 'fasting_insulin',
      'lipoprotein_a', 'homocysteine', 'cystatin_c',
    ],
    primaryMarkers: ['apolipoprotein_b', 'hs_crp', 'hba1c'],
    crossReferenceDomains: [BioDomain.LIPIDS, BioDomain.METABOLIC, BioDomain.INFLAMMATION],
    protocolCategories: ['supplement', 'peptide'],
  },
}

// ─── Domain Summary Types ───────────────────────────────────────────────────

export interface MarkerDelta {
  biomarkerKey: string
  displayName: string
  currentValue: number
  previousValue: number
  unit: string
  absoluteDelta: number
  percentDelta: number
  currentFlag: BiomarkerFlag
  previousFlag: BiomarkerFlag
  flagTransition: 'improved' | 'worsened' | 'unchanged'
  velocityPerMonth: number
  isSignificant: boolean
  domain: BioDomain
}

export interface DomainSummary {
  domain: BioDomain
  displayName: string
  status: 'improving' | 'stable' | 'needs_attention' | 'insufficient_data'
  confidence: 'high' | 'medium' | 'low'
  markersAvailable: number
  markersTotal: number
  topDrivers: Array<{
    biomarkerKey: string
    displayName: string
    value: number
    unit: string
    flag: BiomarkerFlag
    delta?: MarkerDelta
  }>
  topActions: Array<{
    action: string
    rationale: string
    evidenceStrength: 'strong' | 'moderate' | 'emerging' | 'theoretical'
    sourceMarkers: string[]
  }>
  narrative: string
  prediction?: DomainPrediction
}

export interface DomainPrediction {
  direction: 'improving' | 'stable' | 'worsening'
  basis: string
  confidence: 'high' | 'medium' | 'low'
}

// ─── Biomarker → Domain Lookup ──────────────────────────────────────────────

const biomarkerToDomain: Map<string, BioDomain> = new Map()

function buildBiomarkerDomainMap(): void {
  if (biomarkerToDomain.size > 0) return
  // Use the first non-Longevity domain that lists this marker as canonical
  for (const [domain, config] of Object.entries(DOMAIN_CONFIGS)) {
    if (domain === BioDomain.LONGEVITY) continue
    for (const marker of config.markers) {
      if (!biomarkerToDomain.has(marker)) {
        biomarkerToDomain.set(marker, domain as BioDomain)
      }
    }
  }
}

export function getDomainForBiomarker(biomarkerKey: string): BioDomain | undefined {
  buildBiomarkerDomainMap()
  return biomarkerToDomain.get(biomarkerKey)
}

// ─── Flag Distance ──────────────────────────────────────────────────────────

const FLAG_ORDER: Record<string, number> = {
  critical_low: 0, low: 1, normal: 2, optimal: 3, high: 4, critical_high: 5,
}

function flagDistance(flag: BiomarkerFlag): number {
  return Math.abs((FLAG_ORDER[flag] ?? 2) - 3)
}

function flagTransition(prev: BiomarkerFlag, curr: BiomarkerFlag): 'improved' | 'worsened' | 'unchanged' {
  const prevDist = flagDistance(prev)
  const currDist = flagDistance(curr)
  if (currDist < prevDist) return 'improved'
  if (currDist > prevDist) return 'worsened'
  return 'unchanged'
}

// ─── Marker Delta Computation ───────────────────────────────────────────────

export interface BiomarkerPoint {
  biomarkerKey: string
  value: number
  unit: string
  flag: BiomarkerFlag
  date: Date
}

export function computeMarkerDeltas(
  currentBiomarkers: BiomarkerPoint[],
  previousBiomarkers: BiomarkerPoint[],
  allHistoricalPoints?: Map<string, Array<{ date: Date; value: number }>>
): MarkerDelta[] {
  buildBiomarkerDomainMap()
  const prevMap = new Map(previousBiomarkers.map(b => [b.biomarkerKey, b]))
  const deltas: MarkerDelta[] = []

  for (const curr of currentBiomarkers) {
    const prev = prevMap.get(curr.biomarkerKey)
    if (!prev) continue

    const def = BIOMARKER_REGISTRY[curr.biomarkerKey]
    if (!def) continue

    const absoluteDelta = curr.value - prev.value
    const percentDelta = prev.value !== 0 ? (absoluteDelta / prev.value) * 100 : 0
    const transition = flagTransition(prev.flag, curr.flag)

    // Compute velocity from historical points if available
    let velocityPerMonth = 0
    const history = allHistoricalPoints?.get(curr.biomarkerKey)
    if (history && history.length >= 2) {
      const result = computeTrajectory(history)
      velocityPerMonth = result.velocityPerMonth
    } else {
      // Simple two-point velocity
      const monthsBetween = (curr.date.getTime() - prev.date.getTime()) / (30 * 24 * 60 * 60 * 1000)
      velocityPerMonth = monthsBetween > 0 ? absoluteDelta / monthsBetween : 0
    }

    const isSignificant = Math.abs(percentDelta) >= 5 || transition !== 'unchanged'
    const domain = biomarkerToDomain.get(curr.biomarkerKey) ?? BioDomain.NUTRIENTS

    deltas.push({
      biomarkerKey: curr.biomarkerKey,
      displayName: def.displayName,
      currentValue: curr.value,
      previousValue: prev.value,
      unit: def.unit,
      absoluteDelta: Math.round(absoluteDelta * 100) / 100,
      percentDelta: Math.round(percentDelta * 10) / 10,
      currentFlag: curr.flag,
      previousFlag: prev.flag,
      flagTransition: transition,
      velocityPerMonth: Math.round(velocityPerMonth * 100) / 100,
      isSignificant,
      domain,
    })
  }

  return deltas.sort((a, b) => {
    // Flag transitions first, then by % change magnitude
    if (a.flagTransition !== 'unchanged' && b.flagTransition === 'unchanged') return -1
    if (a.flagTransition === 'unchanged' && b.flagTransition !== 'unchanged') return 1
    return Math.abs(b.percentDelta) - Math.abs(a.percentDelta)
  })
}

// ─── Domain Summary Computation ─────────────────────────────────────────────

export function computeDomainSummaries(
  currentBiomarkers: BiomarkerPoint[],
  markerDeltas: MarkerDelta[],
  labEventCount: number
): DomainSummary[] {
  const currentMap = new Map(currentBiomarkers.map(b => [b.biomarkerKey, b]))
  const deltaMap = new Map(markerDeltas.map(d => [d.biomarkerKey, d]))
  const summaries: DomainSummary[] = []

  for (const config of Object.values(DOMAIN_CONFIGS)) {
    const available = config.markers.filter(key => currentMap.has(key))

    // Compute status
    let status: DomainSummary['status'] = 'insufficient_data'
    if (available.length >= 2 && labEventCount >= 2) {
      const domainDeltas = available
        .map(key => deltaMap.get(key))
        .filter((d): d is MarkerDelta => d !== undefined)

      if (domainDeltas.length === 0) {
        status = 'stable'
      } else {
        const improving = domainDeltas.filter(d => d.flagTransition === 'improved' || (d.flagTransition === 'unchanged' && isMovingOptimal(d))).length
        const worsening = domainDeltas.filter(d => d.flagTransition === 'worsened' || (d.flagTransition === 'unchanged' && isMovingSuboptimal(d))).length
        const hasOutOfRange = available.some(key => {
          const b = currentMap.get(key)
          return b && (b.flag === 'low' || b.flag === 'high' || b.flag === 'critical_low' || b.flag === 'critical_high')
        })
        const hasWorseningOutOfRange = domainDeltas.some(d => d.flagTransition === 'worsened')

        if (hasWorseningOutOfRange || (hasOutOfRange && worsening >= 2)) {
          status = 'needs_attention'
        } else if (improving > 0 && improving >= domainDeltas.length * 0.6) {
          status = 'improving'
        } else {
          status = 'stable'
        }
      }
    } else if (available.length >= 2 && labEventCount === 1) {
      // First lab — check if markers are out of range
      const outOfRange = available.filter(key => {
        const b = currentMap.get(key)
        return b && (b.flag === 'low' || b.flag === 'high' || b.flag === 'critical_low' || b.flag === 'critical_high')
      })
      status = outOfRange.length >= 2 ? 'needs_attention' : 'stable'
    }

    // Compute confidence
    let confidence: DomainSummary['confidence'] = 'low'
    if (labEventCount >= 3 && available.length >= 3) {
      confidence = 'high'
    } else if (labEventCount >= 2 || available.length >= 2) {
      confidence = 'medium'
    }

    // Top drivers: primary markers present, sorted by distance from optimal
    const topDrivers = config.primaryMarkers
      .filter(key => currentMap.has(key))
      .map(key => {
        const b = currentMap.get(key)!
        const def = BIOMARKER_REGISTRY[key]
        return {
          biomarkerKey: key,
          displayName: def?.displayName ?? key,
          value: b.value,
          unit: def?.unit ?? b.unit,
          flag: b.flag,
          delta: deltaMap.get(key),
        }
      })
      .sort((a, b) => flagDistance(b.flag) - flagDistance(a.flag))
      .slice(0, 3)

    // Generate narrative
    const narrative = generateDomainNarrative(config, available, currentMap, deltaMap, status, labEventCount)

    summaries.push({
      domain: config.domain,
      displayName: config.displayName,
      status,
      confidence,
      markersAvailable: available.length,
      markersTotal: config.markers.length,
      topDrivers,
      topActions: [], // Populated in Phase 2 compute pipeline
      narrative,
    })
  }

  // Sort: needs_attention first, then improving, stable, insufficient_data
  const statusOrder: Record<string, number> = { needs_attention: 0, improving: 1, stable: 2, insufficient_data: 3 }
  return summaries.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isMovingOptimal(delta: MarkerDelta): boolean {
  const def = BIOMARKER_REGISTRY[delta.biomarkerKey]
  if (!def) return false
  if (def.polarity === 'lower_better') return delta.absoluteDelta < 0
  if (def.polarity === 'higher_better') return delta.absoluteDelta > 0
  if (def.polarity === 'optimal_range' && def.optimalRange) {
    const distPrev = Math.abs(delta.previousValue - def.optimalRange.optimal)
    const distCurr = Math.abs(delta.currentValue - def.optimalRange.optimal)
    return distCurr < distPrev
  }
  return false
}

function isMovingSuboptimal(delta: MarkerDelta): boolean {
  const def = BIOMARKER_REGISTRY[delta.biomarkerKey]
  if (!def) return false
  if (def.polarity === 'lower_better') return delta.absoluteDelta > 0 && Math.abs(delta.percentDelta) >= 5
  if (def.polarity === 'higher_better') return delta.absoluteDelta < 0 && Math.abs(delta.percentDelta) >= 5
  if (def.polarity === 'optimal_range' && def.optimalRange) {
    const distPrev = Math.abs(delta.previousValue - def.optimalRange.optimal)
    const distCurr = Math.abs(delta.currentValue - def.optimalRange.optimal)
    return distCurr > distPrev && Math.abs(delta.percentDelta) >= 5
  }
  return false
}

function generateDomainNarrative(
  config: DomainConfig,
  available: string[],
  currentMap: Map<string, BiomarkerPoint>,
  deltaMap: Map<string, MarkerDelta>,
  status: DomainSummary['status'],
  labEventCount: number
): string {
  if (available.length === 0) {
    return `No ${config.displayName.toLowerCase()} markers were included in this lab panel.`
  }
  if (available.length < 2) {
    return `Only ${available.length} ${config.displayName.toLowerCase()} marker available. More markers would strengthen this assessment.`
  }

  const parts: string[] = []

  // Status summary
  if (status === 'improving') {
    parts.push(`${config.displayName} markers are trending in the right direction.`)
  } else if (status === 'needs_attention') {
    parts.push(`Some ${config.displayName.toLowerCase()} markers warrant attention.`)
  } else if (status === 'stable') {
    parts.push(`${config.displayName} markers are stable.`)
  } else {
    parts.push(`Insufficient data to assess ${config.displayName.toLowerCase()} trends.`)
  }

  // Highlight primary markers
  for (const key of config.primaryMarkers) {
    const b = currentMap.get(key)
    const delta = deltaMap.get(key)
    const def = BIOMARKER_REGISTRY[key]
    if (!b || !def) continue

    if (b.flag === 'optimal') {
      parts.push(`${def.shortName ?? def.displayName} is in the optimal range.`)
    } else if (b.flag === 'high' || b.flag === 'critical_high') {
      parts.push(`${def.shortName ?? def.displayName} at ${def.format(b.value)} is elevated${delta && delta.flagTransition === 'worsened' ? ' and worsening' : ''}.`)
    } else if (b.flag === 'low' || b.flag === 'critical_low') {
      parts.push(`${def.shortName ?? def.displayName} at ${def.format(b.value)} is below optimal${delta && delta.flagTransition === 'worsened' ? ' and declining further' : ''}.`)
    }
  }

  if (labEventCount === 1) {
    parts.push('Upload your next lab to unlock trend analysis.')
  }

  return parts.join(' ')
}
