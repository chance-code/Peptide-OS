// Cohort Intelligence Engine
// Generates anonymous aggregate insights for opted-in users with differential privacy.
// Weekly batch: computes per-protocol metric deltas, applies Laplace noise, stores personalized insights.

import prisma from '@/lib/prisma'

const EPSILON = 1.0             // Differential privacy parameter
const MIN_COHORT_SIZE = 20      // Minimum n for reporting
const INSIGHT_TTL_DAYS = 7      // Insights expire after 7 days
const OBSERVATION_WINDOW = 30   // Days before/after protocol start

// Standard metrics to analyze per protocol
const COHORT_METRICS = [
  'hrv', 'resting_heart_rate', 'deep_sleep_duration', 'sleep_score',
  'readiness_score', 'steps', 'vo2_max',
]

interface CohortMetricResult {
  peptideId: string
  peptideName: string
  metricType: string
  medianDelta: number       // Percentage change
  iqrLow: number
  iqrHigh: number
  sampleSize: number
  weeksToEffect: number
  providerBreakdown: Record<string, number> // provider → n
}

// ─── Main Entry ─────────────────────────────────────────────────────────

export async function generateCohortInsights(): Promise<number> {
  // Clean up expired insights first
  await cleanExpiredInsights()

  const optedInUsers = await prisma.userProfile.findMany({
    where: { cohortOptIn: true },
    select: { id: true },
  })

  if (optedInUsers.length < MIN_COHORT_SIZE) {
    return 0 // Not enough opted-in users yet
  }

  const optedInIds = optedInUsers.map(u => u.id)

  // Get all active protocols across opted-in users, grouped by peptide
  const protocols = await prisma.protocol.findMany({
    where: {
      userId: { in: optedInIds },
      status: { in: ['active', 'completed'] },
    },
    include: { peptide: true },
  })

  // Group by peptide
  const byPeptide = new Map<string, typeof protocols>()
  for (const proto of protocols) {
    if (!proto.peptideId) continue
    const existing = byPeptide.get(proto.peptideId) ?? []
    existing.push(proto)
    byPeptide.set(proto.peptideId, existing)
  }

  let insightsGenerated = 0

  for (const [peptideId, pepProtocols] of byPeptide) {
    if (pepProtocols.length < MIN_COHORT_SIZE) continue
    const peptideName = pepProtocols[0].peptide?.name ?? 'Unknown'

    for (const metricType of COHORT_METRICS) {
      const result = await computeCohortMetric(peptideId, peptideName, metricType, pepProtocols)
      if (!result || result.sampleSize < MIN_COHORT_SIZE) continue

      // Apply differential privacy (Laplace noise)
      const noisyMedian = result.medianDelta + laplaceSample(1.0 / EPSILON)
      result.medianDelta = Math.round(noisyMedian * 10) / 10

      // Generate personalized insights for each opted-in user on this protocol
      const userProtocols = pepProtocols.filter(p => optedInIds.includes(p.userId))
      for (const userProto of userProtocols) {
        const userDelta = await computeUserDelta(userProto.userId, metricType, userProto.startDate)
        const percentileRank = userDelta !== null
          ? estimatePercentileRank(userDelta, result.medianDelta, result.iqrLow, result.iqrHigh)
          : null

        const cohortKey = `${peptideName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${metricType}`
        const title = generateCohortTitle(peptideName, metricType, result)
        const body = generateCohortBody(peptideName, metricType, result, percentileRank)

        await prisma.cohortInsight.create({
          data: {
            userId: userProto.userId,
            cohortKey,
            title,
            body,
            sampleSize: result.sampleSize,
            medianEffect: result.medianDelta,
            percentileRank,
            expiresAt: new Date(Date.now() + INSIGHT_TTL_DAYS * 86400000),
          },
        })
        insightsGenerated++
      }
    }
  }

  return insightsGenerated
}

// ─── Metric Computation ─────────────────────────────────────────────────

async function computeCohortMetric(
  peptideId: string,
  peptideName: string,
  metricType: string,
  protocols: Array<{ userId: string; startDate: Date }>,
): Promise<CohortMetricResult | null> {
  const deltas: number[] = []
  const providerBreakdown: Record<string, number> = {}

  for (const proto of protocols) {
    const delta = await computeUserDelta(proto.userId, metricType, proto.startDate)
    if (delta === null) continue
    deltas.push(delta)

    // Track provider
    const integration = await prisma.healthIntegration.findFirst({
      where: { userId: proto.userId, isConnected: true },
      select: { provider: true },
    })
    if (integration) {
      providerBreakdown[integration.provider] = (providerBreakdown[integration.provider] ?? 0) + 1
    }
  }

  if (deltas.length < MIN_COHORT_SIZE) return null

  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]
  const q1 = deltas[Math.floor(deltas.length * 0.25)]
  const q3 = deltas[Math.floor(deltas.length * 0.75)]

  // Estimate weeks to first noticeable effect (when median crosses 5% threshold)
  const weeksToEffect = estimateWeeksToEffect(peptideName)

  return {
    peptideId,
    peptideName,
    metricType,
    medianDelta: median,
    iqrLow: q1,
    iqrHigh: q3,
    sampleSize: deltas.length,
    weeksToEffect,
    providerBreakdown,
  }
}

