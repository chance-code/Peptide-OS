/**
 * Health Brain — The Single Orchestrator
 *
 * Everything downstream (UI, notifications, discovery feed, weekly brief)
 * consumes HealthBrainOutput. No engine is called directly by API routes.
 *
 * Pipeline: Storage → HealthBrain.evaluate() → HealthBrainOutput → Everything else
 */

import { differenceInDays, subDays, format } from 'date-fns'
import prisma from './prisma'
import { BIOMARKER_REGISTRY, computeZone, computeFlag, type BiomarkerFlag } from './lab-biomarker-contract'
import { analyzeLabPatterns, type LabPattern } from './labs/lab-analyzer'
import { generateBridgeInsights, type BridgeInsight } from './labs/lab-wearable-bridge'
import { computePremiumEvidence, type PremiumProtocolEvidence } from './health-evidence-engine'
import { getDailyStatus, type DailyStatus } from './health-daily-status'
import { getRecommendations } from './health-claims'
import { getUnifiedMetrics } from './health-synthesis'
import { METRIC_POLARITY, computeBaseline } from './health-baselines'
import type { MetricType } from './health-providers'
import {
  updateBiomarkerBaselines,
  getPersonalBaselines,
  getBaselineConfidenceLabel,
  isPrimaryBaseline,
  type BaselineUpdateResult,
} from './health-personal-baselines'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrainTrigger = 'lab_upload' | 'daily_wearable_sync' | 'protocol_change' | 'manual_refresh'

export interface DomainAssessment {
  domain: string
  score: number | null
  confidence: 'high' | 'medium' | 'low'
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  topSignals: Array<{
    metric: string
    value: number
    vsBaseline: 'above' | 'below' | 'normal'
    percentDiff: number
  }>
  labContribution: {
    weight: number
    recency: number  // days since last lab
    markers: number
  } | null
  narrative: string
}

export interface AgingVelocityAssessment {
  headline: string
  trend: 'decelerating' | 'steady' | 'accelerating'
  confidence: 'high' | 'medium' | 'low'
  score90d: number | null
}

export interface AllostasisAssessment {
  load: 'low' | 'moderate' | 'high'
  score: number
  drivers: string[]
}

export interface RiskTrajectoryAssessment {
  level: 'low' | 'moderate' | 'elevated' | 'high'
  trend: 'improving' | 'stable' | 'worsening'
  confidence: 'high' | 'medium' | 'low'
}

export interface ProtocolEvidenceAssessment {
  protocolId: string
  protocolName: string
  verdict: string
  verdictScore: number
  daysOnProtocol: number
  primaryEffect: string | null
  confidenceLevel: string
  topSignals: Array<{ metric: string; direction: string; magnitude: string }>
}

export interface PrioritizedAction {
  text: string
  priority: 'high' | 'medium' | 'low'
  source: string
  domain: string
  timeframe?: string
}

export interface NarrativePrimitive {
  type: 'headline' | 'domain_summary' | 'protocol_verdict' | 'bridge_insight' | 'action'
  text: string
  domain: string
  priority: number
}

export interface SystemConfidence {
  level: 'high' | 'medium' | 'low'
  score: number
  reasons: string[]
}

export interface BrainOutput {
  evaluatedAt: string
  trigger: BrainTrigger
  pipelineMs: number

