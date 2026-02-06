// Lab Longitudinal Trending — Multi-upload biomarker trend analysis
// Tracks biomarker changes across multiple lab uploads over time

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, computeFlag, type BiomarkerFlag } from '@/lib/lab-biomarker-contract'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrendPoint {
  date: string        // ISO date string
  value: number
  unit: string
  flag: BiomarkerFlag
  uploadId: string
}

export interface LongitudinalTrend {
  biomarkerKey: string
  displayName: string
  shortName: string
  category: string
  unit: string
  polarity: string
  points: TrendPoint[]
  trajectory: 'improving' | 'stable' | 'declining'
  velocityPerMonth: number   // Rate of change per month
  percentChange: number      // Total % change from first to last
  currentFlag: BiomarkerFlag
  previousFlag?: BiomarkerFlag
}

export interface DeteriorationAlert {
  biomarkerKey: string
  displayName: string
  fromFlag: BiomarkerFlag
  toFlag: BiomarkerFlag
  fromValue: number
  toValue: number
  unit: string
  changePercent: number
  message: string
}

export interface ImprovementHighlight {
  biomarkerKey: string
  displayName: string
  fromFlag: BiomarkerFlag
  toFlag: BiomarkerFlag
  fromValue: number
  toValue: number
  unit: string
  changePercent: number
  message: string
}

export interface LongitudinalResult {
  trends: LongitudinalTrend[]
  deteriorations: DeteriorationAlert[]
  improvements: ImprovementHighlight[]
  narrative: string
}

// ─── Trajectory Detection ───────────────────────────────────────────────────

/**
 * Detect trajectory using simple linear regression on time-series data.
 * Returns slope normalized to units per month.
 */
function computeTrajectory(
  points: Array<{ date: Date; value: number }>
): { trajectory: 'improving' | 'stable' | 'declining'; velocityPerMonth: number } {
  if (points.length < 2) return { trajectory: 'stable', velocityPerMonth: 0 }

  // Simple linear regression: y = mx + b
  const n = points.length
  const firstDate = points[0].date.getTime()

  // Convert dates to months since first point
  const xs = points.map(p => (p.date.getTime() - firstDate) / (30 * 24 * 60 * 60 * 1000))
  const ys = points.map(p => p.value)

  const sumX = xs.reduce((s, x) => s + x, 0)
  const sumY = ys.reduce((s, y) => s + y, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)

  const denominator = n * sumX2 - sumX * sumX
  if (Math.abs(denominator) < 0.0001) return { trajectory: 'stable', velocityPerMonth: 0 }

  const slope = (n * sumXY - sumX * sumY) / denominator
  const meanY = sumY / n

  // Normalize slope as % of mean value per month
  const normalizedSlope = meanY !== 0 ? (slope / meanY) * 100 : 0

  let trajectory: 'improving' | 'stable' | 'declining'
  if (Math.abs(normalizedSlope) < 2) {
    trajectory = 'stable'
  } else {
    // Direction depends on polarity (handled by caller)
    trajectory = slope > 0 ? 'improving' : 'declining'
  }

  return { trajectory, velocityPerMonth: Math.round(slope * 100) / 100 }
}

/**
 * Adjust trajectory label based on biomarker polarity.
 * For "lower_better" biomarkers, an increasing value = declining, not improving.
 */