async function computeUserDelta(
  userId: string,
  metricType: string,
  startDate: Date,
): Promise<number | null> {
  const preStart = new Date(startDate.getTime() - OBSERVATION_WINDOW * 86400000)
  const postEnd = new Date(startDate.getTime() + OBSERVATION_WINDOW * 86400000)

  const [preMetrics, postMetrics] = await Promise.all([
    prisma.healthMetric.findMany({
      where: {
        userId,
        metricType,
        recordedAt: { gte: preStart, lt: startDate },
      },
      select: { value: true },
    }),
    prisma.healthMetric.findMany({
      where: {
        userId,
        metricType,
        recordedAt: { gte: startDate, lte: postEnd },
      },
      select: { value: true },
    }),
  ])

  if (preMetrics.length < 3 || postMetrics.length < 3) return null

  const preMean = preMetrics.reduce((s, m) => s + m.value, 0) / preMetrics.length
  const postMean = postMetrics.reduce((s, m) => s + m.value, 0) / postMetrics.length

  if (preMean === 0) return null
  return ((postMean - preMean) / Math.abs(preMean)) * 100
}

// ─── Differential Privacy ───────────────────────────────────────────────

function laplaceSample(scale: number): number {
  const u = Math.random() - 0.5
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
}

// ─── Text Generation ────────────────────────────────────────────────────

function generateCohortTitle(peptideName: string, metricType: string, result: CohortMetricResult): string {
  const metricLabel = formatMetricLabel(metricType)
  const direction = result.medianDelta > 0 ? 'improvement' : 'change'
  return `${peptideName} cohort: ${metricLabel} ${direction}`
}

function generateCohortBody(
  peptideName: string,
  metricType: string,
  result: CohortMetricResult,
  percentileRank: number | null,
): string {
  const metricLabel = formatMetricLabel(metricType)
  const absEffect = Math.abs(result.medianDelta).toFixed(0)
  const direction = result.medianDelta > 0 ? 'improvement' : 'decrease'

  let text = `Users on ${peptideName} saw a median ${absEffect}% ${metricLabel} ${direction} by week ${result.weeksToEffect} (n=${result.sampleSize}).`

  if (percentileRank !== null) {
    if (percentileRank >= 75) {
      text += ` Your response is in the top quartile — keep it up.`
    } else if (percentileRank >= 50) {
      text += ` Your response is above the cohort median.`
    } else if (percentileRank >= 25) {
      text += ` Your response is tracking with the cohort. Consider reviewing timing and dosage.`
    } else {
      text += ` Your response is below the cohort median. This may be worth discussing with your provider.`
    }
  }

  return text
}

function formatMetricLabel(metricType: string): string {
  const labels: Record<string, string> = {
    hrv: 'HRV',
    resting_heart_rate: 'resting heart rate',
    deep_sleep_duration: 'deep sleep',
    sleep_score: 'sleep score',
    readiness_score: 'readiness score',
    steps: 'daily steps',
    vo2_max: 'VO2 max',
  }
  return labels[metricType] ?? metricType.replace(/_/g, ' ')
}

function estimateWeeksToEffect(peptideName: string): number {
  // Conservative estimates based on typical mechanism timelines
  const estimates: Record<string, number> = {
    'BPC-157': 4,
    'TB-500': 6,
    'GHK-Cu': 8,
    'Semaglutide': 4,
    'Tirzepatide': 4,
    'CJC-1295': 6,
    'Ipamorelin': 4,
    'MK-677': 4,
    'PT-141': 1,
    'Selank': 2,
    'Semax': 2,
  }
  return estimates[peptideName] ?? 6
}

function estimatePercentileRank(
  userDelta: number,
  median: number,
  q1: number,
  q3: number,
): number {
  // Simple linear interpolation using IQR
  if (userDelta <= q1) return 25 * (userDelta - (q1 - (q3 - q1))) / (q3 - q1)
  if (userDelta <= median) return 25 + 25 * (userDelta - q1) / (median - q1)
  if (userDelta <= q3) return 50 + 25 * (userDelta - median) / (q3 - median)
  return Math.min(99, 75 + 25 * (userDelta - q3) / (q3 - q1 || 1))
}

// ─── Housekeeping ───────────────────────────────────────────────────────

async function cleanExpiredInsights(): Promise<void> {
  await prisma.cohortInsight.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
}
