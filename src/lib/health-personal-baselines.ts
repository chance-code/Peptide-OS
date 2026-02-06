/**
 * Personal Baselines Engine — Bayesian biomarker baseline updating
 *
 * After 3+ lab draws, personal baselines become primary (population
 * references become context only). Uses conjugate normal-normal Bayesian
 * updating for mean estimation.
 */

import prisma from './prisma'
import { BIOMARKER_REGISTRY } from './lab-biomarker-contract'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PersonalBaselineRecord {
  biomarkerKey: string
  personalMean: number
  personalSD: number
  drawCount: number
  populationPercentile: number | null
  trend: 'improving' | 'stable' | 'declining'
  trendConfidence: number
  lastLabValue: number | null
  lastLabDate: Date | null
  isPrimary: boolean  // true when drawCount >= 3
  confidenceLabel: string
}

export interface BaselineUpdateResult {
  updatedKeys: string[]
  newDrawCount: number
  outliers: Array<{ biomarkerKey: string; value: number; personalMean: number; deviations: number }>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIMARY_THRESHOLD = 3  // draws needed before personal baselines are primary

// ─── Population Priors ──────────────────────────────────────────────────────

/**
 * Initialize a prior from the biomarker registry's reference range.
 * Uses range midpoint as mean and (range width / 4) as SD (covers ~95% of population).
 */
function getPopulationPrior(biomarkerKey: string): { mean: number; sd: number } {
  const def = BIOMARKER_REGISTRY[biomarkerKey]
  if (!def) {
    // Unknown biomarker — use a very wide prior
    return { mean: 50, sd: 50 }
  }

  const ref = def.referenceRange
  const mean = (ref.min + ref.max) / 2
  const sd = (ref.max - ref.min) / 4  // ~95% within reference range

  return { mean, sd: Math.max(sd, 0.01) }
}

// ─── Bayesian Update ────────────────────────────────────────────────────────

/**
 * Conjugate normal-normal Bayesian update.
 * prior ~ N(priorMean, priorVar)
 * observation ~ N(trueValue, obsVar)
 * posterior ~ N(posteriorMean, posteriorVar)
 */
function bayesianUpdate(
  priorMean: number,
  priorSD: number,
  observation: number,
  observationSD: number
): { mean: number; sd: number } {
  const priorVar = priorSD * priorSD
  const obsVar = observationSD * observationSD

  const posteriorVar = 1 / (1 / priorVar + 1 / obsVar)
  const posteriorMean = posteriorVar * (priorMean / priorVar + observation / obsVar)

  return { mean: posteriorMean, sd: Math.sqrt(posteriorVar) }
}

/**
 * Get the observation variance for a biomarker.
 * Uses biological variation (within-subject CV) if available,
 * otherwise uses 10% of reference range as default.
 */
function getObservationSD(biomarkerKey: string, value: number): number {
  const def = BIOMARKER_REGISTRY[biomarkerKey]
  if (def?.biologicalVariation?.withinSubjectCV) {
    // CV is percentage — convert to absolute SD
    return (def.biologicalVariation.withinSubjectCV / 100) * Math.abs(value)
  }
  if (def) {
    // Default: 10% of reference range width
    return (def.referenceRange.max - def.referenceRange.min) * 0.1
  }
  return Math.abs(value) * 0.1  // fallback: 10% of value
}

// ─── Trend Detection ────────────────────────────────────────────────────────

/**
 * Determine trend from historical lab values for this biomarker.
 * Requires the last 2+ values to assess direction.
 */
function detectTrend(
  biomarkerKey: string,
  previousMean: number,
  newValue: number,
  drawCount: number
): { trend: 'improving' | 'stable' | 'declining'; confidence: number } {
  if (drawCount < 2) {
    return { trend: 'stable', confidence: 0 }
  }

  const def = BIOMARKER_REGISTRY[biomarkerKey]
  const polarity = def?.polarity ?? 'optimal_range'

  const changePercent = ((newValue - previousMean) / Math.abs(previousMean)) * 100
  const absChange = Math.abs(changePercent)

  // Need meaningful change (> 5%) to call a trend
  if (absChange < 5) {
    return { trend: 'stable', confidence: Math.min(0.3 + drawCount * 0.1, 0.8) }
  }

  let trend: 'improving' | 'declining'
  if (polarity === 'higher_better') {
    trend = changePercent > 0 ? 'improving' : 'declining'
  } else if (polarity === 'lower_better') {
    trend = changePercent < 0 ? 'improving' : 'declining'
  } else {
    // optimal_range: closer to optimal center = improving
    const optimal = def?.optimalRange?.optimal
    if (optimal !== undefined) {
      const prevDistance = Math.abs(previousMean - optimal)
      const newDistance = Math.abs(newValue - optimal)
      trend = newDistance < prevDistance ? 'improving' : 'declining'
    } else {
      trend = 'stable' as 'improving'  // can't determine without optimal
      return { trend: 'stable', confidence: 0.3 }
    }
  }

  // Confidence scales with draw count and magnitude of change
  const confidence = Math.min(0.3 + drawCount * 0.1 + absChange * 0.005, 0.95)

  return { trend, confidence }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch all personal baselines for a user.
 */
export async function getPersonalBaselines(
  userId: string,
  biomarkerKey?: string
): Promise<PersonalBaselineRecord[]> {
  const where = biomarkerKey
    ? { userId, biomarkerKey }
    : { userId }

  const baselines = await prisma.personalBaseline.findMany({ where })

  return baselines.map(b => ({
    biomarkerKey: b.biomarkerKey,
    personalMean: b.personalMean,
    personalSD: b.personalSD,
    drawCount: b.drawCount,
    populationPercentile: b.populationPercentile,
    trend: b.trend as 'improving' | 'stable' | 'declining',
    trendConfidence: b.trendConfidence,
    lastLabValue: b.lastLabValue,
    lastLabDate: b.lastLabDate,
    isPrimary: b.drawCount >= PRIMARY_THRESHOLD,
    confidenceLabel: getBaselineConfidenceLabel(b.drawCount),
  }))
}

/**
 * Update personal baselines with new lab values (Bayesian updating).
 * Called during the Brain's lab prior-reset cascade.
 */
export async function updateBiomarkerBaselines(
  userId: string,
  biomarkers: Array<{ key: string; value: number }>
): Promise<BaselineUpdateResult> {
  const updatedKeys: string[] = []
  const outliers: BaselineUpdateResult['outliers'] = []

  for (const { key, value } of biomarkers) {
    // Fetch existing baseline or create from population prior
    const existing = await prisma.personalBaseline.findUnique({
      where: { userId_biomarkerKey: { userId, biomarkerKey: key } },
    })

    const prior = existing
      ? { mean: existing.personalMean, sd: existing.personalSD }
      : getPopulationPrior(key)

    const drawCount = (existing?.drawCount ?? 0) + 1

    // Check for outlier (> 3 SD from personal mean) before updating
    if (existing && existing.drawCount >= 2) {
      const deviations = Math.abs(value - existing.personalMean) / Math.max(existing.personalSD, 0.01)
      if (deviations > 3) {
        outliers.push({
          biomarkerKey: key,
          value,
          personalMean: existing.personalMean,
          deviations: Math.round(deviations * 10) / 10,
        })
      }
    }

    // Bayesian update
    const obsSD = getObservationSD(key, value)
    const posterior = bayesianUpdate(prior.mean, prior.sd, value, obsSD)

    // Detect trend
    const { trend, confidence: trendConfidence } = detectTrend(
      key, prior.mean, value, drawCount
    )

    // Compute population percentile (simple z-score based)
    const popPrior = getPopulationPrior(key)
    const zScore = (posterior.mean - popPrior.mean) / popPrior.sd
    const percentile = normalCDF(zScore) * 100

    // Upsert baseline
    await prisma.personalBaseline.upsert({
      where: { userId_biomarkerKey: { userId, biomarkerKey: key } },
      update: {
        personalMean: posterior.mean,
        personalSD: posterior.sd,
        drawCount,
        populationPercentile: Math.round(percentile * 10) / 10,
        trend,
        trendConfidence,
        lastLabValue: value,
        lastLabDate: new Date(),
      },
      create: {
        userId,
        biomarkerKey: key,
        personalMean: posterior.mean,
        personalSD: posterior.sd,
        drawCount,
        populationPercentile: Math.round(percentile * 10) / 10,
        trend,
        trendConfidence,
        lastLabValue: value,
        lastLabDate: new Date(),
      },
    })

    updatedKeys.push(key)
  }

  return { updatedKeys, newDrawCount: biomarkers.length, outliers }
}

/**
 * User-facing confidence label based on draw count.
 */
export function getBaselineConfidenceLabel(drawCount: number): string {
  if (drawCount <= 0) return 'No data yet'
  if (drawCount === 1) return 'First snapshot (1 draw)'
  if (drawCount === 2) return 'Still learning your patterns (2 draws)'
  if (drawCount <= 4) return `Clear picture of your normals (${drawCount} draws)`
  if (drawCount <= 6) return `Strong personal baseline (${drawCount} draws)`
  return `Detailed model of your biology (${drawCount} draws)`
}

/**
 * Whether this baseline is primary (personal > population).
 */
export function isPrimaryBaseline(drawCount: number): boolean {
  return drawCount >= PRIMARY_THRESHOLD
}

/**
 * Overall confidence for a user's baseline set.
 */
export function getOverallBaselineConfidence(
  drawCount: number
): 'early' | 'moderate' | 'high' {
  if (drawCount < 3) return 'early'
  if (drawCount < 6) return 'moderate'
  return 'high'
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Approximate normal CDF using Abramowitz & Stegun formula 7.1.26 */
function normalCDF(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1.0 / (1.0 + p * absX)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2)

  return 0.5 * (1.0 + sign * y)
}