function adjustTrajectoryForPolarity(
  trajectory: 'improving' | 'stable' | 'declining',
  polarity: string
): 'improving' | 'stable' | 'declining' {
  if (trajectory === 'stable') return 'stable'
  if (polarity === 'lower_better') {
    return trajectory === 'improving' ? 'declining' : 'improving'
  }
  return trajectory
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Get longitudinal trends for a user's lab biomarkers across all uploads.
 * @param userId - User ID
 * @param biomarkerKeys - Specific biomarker keys to trend, or empty for all
 */
export async function getLongitudinalTrends(
  userId: string,
  biomarkerKeys?: string[]
): Promise<LongitudinalResult> {
  // Fetch all uploads with biomarkers, ordered by test date
  const uploads = await prisma.labUpload.findMany({
    where: { userId },
    orderBy: { testDate: 'asc' },
    include: {
      biomarkers: biomarkerKeys && biomarkerKeys.length > 0
        ? { where: { biomarkerKey: { in: biomarkerKeys } } }
        : true,
    },
  })

  if (uploads.length < 2) {
    return {
      trends: [],
      deteriorations: [],
      improvements: [],
      narrative: 'Upload at least two lab results to see biomarker trends over time.',
    }
  }

  // Group biomarkers by key across uploads
  const biomarkerMap: Record<string, Array<{
    date: Date
    value: number
    unit: string
    flag: BiomarkerFlag
    uploadId: string
  }>> = {}

  for (const upload of uploads) {
    for (const biomarker of upload.biomarkers) {
      if (!biomarkerMap[biomarker.biomarkerKey]) {
        biomarkerMap[biomarker.biomarkerKey] = []
      }
      biomarkerMap[biomarker.biomarkerKey].push({
        date: upload.testDate,
        value: biomarker.value,
        unit: biomarker.unit,
        flag: biomarker.flag as BiomarkerFlag,
        uploadId: upload.id,
      })
    }
  }

  const trends: LongitudinalTrend[] = []
  const deteriorations: DeteriorationAlert[] = []
  const improvements: ImprovementHighlight[] = []

  for (const [key, points] of Object.entries(biomarkerMap)) {
    if (points.length < 2) continue

    const def = BIOMARKER_REGISTRY[key]
    if (!def) continue

    const { trajectory: rawTrajectory, velocityPerMonth } = computeTrajectory(
      points.map(p => ({ date: p.date, value: p.value }))
    )

    const trajectory = adjustTrajectoryForPolarity(rawTrajectory, def.polarity)

    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]
    const percentChange = firstPoint.value !== 0
      ? ((lastPoint.value - firstPoint.value) / firstPoint.value) * 100
      : 0

    const trend: LongitudinalTrend = {
      biomarkerKey: key,
      displayName: def.displayName,
      shortName: def.shortName ?? def.displayName,
      category: def.category,
      unit: def.unit,
      polarity: def.polarity,
      points: points.map(p => ({
        date: p.date.toISOString(),
        value: p.value,
        unit: p.unit,
        flag: p.flag,
        uploadId: p.uploadId,
      })),
      trajectory,
      velocityPerMonth,
      percentChange: Math.round(percentChange * 10) / 10,
      currentFlag: lastPoint.flag,
      previousFlag: points.length >= 2 ? points[points.length - 2].flag : undefined,
    }

    trends.push(trend)

    // Check for deterioration: flag moved in a worse direction
    const flagOrder: Record<string, number> = {
      critical_low: 0, low: 1, normal: 2, optimal: 3,
      high: 4, critical_high: 5,
    }

    if (points.length >= 2) {
      const prevFlag = points[points.length - 2].flag
      const currFlag = lastPoint.flag

      // Deterioration: moved away from optimal
      const prevDist = Math.abs((flagOrder[prevFlag] ?? 2) - 3)
      const currDist = Math.abs((flagOrder[currFlag] ?? 2) - 3)

      if (currDist > prevDist && currDist >= 2) {
        deteriorations.push({
          biomarkerKey: key,
          displayName: def.displayName,
          fromFlag: prevFlag,
          toFlag: currFlag,
          fromValue: points[points.length - 2].value,
          toValue: lastPoint.value,
          unit: def.unit,
          changePercent: Math.round(percentChange * 10) / 10,
          message: `${def.displayName} moved from ${prevFlag} to ${currFlag} (${def.format(points[points.length - 2].value)} → ${def.format(lastPoint.value)})`,
        })
      }

      // Improvement: moved toward optimal
      if (currDist < prevDist && prevDist >= 2) {
        improvements.push({
          biomarkerKey: key,
          displayName: def.displayName,
          fromFlag: prevFlag,
          toFlag: currFlag,
          fromValue: points[points.length - 2].value,
          toValue: lastPoint.value,
          unit: def.unit,
          changePercent: Math.round(percentChange * 10) / 10,
          message: `${def.displayName} improved from ${prevFlag} to ${currFlag} (${def.format(points[points.length - 2].value)} → ${def.format(lastPoint.value)})`,
        })
      }
    }
  }

  // Generate narrative
  const narrative = generateNarrative(trends, deteriorations, improvements)

  return {
    trends: trends.sort((a, b) => a.category.localeCompare(b.category)),
    deteriorations: deteriorations.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)),
    improvements: improvements.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)),
    narrative,
  }
}

function generateNarrative(
  trends: LongitudinalTrend[],
  deteriorations: DeteriorationAlert[],
  improvements: ImprovementHighlight[]
): string {
  const improving = trends.filter(t => t.trajectory === 'improving').length
  const declining = trends.filter(t => t.trajectory === 'declining').length
  const stable = trends.filter(t => t.trajectory === 'stable').length

  const parts: string[] = []

  if (improving > declining) {
    parts.push(`Overall positive trajectory: ${improving} biomarkers improving, ${stable} stable, ${declining} declining.`)
  } else if (declining > improving) {
    parts.push(`Some markers need attention: ${declining} biomarkers declining, ${improving} improving, ${stable} stable.`)
  } else {
    parts.push(`Mixed picture: ${improving} improving, ${declining} declining, ${stable} stable across ${trends.length} tracked biomarkers.`)
  }

  if (improvements.length > 0) {
    const topWin = improvements[0]
    parts.push(`Top improvement: ${topWin.displayName} (${topWin.changePercent > 0 ? '+' : ''}${topWin.changePercent}%).`)
  }

  if (deteriorations.length > 0) {
    const topConcern = deteriorations[0]
    parts.push(`Key concern: ${topConcern.displayName} has moved to ${topConcern.toFlag}.`)
  }

  return parts.join(' ')
}