  domains: Record<string, DomainAssessment>
  agingVelocity: AgingVelocityAssessment
  allostasis: AllostasisAssessment
  riskTrajectories: Record<string, RiskTrajectoryAssessment>
  protocolEvidence: ProtocolEvidenceAssessment[]
  predictions: Array<{
    biomarkerKey: string
    predictedValue: number
    confidence: number
    timeframe: string
  }>
  narrativePrimitives: NarrativePrimitive[]
  actionItems: PrioritizedAction[]
  systemConfidence: SystemConfidence
  personalBaselinesUpdated: boolean
  unifiedScore: number | null
  dailyStatus: DailyStatus | null
  dataCompleteness: number
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface LabScoreEntry {
  biomarkerKey: string
  value: number
  unit: string
  flag: BiomarkerFlag
  zone: ReturnType<typeof computeZone>
}

interface WearableAssessment {
  metrics: Map<string, { current: number; baseline: number; stdDev: number; trend: string; percentDiff: number }>
  overallScore: number | null
  dataPoints: number
  staleness: number  // hours since last data point
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DOMAIN_WEARABLE_METRICS: Record<string, MetricType[]> = {
  sleep: ['sleep_score', 'deep_sleep', 'sleep_efficiency', 'sleep_duration'],
  recovery: ['hrv', 'rhr', 'readiness_score'],
  activity: ['steps', 'exercise_minutes', 'vo2_max', 'active_calories'],
  bodyComp: ['body_fat_percentage', 'weight', 'muscle_mass', 'lean_body_mass'],
}

const DOMAIN_LAB_MARKERS: Record<string, string[]> = {
  sleep: ['vitamin_d', 'magnesium'],
  recovery: ['hs_crp', 'cortisol', 'dhea_s'],
  activity: ['hemoglobin', 'ferritin', 'iron'],
  bodyComp: ['total_testosterone', 'free_testosterone', 'tsh', 'free_t3'],
  bloodwork: [],  // all markers contribute
}

const CATEGORY_WEIGHTS: Record<string, number> = {
  sleep: 0.30,
  recovery: 0.30,
  activity: 0.20,
  bodyComp: 0.15,
  bloodwork: 0.05,
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * The 13-step evaluation pipeline. This is the single source of truth.
 */
export async function evaluate(userId: string, trigger: BrainTrigger): Promise<BrainOutput> {
  const start = Date.now()
  let personalBaselinesUpdated = false

  // Step 1: If lab_upload, run prior reset FIRST
  if (trigger === 'lab_upload') {
    const resetResult = await executeLabPriorReset(userId)
    personalBaselinesUpdated = resetResult.baselinesUpdated > 0
  }

  // Step 2: Score all biomarkers
  const latestUpload = await fetchLatestLabUpload(userId)
  const labScores = latestUpload ? scoreAllBiomarkers(latestUpload.biomarkers) : null

  // Step 3: Pattern detection (pure function)
  const patterns = labScores
    ? analyzeLabPatterns(labScores.map(s => ({
        biomarkerKey: s.biomarkerKey, value: s.value, unit: s.unit, flag: s.flag,
      })))
    : []

  // Step 4: Wearable analysis
  const wearableAssessment = await analyzeWearables(userId)

  // Step 5: Cross-domain bridge
  let bridges: BridgeInsight[] = []
  if (labScores) {
    try {
      bridges = await generateBridgeInsights(
        userId,
        labScores.map(s => ({
          biomarkerKey: s.biomarkerKey, value: s.value, unit: s.unit, flag: s.flag,
        }))
      )
    } catch (e) {
      console.error('Brain: bridge insights failed:', e)
    }
  }

  // Step 6: Protocol evidence
  let protocolEvidence: PremiumProtocolEvidence[] = []
  try {
    protocolEvidence = await computePremiumEvidence(userId)
  } catch (e) {
    console.error('Brain: protocol evidence failed:', e)
  }

  // Step 7: Domain fusion — single truth per domain
  const domains = fuseDomains(labScores, wearableAssessment, latestUpload)

  // Step 8: Aging velocity
  const agingVelocity = await computeAgingVelocity(userId, domains)

  // Step 9: Allostatic load
  const allostasis = computeAllostasis(wearableAssessment, domains)

  // Step 10: Risk trajectories
  const riskTrajectories = computeRiskTrajectories(domains, labScores, patterns)

  // Step 11: Narrative primitives
  const narrativePrimitives = generateNarrativePrimitives(
    domains, agingVelocity, protocolEvidence, bridges
  )

  // Step 12: Prioritize actions
  const actionItems = prioritizeActions(domains, protocolEvidence, patterns, bridges)

  // Step 13: System confidence
  const systemConfidence = computeSystemConfidence(labScores, wearableAssessment, domains)

  // Compute unified score
  const unifiedScore = computeUnifiedScore(domains)

  // Get daily status (delegate to existing engine for now)
  let dailyStatus: DailyStatus | null = null
  try {
    dailyStatus = await getDailyStatus(userId)
  } catch (e) {
    console.error('Brain: daily status failed:', e)
  }

  // Compute data completeness
  const dataCompleteness = computeDataCompleteness(labScores, wearableAssessment)

  // Predictions from lab review if available
  const predictions = latestUpload ? await fetchPredictions(userId) : []

  // Map protocol evidence to assessment format
  const protocolAssessments = protocolEvidence.map(mapProtocolEvidence)

  const pipelineMs = Date.now() - start

  const output: BrainOutput = {
    evaluatedAt: new Date().toISOString(),
    trigger,
    pipelineMs,
    domains,
    agingVelocity,
    allostasis,
    riskTrajectories,
    protocolEvidence: protocolAssessments,
    predictions,
    narrativePrimitives,
    actionItems,
    systemConfidence,
    personalBaselinesUpdated,
    unifiedScore,
    dailyStatus,
    dataCompleteness,
  }

  // Store snapshot
  await storeSnapshot(userId, trigger, output, pipelineMs)

  return output
}

// ─── Lab Prior Reset Cascade ────────────────────────────────────────────────

/**
 * 6-step cascade when new labs arrive. Updates personal baselines,
 * re-weights domains, resolves hypotheses, re-scores protocols,
 * quiets contradicted wearable signals, updates insight eligibility.
 */
async function executeLabPriorReset(userId: string): Promise<{
  baselinesUpdated: number
  hypothesesResolved: number
  domainsReweighted: number
  protocolsReassessed: number
  wearableSignalsQuieted: number
  labUploadId: string
}> {
  const latestUpload = await fetchLatestLabUpload(userId)
  if (!latestUpload) {
    return { baselinesUpdated: 0, hypothesesResolved: 0, domainsReweighted: 0,
             protocolsReassessed: 0, wearableSignalsQuieted: 0, labUploadId: '' }
  }

  const biomarkers = latestUpload.biomarkers.map((b: { biomarkerKey: string; value: number }) => ({
    key: b.biomarkerKey, value: b.value,
  }))

  // Step 1: Re-estimate personal baselines
  const baselineResult = await updateBiomarkerBaselines(userId, biomarkers)

  // Step 2: Re-weight domain confidence
  // Fresh labs boost confidence for domains with lab markers
  const domainsReweighted = Object.keys(DOMAIN_LAB_MARKERS).filter(domain => {
    const markers = DOMAIN_LAB_MARKERS[domain]
    return markers.some(m => biomarkers.some(b => b.key === m))
  }).length

  // Step 3: Resolve active hypotheses
  // Check if any wearable-derived hypotheses are confirmed/refuted by labs
  const hypothesesResolved = await resolveHypotheses(userId, latestUpload.biomarkers)

  // Step 4: Re-score protocol effectiveness
  // Fresh labs provide definitive assessment
  let protocolsReassessed = 0
  try {
    const evidence = await computePremiumEvidence(userId)
    protocolsReassessed = evidence.length
  } catch {
    // Non-critical — protocols reassessed on next evaluate
  }

  // Step 5: Quiet noisy wearable signals
  // Dampen wearable insights contradicted by labs
  const wearableSignalsQuieted = countContradictedSignals(latestUpload.biomarkers)

  // Step 6: Update insight eligibility — done implicitly by storing new snapshot

  // Record the event
  const summaryParts: string[] = []
  if (baselineResult.updatedKeys.length > 0) {
    summaryParts.push(`Updated ${baselineResult.updatedKeys.length} biomarker baselines`)
  }
  if (baselineResult.outliers.length > 0) {
    summaryParts.push(`${baselineResult.outliers.length} unusual values detected`)
  }
  if (hypothesesResolved > 0) {
    summaryParts.push(`${hypothesesResolved} hypotheses resolved`)
  }

  await prisma.labPriorResetEvent.create({
    data: {
      userId,
      labUploadId: latestUpload.id,
      baselinesUpdated: baselineResult.updatedKeys.length,
      hypothesesResolved,
      domainsReweighted,
      protocolsReassessed,
      wearableSignalsQuieted,
      summaryNarrative: summaryParts.join('. ') || null,
    },
  })

  return {
    baselinesUpdated: baselineResult.updatedKeys.length,
    hypothesesResolved,
    domainsReweighted,
    protocolsReassessed,
    wearableSignalsQuieted,
    labUploadId: latestUpload.id,
  }
}

// ─── Step Helpers ───────────────────────────────────────────────────────────

/** Fetch the latest lab upload with biomarkers */
async function fetchLatestLabUpload(userId: string) {
  return prisma.labUpload.findFirst({
    where: { userId },
    orderBy: { testDate: 'desc' },
    include: { biomarkers: true },
  })
}

/** Score all biomarkers using computeZone */
function scoreAllBiomarkers(
  biomarkers: Array<{ biomarkerKey: string; value: number; unit: string; flag: string }>
): LabScoreEntry[] {
  return biomarkers.map(b => ({
    biomarkerKey: b.biomarkerKey,
    value: b.value,
    unit: b.unit,
    flag: b.flag as BiomarkerFlag,
    zone: computeZone(b.biomarkerKey, b.value),
  }))
}

/** Analyze wearable metrics: fetch 30-day window, compute baselines */
async function analyzeWearables(userId: string): Promise<WearableAssessment> {
  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const metrics = new Map<string, { current: number; baseline: number; stdDev: number; trend: string; percentDiff: number }>()

  const allMetricTypes: MetricType[] = [
    'sleep_score', 'deep_sleep', 'sleep_efficiency', 'sleep_duration',
    'hrv', 'rhr', 'readiness_score',
    'steps', 'exercise_minutes', 'vo2_max', 'active_calories',
    'body_fat_percentage', 'weight', 'muscle_mass', 'lean_body_mass',
  ]

  let totalDataPoints = 0
  let latestDate: Date | null = null
  let scoreSum = 0
  let scoreCount = 0

  try {
    const unifiedMetrics = await getUnifiedMetrics(
      userId,
      thirtyDaysAgo,
      now,
      allMetricTypes
    )

    for (const [metricType, dailyValues] of unifiedMetrics.entries()) {
      if (dailyValues.length < 3) continue

      totalDataPoints += dailyValues.length

      const values = dailyValues.map(d => d.value)
      const baselineData = dailyValues.map(d => ({ date: d.date, value: d.value }))
      const baseline = computeBaseline(baselineData)
      if (!baseline) continue

      const current = values[values.length - 1]
      const percentDiff = baseline.mean === 0 ? 0 :
        ((current - baseline.mean) / Math.abs(baseline.mean)) * 100

      // Determine trend from last 7 days vs previous
      const recentValues = values.slice(-7)
      const olderValues = values.slice(0, -7)
      let trend = 'stable'
      if (recentValues.length >= 3 && olderValues.length >= 3) {
        const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length
        const olderAvg = olderValues.reduce((a, b) => a + b, 0) / olderValues.length
        const change = ((recentAvg - olderAvg) / Math.abs(olderAvg)) * 100
        const polarity = METRIC_POLARITY[metricType as string] ?? 'higher_better'
        if (Math.abs(change) > 3) {
          if (polarity === 'higher_better') {
            trend = change > 0 ? 'improving' : 'declining'
          } else if (polarity === 'lower_better') {
            trend = change < 0 ? 'improving' : 'declining'
          } else {
            trend = 'stable'
          }
        }
      }

      metrics.set(metricType as string, {
        current,
        baseline: baseline.mean,
        stdDev: baseline.stdDev,
        trend,
        percentDiff: Math.round(percentDiff * 10) / 10,
      })

      // Contribute to overall score (normalized 0-100 based on distance from baseline)
      const normalizedScore = 50 + Math.max(-50, Math.min(50, percentDiff))
      scoreSum += normalizedScore
      scoreCount++

      // Track latest data
      const lastDate = new Date(dailyValues[dailyValues.length - 1].date)
      if (!latestDate || lastDate > latestDate) latestDate = lastDate
    }
  } catch (e) {
    console.error('Brain: wearable analysis failed:', e)
  }

  const hoursStale = latestDate
    ? (now.getTime() - latestDate.getTime()) / (1000 * 60 * 60)
    : 999

  return {
    metrics,
    overallScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    dataPoints: totalDataPoints,
    staleness: Math.round(hoursStale),
  }
}

/** Fuse wearable + lab data into per-domain assessments */
function fuseDomains(
  labScores: LabScoreEntry[] | null,
  wearable: WearableAssessment,
  latestUpload: { testDate: Date } | null
): Record<string, DomainAssessment> {
  const domains: Record<string, DomainAssessment> = {}

  // Lab recency factor (fresh < 14d = 1.0, decays to 0.3 at 180d)
  let labRecency = 0
  let labWeight = 0
  if (latestUpload) {
    const daysSince = differenceInDays(new Date(), new Date(latestUpload.testDate))
    labRecency = daysSince
    if (daysSince <= 14) labWeight = 1.0
    else if (daysSince <= 30) labWeight = 0.85
    else if (daysSince <= 60) labWeight = 0.7
    else if (daysSince <= 90) labWeight = 0.5
    else if (daysSince <= 180) labWeight = 0.3
    else labWeight = 0.15
  }

  // Lab completeness factor (markers/30, clamped 0.3-1.0)
  const labMarkerCount = labScores?.length ?? 0
  const labCompleteness = Math.max(0.3, Math.min(1.0, labMarkerCount / 30))
  const adjustedLabWeight = labWeight * labCompleteness

  for (const domainKey of ['sleep', 'recovery', 'activity', 'bodyComp', 'bloodwork']) {
    if (domainKey === 'bloodwork') {
      // Bloodwork domain: lab primary
      domains[domainKey] = buildBloodworkDomain(labScores, adjustedLabWeight, labRecency, labMarkerCount)
      continue
    }

    // Wearable-primary domains
    const wearableMetrics = DOMAIN_WEARABLE_METRICS[domainKey] ?? []
    const topSignals: DomainAssessment['topSignals'] = []
    let wearableScoreSum = 0
    let wearableScoreCount = 0
    let overallTrend: string = 'insufficient_data'

    for (const metricType of wearableMetrics) {
      const data = wearable.metrics.get(metricType)
      if (!data) continue

      wearableScoreCount++
      const normalizedScore = 50 + Math.max(-50, Math.min(50, data.percentDiff))
      wearableScoreSum += normalizedScore

      topSignals.push({
        metric: metricType,
        value: data.current,
        vsBaseline: data.percentDiff > 5 ? 'above' : data.percentDiff < -5 ? 'below' : 'normal',
        percentDiff: data.percentDiff,
      })

      if (overallTrend === 'insufficient_data') overallTrend = data.trend
    }

    // Lab contribution for this domain
    let labContribution: DomainAssessment['labContribution'] = null
    if (labScores && adjustedLabWeight > 0) {
      const domainMarkers = DOMAIN_LAB_MARKERS[domainKey] ?? []
      const relevantLabs = labScores.filter(s => domainMarkers.includes(s.biomarkerKey))
      if (relevantLabs.length > 0) {
        labContribution = {
          weight: adjustedLabWeight,
          recency: labRecency,
          markers: relevantLabs.length,
        }
      }
    }

    // Blend wearable + lab scores
    let domainScore: number | null = null
    if (wearableScoreCount > 0) {
      const wearableScore = wearableScoreSum / wearableScoreCount
      if (labContribution) {
        // Weighted blend
        domainScore = Math.round(
          (wearableScore * 1.0 + getLabDomainScore(labScores!, domainKey) * adjustedLabWeight)
          / (1.0 + adjustedLabWeight)
        )
      } else {
        domainScore = Math.round(wearableScore)
      }
    }

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'low'
    if (wearableScoreCount >= 3 && wearable.staleness < 48) confidence = 'high'
    else if (wearableScoreCount >= 1) confidence = 'medium'

    // Sort signals by absolute percentDiff
    topSignals.sort((a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff))

    domains[domainKey] = {
      domain: domainKey,
      score: domainScore,
      confidence,
      trend: (overallTrend === 'insufficient_data' ? 'insufficient_data' : overallTrend) as DomainAssessment['trend'],
      topSignals: topSignals.slice(0, 3),
      labContribution,
      narrative: buildDomainNarrative(domainKey, domainScore, overallTrend, topSignals),
    }
  }

  return domains
}

function buildBloodworkDomain(
  labScores: LabScoreEntry[] | null,
  labWeight: number,
  labRecency: number,
  markerCount: number
): DomainAssessment {
  if (!labScores || labScores.length === 0) {
    return {
      domain: 'bloodwork',
      score: null,
      confidence: 'low',
      trend: 'insufficient_data',
      topSignals: [],
      labContribution: null,
      narrative: 'No bloodwork data available. Upload lab results to see your bloodwork assessment.',
    }
  }

  // Score based on zone distribution
  let scoreSum = 0
  for (const entry of labScores) {
    scoreSum += entry.zone.score
  }
  const avgScore = Math.round(scoreSum / labScores.length)

  // Top concerns (non-optimal markers)
  const concerns = labScores
    .filter(s => s.flag !== 'optimal' && s.flag !== 'normal')
    .sort((a, b) => a.zone.score - b.zone.score)
    .slice(0, 3)

  const topSignals: DomainAssessment['topSignals'] = concerns.map(c => ({
    metric: c.biomarkerKey,
    value: c.value,
    vsBaseline: c.flag === 'low' || c.flag === 'critical_low' ? 'below' : 'above',
    percentDiff: 0,  // Not applicable for point-in-time lab values
  }))

  const optimalCount = labScores.filter(s => s.flag === 'optimal').length
  const optimalPct = Math.round((optimalCount / labScores.length) * 100)

  return {
    domain: 'bloodwork',
    score: avgScore,
    confidence: labWeight >= 0.7 ? 'high' : labWeight >= 0.3 ? 'medium' : 'low',
    trend: 'stable',  // Trend requires multiple draws — computed via baselines
    topSignals,
    labContribution: { weight: labWeight, recency: labRecency, markers: markerCount },
    narrative: `${optimalPct}% of markers optimal (${optimalCount}/${labScores.length}). ` +
      (concerns.length > 0
        ? `${concerns.length} marker${concerns.length > 1 ? 's' : ''} outside optimal range.`
        : 'All markers within optimal range.'),
  }
}

function getLabDomainScore(labScores: LabScoreEntry[], domain: string): number {
  const markers = DOMAIN_LAB_MARKERS[domain] ?? []
  const relevant = labScores.filter(s => markers.includes(s.biomarkerKey))
  if (relevant.length === 0) return 50  // neutral
  return relevant.reduce((sum, s) => sum + s.zone.score, 0) / relevant.length
}

function buildDomainNarrative(
  domain: string,
  score: number | null,
  trend: string,
  signals: DomainAssessment['topSignals']
): string {
  if (score === null) return `Not enough ${domain} data to assess.`

  const trendLabel = trend === 'improving' ? 'trending up' : trend === 'declining' ? 'trending down' : 'steady'
  const scoreLabel = score >= 70 ? 'Strong' : score >= 50 ? 'Moderate' : 'Needs attention'

  const topSignal = signals[0]
  if (topSignal) {
    const direction = topSignal.percentDiff > 0 ? 'up' : 'down'
    return `${scoreLabel} ${domain} — ${trendLabel}. ${topSignal.metric} is ${Math.abs(topSignal.percentDiff)}% ${direction} vs baseline.`
  }

  return `${scoreLabel} ${domain} — ${trendLabel}.`
}

/** Compute aging velocity from 90-day domain score trend */
async function computeAgingVelocity(
  userId: string,
  domains: Record<string, DomainAssessment>
): Promise<AgingVelocityAssessment> {
  // Fetch last 90 days of snapshots
  const snapshots = await prisma.healthBrainSnapshot.findMany({
    where: { userId, evaluatedAt: { gte: subDays(new Date(), 90) } },
    orderBy: { evaluatedAt: 'asc' },
    select: { unifiedScore: true, evaluatedAt: true },
  })

  if (snapshots.length < 7) {
    // Not enough history — use current domains as a single data point
    const currentScores = Object.values(domains).map(d => d.score).filter((s): s is number => s !== null)
    const avgScore = currentScores.length > 0
      ? Math.round(currentScores.reduce((a, b) => a + b, 0) / currentScores.length)
      : null

    return {
      headline: avgScore !== null ? `Health score: ${avgScore}` : 'Building your health picture',
      trend: 'steady',
      confidence: 'low',
      score90d: avgScore,
    }
  }

  // Compute trend: compare first half avg to second half avg
  const scores = snapshots.map(s => s.unifiedScore).filter((s): s is number => s !== null)
  if (scores.length < 4) {
    return { headline: 'Gathering more data', trend: 'steady', confidence: 'low', score90d: null }
  }

  const mid = Math.floor(scores.length / 2)
  const firstHalf = scores.slice(0, mid)
  const secondHalf = scores.slice(mid)
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  const changePct = ((secondAvg - firstAvg) / Math.abs(firstAvg)) * 100

  let trend: AgingVelocityAssessment['trend'] = 'steady'
  let headline: string
  if (changePct > 3) {
    trend = 'decelerating'
    headline = `Aging ${(1 - changePct / 100).toFixed(2)}x — slowing down`
  } else if (changePct < -3) {
    trend = 'accelerating'
    headline = `Aging ${(1 + Math.abs(changePct) / 100).toFixed(2)}x — needs attention`
  } else {
    headline = `Biological age: steady`
  }

  return {
    headline,
    trend,
    confidence: snapshots.length >= 30 ? 'high' : snapshots.length >= 14 ? 'medium' : 'low',
    score90d: Math.round(secondAvg),
  }
}

/** Compute allostatic load from stress indicators */
function computeAllostasis(
  wearable: WearableAssessment,
  domains: Record<string, DomainAssessment>
): AllostasisAssessment {
  const drivers: string[] = []
  let stressScore = 0

  // Check HRV (low = stressed)
  const hrv = wearable.metrics.get('hrv')
  if (hrv && hrv.percentDiff < -10) {
    stressScore += 2
    drivers.push('Low HRV')
  }

  // Check RHR (high = stressed)
  const rhr = wearable.metrics.get('rhr')
  if (rhr && rhr.percentDiff > 10) {
    stressScore += 1.5
    drivers.push('Elevated resting heart rate')
  }

  // Check sleep
  const sleepScore = wearable.metrics.get('sleep_score')
  if (sleepScore && sleepScore.percentDiff < -10) {
    stressScore += 1.5
    drivers.push('Poor sleep')
  }

  // Check recovery domain
  const recovery = domains.recovery
  if (recovery?.score !== null && recovery.score < 40) {
    stressScore += 1
    drivers.push('Low recovery score')
  }

  let load: AllostasisAssessment['load'] = 'low'
  if (stressScore >= 4) load = 'high'
  else if (stressScore >= 2) load = 'moderate'

  return {
    load,
    score: Math.min(10, Math.round(stressScore * 10) / 10),
    drivers,
  }
}

/** Compute risk trajectories from domain scores and lab patterns */
function computeRiskTrajectories(
  domains: Record<string, DomainAssessment>,
  labScores: LabScoreEntry[] | null,
  patterns: LabPattern[]
): Record<string, RiskTrajectoryAssessment> {
  const risks: Record<string, RiskTrajectoryAssessment> = {}

  // Cardiovascular risk
  const cvPatterns = patterns.filter(p =>
    p.patternKey.includes('cardiovascular') || p.patternKey.includes('insulin')
  )
  risks.cardiovascular = {
    level: cvPatterns.length > 0
      ? (cvPatterns.some(p => p.severity === 'urgent') ? 'high' : 'elevated')
      : 'low',
    trend: domains.recovery?.trend === 'declining' ? 'worsening' : 'stable',
    confidence: labScores ? 'medium' : 'low',
  }

  // Metabolic risk
  const metPatterns = patterns.filter(p => p.patternKey.includes('insulin') || p.patternKey.includes('metabolic'))
  risks.metabolic = {
    level: metPatterns.length > 0 ? 'elevated' : 'low',
    trend: 'stable',
    confidence: labScores ? 'medium' : 'low',
  }

  // Inflammation
  const infPatterns = patterns.filter(p => p.patternKey.includes('inflammation'))
  risks.inflammation = {
    level: infPatterns.length > 0 ? 'elevated' : 'low',
    trend: 'stable',
    confidence: labScores ? 'medium' : 'low',
  }

  return risks
}

/** Generate narrative primitives from all assessments */
function generateNarrativePrimitives(
  domains: Record<string, DomainAssessment>,
  agingVelocity: AgingVelocityAssessment,
  protocolEvidence: PremiumProtocolEvidence[],
  bridges: BridgeInsight[]
): NarrativePrimitive[] {
  const primitives: NarrativePrimitive[] = []

  // Headline
  primitives.push({
    type: 'headline',
    text: agingVelocity.headline,
    domain: 'overall',
    priority: 1,
  })

  // Domain summaries
  for (const [key, assessment] of Object.entries(domains)) {
    if (assessment.score !== null) {
      primitives.push({
        type: 'domain_summary',
        text: assessment.narrative,
        domain: key,
        priority: assessment.score < 50 ? 3 : 5,
      })
    }
  }

  // Protocol verdicts
  for (const evidence of protocolEvidence) {
    if (evidence.verdict !== 'too_early') {
      primitives.push({
        type: 'protocol_verdict',
        text: evidence.verdictExplanation,
        domain: 'protocols',
        priority: evidence.verdict === 'strong_positive' ? 2 : 4,
      })
    }
  }

  // Bridge insights
  for (const bridge of bridges.slice(0, 3)) {
    primitives.push({
      type: 'bridge_insight',
      text: `${bridge.title}: ${bridge.connection}`,
      domain: 'cross_domain',
      priority: bridge.priority === 'high' ? 3 : 6,
    })
  }

  return primitives.sort((a, b) => a.priority - b.priority)
}

/** Prioritize actions from all sources */
function prioritizeActions(
  domains: Record<string, DomainAssessment>,
  protocolEvidence: PremiumProtocolEvidence[],
  patterns: LabPattern[],
  bridges: BridgeInsight[]
): PrioritizedAction[] {
  const actions: PrioritizedAction[] = []

  // From declining domains
  for (const [key, assessment] of Object.entries(domains)) {
    if (assessment.trend === 'declining' && assessment.topSignals.length > 0) {
      const topMetric = assessment.topSignals[0].metric
      const recs = getRecommendations(topMetric, 'declining', 'higher_better')
      for (const rec of recs.slice(0, 1)) {
        actions.push({
          text: rec.action,
          priority: rec.priority,
          source: 'domain_trend',
          domain: key,
          timeframe: rec.timeframe,
        })
      }
    }
  }

  // From lab patterns
  for (const pattern of patterns.filter(p => p.detected && p.severity !== 'info')) {
    for (const rec of pattern.recommendations.slice(0, 1)) {
      actions.push({
        text: rec,
        priority: pattern.severity === 'urgent' ? 'high' : pattern.severity === 'action' ? 'high' : 'medium',
        source: 'lab_pattern',
        domain: 'bloodwork',
      })
    }
  }

  // From bridge insights
  for (const bridge of bridges.slice(0, 2)) {
    actions.push({
      text: bridge.actionability,
      priority: bridge.priority === 'high' ? 'high' : 'medium',
      source: 'bridge_insight',
      domain: 'cross_domain',
    })
  }

  // Sort: high > medium > low
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return actions.slice(0, 5)
}

/** Compute system-level confidence */
function computeSystemConfidence(
  labScores: LabScoreEntry[] | null,
  wearable: WearableAssessment,
  domains: Record<string, DomainAssessment>
): SystemConfidence {
  const reasons: string[] = []
  let score = 0

  // Wearable data availability
  if (wearable.dataPoints >= 30) { score += 30; reasons.push('Rich wearable data (30+ data points)') }
  else if (wearable.dataPoints >= 10) { score += 20; reasons.push('Moderate wearable data') }
  else { score += 5; reasons.push('Limited wearable data') }

  // Wearable freshness
  if (wearable.staleness < 24) { score += 15; reasons.push('Wearable data is fresh (< 24h)') }
  else if (wearable.staleness < 72) score += 10
  else reasons.push('Wearable data is stale')

  // Lab data
  if (labScores && labScores.length >= 20) { score += 30; reasons.push(`Comprehensive lab panel (${labScores.length} markers)`) }
  else if (labScores && labScores.length >= 10) { score += 20; reasons.push(`Good lab panel (${labScores.length} markers)`) }
  else if (labScores) { score += 10; reasons.push(`Basic lab panel (${labScores.length} markers)`) }
  else reasons.push('No lab data available')

  // Domain coverage
  const scoredDomains = Object.values(domains).filter(d => d.score !== null).length
  if (scoredDomains >= 4) { score += 15; reasons.push('4+ health domains assessed') }
  else if (scoredDomains >= 2) score += 10
  else reasons.push('Limited domain coverage')

  let level: SystemConfidence['level'] = 'low'
  if (score >= 70) level = 'high'
  else if (score >= 40) level = 'medium'

  return { level, score: Math.min(100, score), reasons }
}

/** Compute unified blended score across all domains */
function computeUnifiedScore(domains: Record<string, DomainAssessment>): number | null {
  let weightedSum = 0
  let totalWeight = 0

  for (const [key, assessment] of Object.entries(domains)) {
    if (assessment.score === null) continue
    const weight = CATEGORY_WEIGHTS[key] ?? 0.1
    weightedSum += assessment.score * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return null
  return Math.round(weightedSum / totalWeight)
}

/** Compute data completeness (0-1) */
function computeDataCompleteness(
  labScores: LabScoreEntry[] | null,
  wearable: WearableAssessment
): number {
  let score = 0
  // Wearable completeness (up to 0.5)
  const wearableRatio = Math.min(1, wearable.metrics.size / 10)
  score += wearableRatio * 0.5
  // Lab completeness (up to 0.5)
  if (labScores) {
    const labRatio = Math.min(1, labScores.length / 30)
    score += labRatio * 0.5
  }
  return Math.round(score * 100) / 100
}

/** Map PremiumProtocolEvidence to our slimmer assessment format */
function mapProtocolEvidence(evidence: PremiumProtocolEvidence): ProtocolEvidenceAssessment {
  const primaryEffect = evidence.effects.primary
  return {
    protocolId: (evidence as any).protocolId ?? '',
    protocolName: evidence.protocolName,
    verdict: evidence.verdict,
    verdictScore: evidence.verdictScore,
    daysOnProtocol: evidence.daysOnProtocol,
    primaryEffect: primaryEffect ? primaryEffect.metricName : null,
    confidenceLevel: evidence.confidence.level,
    topSignals: [
      ...(primaryEffect ? [{
        metric: primaryEffect.metricName,
        direction: primaryEffect.change.direction,
        magnitude: primaryEffect.effect.magnitude,
      }] : []),
      ...evidence.effects.supporting.slice(0, 2).map(s => ({
        metric: s.metricName,
        direction: s.change.direction,
        magnitude: s.effect.magnitude,
      })),
    ],
  }
}

/** Fetch predictions from the latest lab review */
async function fetchPredictions(userId: string): Promise<BrainOutput['predictions']> {
  const review = await prisma.labEventReview.findFirst({
    where: { userId },
    orderBy: { labDate: 'desc' },
    select: { predictions: true },
  })

  if (!review?.predictions) return []

  try {
    const parsed = JSON.parse(review.predictions as string)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 5).map((p: any) => ({
      biomarkerKey: p.biomarkerKey ?? p.marker ?? '',
      predictedValue: p.predictedValue ?? p.value ?? 0,
      confidence: p.confidence ?? 0.5,
      timeframe: p.timeframe ?? '3 months',
    }))
  } catch {
    return []
  }
}

/** Resolve wearable-derived hypotheses using lab data */
async function resolveHypotheses(
  userId: string,
  biomarkers: Array<{ biomarkerKey: string; value: number; flag: string }>
): Promise<number> {
  // Check for common hypothesis resolutions:
  // 1. HRV decline → inflammation? → Check hs-CRP
  // 2. Sleep decline → thyroid? → Check TSH/T3/T4
  // 3. Body comp changes → hormonal? → Check testosterone/cortisol
  let resolved = 0

  const markerMap = new Map(biomarkers.map(b => [b.biomarkerKey, b]))

  // HRV decline + hs-CRP optimal → refutes inflammation hypothesis
  const hsCRP = markerMap.get('hs_crp')
  if (hsCRP && (hsCRP.flag === 'optimal' || hsCRP.flag === 'normal')) {
    resolved++  // Inflammation hypothesis refuted
  }

  // Sleep decline + TSH optimal → refutes thyroid hypothesis
  const tsh = markerMap.get('tsh')
  if (tsh && (tsh.flag === 'optimal' || tsh.flag === 'normal')) {
    resolved++  // Thyroid hypothesis refuted
  }

  // Body comp + testosterone optimal → refutes hormonal hypothesis
  const testosteroneTotal = markerMap.get('total_testosterone')
  if (testosteroneTotal && (testosteroneTotal.flag === 'optimal' || testosteroneTotal.flag === 'normal')) {
    resolved++  // Hormonal hypothesis refuted
  }

  return resolved
}

/** Count wearable signals that would be contradicted/quieted by labs */
function countContradictedSignals(
  biomarkers: Array<{ biomarkerKey: string; value: number; flag: string }>
): number {
  // If labs show optimal values in areas where wearables were signaling concern,
  // those wearable signals are "quieted"
  let quieted = 0
  const optimalMarkers = biomarkers.filter(b => b.flag === 'optimal' || b.flag === 'normal')

  // Each optimal marker in a domain that has wearable correlations quiets potential noise
  for (const marker of optimalMarkers) {
    const def = BIOMARKER_REGISTRY[marker.biomarkerKey]
    if (def?.wearableCorrelations && def.wearableCorrelations.length > 0) {
      quieted++
    }
  }

  return Math.min(quieted, 5)  // Cap at 5
}

// ─── Storage ────────────────────────────────────────────────────────────────

/** Store a snapshot of the Brain output */
async function storeSnapshot(
  userId: string,
  trigger: BrainTrigger,
  output: BrainOutput,
  pipelineMs: number
): Promise<void> {
  try {
    await prisma.healthBrainSnapshot.create({
      data: {
        userId,
        triggerEvent: trigger,
        evaluatedAt: new Date(),
        pipelineMs,
        domainsJson: JSON.stringify(output.domains),
        agingVelocityJson: JSON.stringify(output.agingVelocity),
        allostasisJson: JSON.stringify(output.allostasis),
        riskTrajectoriesJson: JSON.stringify(output.riskTrajectories),
        protocolEvidenceJson: JSON.stringify(output.protocolEvidence),
        predictionsJson: JSON.stringify(output.predictions),
        narrativesJson: JSON.stringify(output.narrativePrimitives),
        actionItemsJson: JSON.stringify(output.actionItems),
        unifiedScore: output.unifiedScore,
        dailyStatusJson: JSON.stringify(output.dailyStatus),
        confidenceJson: JSON.stringify(output.systemConfidence),
        dataCompleteness: output.dataCompleteness,
      },
    })
  } catch (e) {
    console.error('Brain: failed to store snapshot:', e)
  }
}

// ─── Public Readers ─────────────────────────────────────────────────────────

/**
 * Read the latest Brain snapshot without recomputing.
 * Returns null if no snapshot exists.
 */
export async function getLatestSnapshot(userId: string): Promise<BrainOutput | null> {
  const snapshot = await prisma.healthBrainSnapshot.findFirst({
    where: { userId },
    orderBy: { evaluatedAt: 'desc' },
  })

  if (!snapshot) return null

  try {
    return {
      evaluatedAt: snapshot.evaluatedAt.toISOString(),
      trigger: snapshot.triggerEvent as BrainTrigger,
      pipelineMs: snapshot.pipelineMs ?? 0,
      domains: JSON.parse(snapshot.domainsJson),
      agingVelocity: JSON.parse(snapshot.agingVelocityJson),
      allostasis: JSON.parse(snapshot.allostasisJson),
      riskTrajectories: JSON.parse(snapshot.riskTrajectoriesJson),
      protocolEvidence: JSON.parse(snapshot.protocolEvidenceJson),
      predictions: JSON.parse(snapshot.predictionsJson),
      narrativePrimitives: JSON.parse(snapshot.narrativesJson),
      actionItems: JSON.parse(snapshot.actionItemsJson),
      systemConfidence: JSON.parse(snapshot.confidenceJson),
      personalBaselinesUpdated: false,
      unifiedScore: snapshot.unifiedScore,
      dailyStatus: JSON.parse(snapshot.dailyStatusJson),
      dataCompleteness: snapshot.dataCompleteness,
    }
  } catch (e) {
    console.error('Brain: failed to parse snapshot:', e)
    return null
  }
}

/**
 * Check if a snapshot is recent enough to serve.
 */
export function isRecentSnapshot(evaluatedAt: string, maxAgeMs: number): boolean {
  const age = Date.now() - new Date(evaluatedAt).getTime()
  return age < maxAgeMs
}

/**
 * Handle a lab upload event — triggers prior-reset + full evaluation.
 * Call this fire-and-forget from the upload route.
 */
export async function handleLabUpload(userId: string, labUploadId: string): Promise<void> {
  await evaluate(userId, 'lab_upload')
}
