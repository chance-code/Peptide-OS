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
  type PersonalBaselineRecord,
} from './health-personal-baselines'
import { scoreClinicalSignificance, type ClinicalWeight } from './labs/lab-clinical-significance'
import {
  computeCapacitySignals,
  computeLoadSignals,
  computeFatigueSignals,
  computeLabModulation,
  computeVelocityV3,
  type CapacitySignal,
  type FatigueSignal,
  type LoadSignal,
  type VelocityModelOutput,
} from './health-velocity-model'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrainTrigger = 'lab_upload' | 'daily_wearable_sync' | 'protocol_change' | 'manual_refresh' | 'user_refresh'

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
  // Phase 2B additions
  coherence: 'concordant' | 'discordant' | 'lab_only' | 'wearable_only' | null
  personalBaselineComparison: 'above_personal_norm' | 'at_personal_norm' | 'below_personal_norm' | 'insufficient_history'
  trajectoryConfidence: number
  staleness: number  // hours since freshest data for this domain
  recommendations: string[]
}

export interface AgingVelocityAssessment {
  headline: string
  trend: 'decelerating' | 'steady' | 'accelerating'
  confidence: 'high' | 'medium' | 'low'
  score90d: number | null
  // Phase 2B additions
  systemVelocities: Record<string, {
    velocity: number | null
    confidence: number
    trend: 'decelerating' | 'steady' | 'accelerating'
  }>
  overallVelocity: number | null
  daysGainedAnnually: number | null
  concordanceScore: number
  concordanceLabel: 'high' | 'moderate' | 'low'
  // Branded pace model (v2.1)
  overallVelocityCI?: [number, number] | null
  missingDomains?: string[]
  effectiveDomainsCount?: number
  // EWMA smoothing (v2.2)
  note?: string | null
  // Days gained display (v2.3)
  daysGainedAnnuallyBucket?: number | null
  // Velocity-based trend (v2.4)
  trendDirection?: 'improving' | 'worsening' | 'stable'
  delta28d?: number | null
  delta28dDays?: number | null
  topDrivers?: VelocityDriver[]
}

export interface VelocityDriver {
  domain: string
  direction: 'improving' | 'worsening'
  magnitude: number
  plainEnglishReasonHint: string
}

export interface AllostasisAssessment {
  load: 'low' | 'moderate' | 'high'
  score: number
  drivers: string[]
  // Phase 2B additions
  components: Record<string, {
    name: string
    score: number
    deviation: number
    contribution: number
  }>
  trajectory: 'accumulating' | 'stable' | 'recovering'
  dominantContributor: string
  personalContext: string
  recommendation: string
}

export interface RiskTrajectoryAssessment {
  level: 'low' | 'moderate' | 'elevated' | 'high'
  trend: 'improving' | 'stable' | 'worsening'
  confidence: 'high' | 'medium' | 'low'
  // Phase 2B additions
  compositeScore: number
  keyDrivers: Array<{
    biomarkerKey: string
    displayName: string
    personalTrend: string
    contribution: number
  }>
  actionItems: string[]
  nextLabRecommendation: string | null
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
  // Publish pipeline
  publishedVelocity: AgingVelocityAssessment | null
  publishedVelocityAt: string | null
  velocityComputedAt: string
  velocityWindowDays: number
  velocityVersion: string
}

// ─── Stable Velocity Response Types ─────────────────────────────────────────

export interface StableSystemVelocity {
  system: string
  velocity: number | null
  confidence: number
  trend: 'decelerating' | 'steady' | 'accelerating'
}

export interface StableVelocityResponse {
  status: 'published' | 'initializing'
  value: {
    overallVelocityStable: number | null
    daysGainedAnnuallyDisplay: string | null
    daysGainedAnnuallyExact: number | null
    daysGainedAnnuallyLabel: string | null
    systemVelocitiesStable: StableSystemVelocity[]
  }
  meta: {
    publishedAt: string | null
    computedAt: string | null
    windowDays: number
    dataCompletenessScore: number
    confidence: 'high' | 'medium' | 'low'
    concordanceScore: number | null
    version: string
    timezone: string
    overallVelocityCI?: [number, number] | null
    missingDomains?: string[]
    effectiveDomainsCount?: number
    note?: string | null
    trendDirection?: 'improving' | 'worsening' | 'stable'
    delta28d?: number | null
    delta28dDays?: number | null
    topDrivers?: VelocityDriver[]
  }
  // Legacy fields (backwards compatibility with iOS BrainVelocityResponse)
  agingVelocity: AgingVelocityAssessment | null
  evaluatedAt: string | null
}

// ─── Velocity Publish Rules ─────────────────────────────────────────────────

const VELOCITY_PUBLISH_HOUR_UTC = 6

/**
 * Determine whether the daily publish gate is open.
 * Rule A: publish once per day, after 06:00 UTC. If already published today, don't republish.
 */
export function shouldPublishVelocity(
  previousPublishedAt: Date | null,
  now: Date = new Date(),
): boolean {
  const currentHourUTC = now.getUTCHours()

  // Before 06:00 UTC — publish window not open today
  if (currentHourUTC < VELOCITY_PUBLISH_HOUR_UTC) return false

  // Never published — publish now
  if (!previousPublishedAt) return true

  // Already published today (UTC date)?
  const todayUTC = now.toISOString().slice(0, 10)
  const publishedDateUTC = previousPublishedAt.toISOString().slice(0, 10)
  if (publishedDateUTC === todayUTC) return false

  return true
}

/**
 * Check if data is sufficient to publish a velocity number.
 * If overallVelocity is null or data completeness < 20%, don't publish.
 */
export function isVelocityPublishable(velocity: AgingVelocityAssessment, dataCompleteness: number): boolean {
  return velocity.overallVelocity != null && dataCompleteness >= 0.2
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
  metrics: Map<string, {
    current: number; baseline: number; stdDev: number; trend: string; percentDiff: number;
    dailyValues: Array<{ date: string; value: number }>
  }>
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
  cardiovascular: ['rhr', 'hrv', 'vo2_max'],
  metabolic: ['body_fat_percentage', 'weight'],
  inflammatory: ['hrv', 'rhr', 'sleep_score'],
  hormonal: ['deep_sleep', 'lean_body_mass', 'body_fat_percentage'],
  neuro: ['sleep_score', 'deep_sleep', 'sleep_efficiency'],
}

const DOMAIN_LAB_MARKERS: Record<string, string[]> = {
  sleep: ['vitamin_d', 'magnesium'],
  recovery: ['hs_crp', 'cortisol', 'dhea_s'],
  activity: ['hemoglobin', 'ferritin', 'iron'],
  bodyComp: ['total_testosterone', 'free_testosterone', 'tsh', 'free_t3'],
  cardiovascular: ['apolipoprotein_b', 'ldl_cholesterol', 'lipoprotein_a', 'hs_crp', 'homocysteine'],
  metabolic: ['fasting_insulin', 'fasting_glucose', 'hba1c', 'homa_ir', 'triglycerides'],
  inflammatory: ['hs_crp', 'esr', 'homocysteine', 'ferritin'],
  hormonal: ['total_testosterone', 'free_testosterone', 'estradiol', 'cortisol', 'dhea_s', 'tsh'],
  neuro: ['vitamin_b12', 'folate', 'omega_3_index', 'homocysteine', 'vitamin_d'],
  bloodwork: [],  // all markers contribute
}

const CATEGORY_WEIGHTS: Record<string, number> = {
  sleep: 0.15,
  recovery: 0.15,
  activity: 0.12,
  bodyComp: 0.08,
  cardiovascular: 0.12,
  metabolic: 0.12,
  inflammatory: 0.08,
  hormonal: 0.08,
  neuro: 0.05,
  bloodwork: 0.05,
}

// Maps domains to aging velocity system names
const DOMAIN_TO_VELOCITY_SYSTEM: Record<string, string> = {
  cardiovascular: 'cardiovascular',
  metabolic: 'metabolic',
  inflammatory: 'inflammatory',
  activity: 'fitness',
  bodyComp: 'bodyComp',
  hormonal: 'hormonal',
  neuro: 'neuro',
}

// ─── Branded Pace Constants ──────────────────────────────────────────────────

export const VELOCITY_CONFIDENCE_WEIGHTS: Record<string, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
}

export const VELOCITY_STABILITY_WEIGHTS: Record<string, number> = {
  cardiovascular: 0.95,
  metabolic: 1.0,
  inflammatory: 0.95,
  fitness: 0.7,
  bodyComp: 0.8,
  hormonal: 1.0,
  neuro: 0.85,
}

// ─── Pipeline Version ──────────────────────────────────────────────────────
// Bump when mapping, weights, or smoothing logic changes.
export const VELOCITY_PIPELINE_VERSION = '3.0.0'

// ─── Output Safety Bounds ──────────────────────────────────────────────────
const VELOCITY_OUTPUT_MIN = 0.75
const VELOCITY_OUTPUT_MAX = 1.35

/**
 * Piecewise-linear score-to-velocity mapping (branded pace model).
 * Monotonic: higher score → lower velocity (slower aging).
 * Neutral at score=70 (velocity=1.00).
 */
export function scoreToVelocity(score: number): number {
  const clamped = Math.max(0, Math.min(100, score))
  let velocity: number
  if (clamped >= 90) {
    velocity = 0.85
  } else if (clamped >= 70) {
    velocity = 1.00 - ((clamped - 70) / 20) * 0.15
  } else if (clamped >= 40) {
    velocity = 1.15 - ((clamped - 40) / 30) * 0.15
  } else {
    velocity = 1.30 - (clamped / 40) * 0.15
  }
  return Math.round(Math.min(velocity, 1.35) * 100) / 100
}

/**
 * Compute composite weight for a domain in the velocity weighted average.
 * weight = confidenceWeight × completenessWeight × stabilityWeight
 */
export function computeDomainWeight(
  domain: DomainAssessment,
  systemName: string
): number {
  const confidenceWeight = VELOCITY_CONFIDENCE_WEIGHTS[domain.confidence] ?? 0.4
  const labWeight = domain.labContribution?.weight ?? 0
  const baseCompleteness = 0.5 + 0.5 * labWeight
  const staleHours = domain.staleness >= 0 ? domain.staleness : 168
  const freshnessMultiplier = Math.max(0.5, 1.0 - (staleHours / 168) * 0.5)
  const completenessWeight = baseCompleteness * freshnessMultiplier
  const stabilityWeight = VELOCITY_STABILITY_WEIGHTS[systemName] ?? 0.8
  return Math.round(confidenceWeight * completenessWeight * stabilityWeight * 1000) / 1000
}

/**
 * Compute uncertainty margin for the overall velocity.
 * Increases when concordance is low, effective weight sum is low, or key domains are missing.
 */
export function computeVelocityUncertainty(
  concordanceScore: number,
  effectiveWeightSum: number,
  effectiveDomainCount: number,
  totalDomainCount: number
): number {
  const BASE = 0.02
  const concordancePenalty = Math.max(0, (1 - concordanceScore)) * 0.06
  const weightPenalty = Math.max(0, 1 - effectiveWeightSum / 4) * 0.04
  const missingRatio = 1 - effectiveDomainCount / totalDomainCount
  const missingPenalty = missingRatio * 0.05
  const err = BASE + concordancePenalty + weightPenalty + missingPenalty
  return Math.round(Math.min(err, 0.15) * 100) / 100
}

// ─── EWMA Smoothing ─────────────────────────────────────────────────────────

const EWMA_SHOCK_THRESHOLD = 0.12
const EWMA_MAX_DAILY_MOVEMENT = 0.05

/**
 * Compute EWMA alpha based on confidence level and data completeness.
 * Higher alpha = faster response to new data.
 */
export function computeEWMAAlpha(
  confidence: 'high' | 'medium' | 'low',
  dataCompleteness: number
): number {
  if (confidence === 'high' && dataCompleteness >= 0.5) return 0.25
  if (confidence === 'medium' || (confidence === 'high' && dataCompleteness < 0.5)) return 0.18
  return 0.12
}

export interface EWMAResult {
  stableVelocity: number
  wasShockCapped: boolean
  rawDelta: number
}

/**
 * Apply EWMA smoothing to the overall velocity with shock capping.
 * Returns the smoothed stable velocity and whether a shock cap was applied.
 */
export function applyVelocityEWMA(
  prevStable: number,
  computed: number,
  alpha: number
): EWMAResult {
  const rawDelta = computed - prevStable
  const absDelta = Math.abs(rawDelta)

  // Shock handling: if delta > threshold, cap movement
  if (absDelta > EWMA_SHOCK_THRESHOLD) {
    const cappedDelta = Math.sign(rawDelta) * EWMA_MAX_DAILY_MOVEMENT
    const stableVelocity = Math.round((prevStable + cappedDelta) * 100) / 100
    return { stableVelocity, wasShockCapped: true, rawDelta: Math.round(rawDelta * 100) / 100 }
  }

  // Standard EWMA: stable = (1 - alpha) * prevStable + alpha * computed
  const ewma = (1 - alpha) * prevStable + alpha * computed
  const stableVelocity = Math.round(ewma * 100) / 100
  return { stableVelocity, wasShockCapped: false, rawDelta: Math.round(rawDelta * 100) / 100 }
}

// ─── Days Gained Display ────────────────────────────────────────────────────

const DAYS_BUCKET_SIZE = 5
const DAYS_HYSTERESIS_MARGIN = 3

/**
 * Quantize exact days to nearest 5-day bucket with hysteresis.
 * Only changes bucket if exact value crosses the next bucket by >= 3 days.
 */
export function quantizeDaysGained(exactDays: number, prevBucket: number | null): number {
  const naturalBucket = Math.round(exactDays / DAYS_BUCKET_SIZE) * DAYS_BUCKET_SIZE
  if (prevBucket === null) return naturalBucket

  // Hysteresis: only move if we've crossed the next bucket edge by >= margin
  const distFromPrev = Math.abs(exactDays - prevBucket)
  const halfBucket = DAYS_BUCKET_SIZE / 2
  if (distFromPrev < halfBucket + DAYS_HYSTERESIS_MARGIN) {
    return prevBucket
  }
  return naturalBucket
}

/**
 * Format daysDisplay string with copy rules.
 * - Low confidence: "Estimate stabilizing"
 * - Bucket in [-5, +5]: "About neutral"
 * - Otherwise: "+10", "-15", etc.
 */
export function formatDaysDisplay(
  bucket: number,
  confidence: 'high' | 'medium' | 'low'
): string {
  if (confidence === 'low') return 'Estimate stabilizing'
  if (bucket >= -5 && bucket <= 5) return 'About neutral'
  const sign = bucket > 0 ? '+' : ''
  return `${sign}${bucket}`
}

/**
 * Get the label for days gained direction.
 */
export function getDaysGainedLabel(bucket: number): 'Gaining' | 'Neutral' | 'Losing' {
  if (bucket > 5) return 'Gaining'
  if (bucket < -5) return 'Losing'
  return 'Neutral'
}

// ─── Velocity Trend ─────────────────────────────────────────────────────────

export interface VelocityTrendResult {
  trendDirection: 'improving' | 'worsening' | 'stable'
  delta28d: number | null
  delta28dDays: number | null
}

/**
 * Compute 28-day velocity trend from daily published velocity history.
 * Uses 14-day mean comparison: recent 14d vs previous 14d.
 * Lower velocity = improving (aging slower).
 */
export function computeVelocityTrend(
  history: Array<{ date: string; velocity: number }>
): VelocityTrendResult {
  if (history.length < 4) {
    return { trendDirection: 'stable', delta28d: null, delta28dDays: null }
  }

  // Sort by date ascending
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const mid = Math.floor(sorted.length / 2)
  const older = sorted.slice(0, mid)
  const recent = sorted.slice(mid)

  const olderMean = older.reduce((s, e) => s + e.velocity, 0) / older.length
  const recentMean = recent.reduce((s, e) => s + e.velocity, 0) / recent.length

  const delta28d = Math.round((recentMean - olderMean) * 1000) / 1000
  const delta28dDays = Math.round((olderMean - recentMean) * 365) // positive = gaining more days

  // Threshold: 0.005 velocity change is meaningful
  let trendDirection: VelocityTrendResult['trendDirection'] = 'stable'
  if (delta28d < -0.005) trendDirection = 'improving'
  else if (delta28d > 0.005) trendDirection = 'worsening'

  return { trendDirection, delta28d, delta28dDays }
}

const DRIVER_HINTS: Record<string, string> = {
  cardiovascular: 'Heart health markers',
  metabolic: 'Metabolic markers',
  inflammatory: 'Inflammation markers',
  fitness: 'Activity and fitness',
  bodyComp: 'Body composition',
  hormonal: 'Hormone levels',
  neuro: 'Cognitive and neuro markers',
}

/**
 * Compute top domain drivers of velocity change.
 * contribution_i = weight_i * (velocity_i - overallVelocity)
 * Compares current contributions vs previous, returns top movers.
 */
export function computeTopDrivers(
  currentSystems: Record<string, { velocity: number | null; confidence: number }>,
  currentOverall: number,
  previousSystems: Record<string, { velocity: number | null; confidence: number }> | null,
  previousOverall: number | null,
  maxDrivers: number = 3
): VelocityDriver[] {
  if (!previousSystems || previousOverall === null) return []

  const drivers: VelocityDriver[] = []

  for (const [system, current] of Object.entries(currentSystems)) {
    const prev = previousSystems[system]
    if (current.velocity === null || !prev || prev.velocity === null) continue

    const currentContrib = current.confidence * (current.velocity - currentOverall)
    const prevContrib = prev.confidence * (prev.velocity - previousOverall)
    const delta = currentContrib - prevContrib

    if (Math.abs(delta) < 0.005) continue

    drivers.push({
      domain: system,
      direction: delta < 0 ? 'improving' : 'worsening',
      magnitude: Math.round(Math.abs(delta) * 1000) / 1000,
      plainEnglishReasonHint: `${DRIVER_HINTS[system] || system} ${delta < 0 ? 'improved' : 'declined'}`,
    })
  }

  return drivers
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, maxDrivers)
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * The 13-step evaluation pipeline. This is the single source of truth.
 */
export async function evaluate(userId: string, trigger: BrainTrigger): Promise<BrainOutput> {
  const start = Date.now()
  let personalBaselinesUpdated = false

  // Step 0: Fetch personal baselines once (used by multiple steps)
  const personalBaselines = await getPersonalBaselines(userId)

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

  // Step 6b: GP lab forecasting on lab_upload trigger (Phase 3B)
  if (trigger === 'lab_upload') {
    try {
      const { forecastAllBiomarkers } = await import('./health-lab-forecasting')
      await forecastAllBiomarkers(userId)
    } catch (e) {
      console.error('Brain: GP lab forecasting failed:', e)
    }
  }

  // Step 7: Domain fusion — single truth per domain
  const domains = fuseDomains(labScores, wearableAssessment, latestUpload, personalBaselines)

  // Step 8: Aging velocity (v3 — capacity-first, load-conditioned)
  const agingVelocity = await computeAgingVelocity(userId, domains, wearableAssessment, labScores, latestUpload)

  // Step 9: Allostatic load (with personal baselines + active protocol count)
  const activeProtocolCount = await prisma.protocol.count({
    where: { userId, endDate: null },
  })
  const allostasis = await computeAllostasis(wearableAssessment, domains, personalBaselines, activeProtocolCount, userId)

  // Step 10: Risk trajectories (with personal baselines + clinical significance)
  const clinicalWeights = labScores
    ? scoreClinicalSignificance(
        labScores.map(s => ({ biomarkerKey: s.biomarkerKey, value: s.value, flag: s.flag })),
        personalBaselines,
        patterns
      )
    : []
  const riskTrajectories = computeRiskTrajectories(domains, labScores, patterns, personalBaselines, clinicalWeights)

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
    // Publish pipeline — populated after storeSnapshot resolves the gate
    publishedVelocity: null,
    publishedVelocityAt: null,
    velocityComputedAt: new Date().toISOString(),
    velocityWindowDays: 90,
    velocityVersion: VELOCITY_PIPELINE_VERSION,
  }

  // Store snapshot and resolve publish state
  const publishState = await storeSnapshot(userId, trigger, output, pipelineMs)
  output.publishedVelocity = publishState.publishedVelocity
  output.publishedVelocityAt = publishState.publishedAt?.toISOString() ?? null

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

/** Analyze wearable metrics: fetch 90-day window (for capacity slopes), compute baselines */
async function analyzeWearables(userId: string): Promise<WearableAssessment> {
  const now = new Date()
  const ninetyDaysAgo = subDays(now, 90)
  const metrics = new Map<string, {
    current: number; baseline: number; stdDev: number; trend: string; percentDiff: number;
    dailyValues: Array<{ date: string; value: number }>
  }>()

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
      ninetyDaysAgo,
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
        dailyValues: dailyValues.map(d => ({ date: d.date, value: d.value })),
      })

      // Contribute to overall score (normalized 0-100 based on distance from baseline)
      // FIX: Apply polarity correction — for lower_better metrics, flip sign
      const polarity = METRIC_POLARITY[metricType as string] ?? 'higher_better'
      const polarityCorrectedDiff = polarity === 'lower_better' ? -percentDiff : percentDiff
      const normalizedScore = 50 + Math.max(-50, Math.min(50, polarityCorrectedDiff))
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
  latestUpload: { testDate: Date } | null,
  personalBaselines: PersonalBaselineRecord[]
): Record<string, DomainAssessment> {
  const domains: Record<string, DomainAssessment> = {}

  // Build baseline lookup
  const baselineMap = new Map<string, PersonalBaselineRecord>()
  for (const b of personalBaselines) baselineMap.set(b.biomarkerKey, b)

  // Lab recency factor (fresh < 14d = 1.0, decays to 0.3 at 180d)
  let labRecencyDays = 0
  let labRecencyWeight = 0
  if (latestUpload) {
    const daysSince = differenceInDays(new Date(), new Date(latestUpload.testDate))
    labRecencyDays = daysSince
    if (daysSince <= 14) labRecencyWeight = 1.0
    else if (daysSince <= 30) labRecencyWeight = 0.85
    else if (daysSince <= 60) labRecencyWeight = 0.7
    else if (daysSince <= 90) labRecencyWeight = 0.5
    else if (daysSince <= 180) labRecencyWeight = 0.3
    else labRecencyWeight = 0.15
  }

  // Lab completeness factor (markers/30, clamped 0.3-1.0)
  const labMarkerCount = labScores?.length ?? 0
  const labCompleteness = Math.max(0.3, Math.min(1.0, labMarkerCount / 30))
  const adjustedLabWeight = labRecencyWeight * labCompleteness

  const allDomainKeys = [
    'sleep', 'recovery', 'activity', 'bodyComp',
    'cardiovascular', 'metabolic', 'inflammatory', 'hormonal', 'neuro',
    'bloodwork',
  ]

  for (const domainKey of allDomainKeys) {
    if (domainKey === 'bloodwork') {
      const bw = buildBloodworkDomain(labScores, adjustedLabWeight, labRecencyDays, labMarkerCount)
      domains[domainKey] = bw
      continue
    }

    // Wearable component
    const wearableMetrics = DOMAIN_WEARABLE_METRICS[domainKey] ?? []
    const topSignals: DomainAssessment['topSignals'] = []
    let wearableScoreSum = 0
    let wearableScoreCount = 0
    let overallTrend: string = 'insufficient_data'
    let trendCount = 0
    let improvingCount = 0
    let decliningCount = 0

    for (const metricType of wearableMetrics) {
      const data = wearable.metrics.get(metricType)
      if (!data) continue

      wearableScoreCount++
      // FIX: Apply polarity correction in domain scoring
      const metricPolarity = METRIC_POLARITY[metricType] ?? 'higher_better'
      const correctedDiff = metricPolarity === 'lower_better' ? -data.percentDiff : data.percentDiff
      const normalizedScore = 50 + Math.max(-50, Math.min(50, correctedDiff))
      wearableScoreSum += normalizedScore

      topSignals.push({
        metric: metricType,
        value: data.current,
        vsBaseline: data.percentDiff > 5 ? 'above' : data.percentDiff < -5 ? 'below' : 'normal',
        percentDiff: data.percentDiff,
      })

      // Aggregate trend voting
      trendCount++
      if (data.trend === 'improving') improvingCount++
      else if (data.trend === 'declining') decliningCount++
    }

    // Consensus trend from wearable metrics
    if (trendCount > 0) {
      if (improvingCount > decliningCount && improvingCount >= trendCount * 0.5) overallTrend = 'improving'
      else if (decliningCount > improvingCount && decliningCount >= trendCount * 0.5) overallTrend = 'declining'
      else overallTrend = 'stable'
    }

    // Lab component for this domain
    let labContribution: DomainAssessment['labContribution'] = null
    let labDomainScore: number | null = null
    const domainMarkers = DOMAIN_LAB_MARKERS[domainKey] ?? []
    if (labScores && adjustedLabWeight > 0 && domainMarkers.length > 0) {
      const relevantLabs = labScores.filter(s => domainMarkers.includes(s.biomarkerKey))
      if (relevantLabs.length > 0) {
        labContribution = {
          weight: adjustedLabWeight,
          recency: labRecencyDays,
          markers: relevantLabs.length,
        }
        labDomainScore = relevantLabs.reduce((sum, s) => sum + s.zone.score, 0) / relevantLabs.length
      }
    }

    // Blend wearable + lab scores with dynamic weighting
    const wearableScore = wearableScoreCount > 0 ? wearableScoreSum / wearableScoreCount : null
    let domainScore: number | null = null
    if (wearableScore !== null && labDomainScore !== null) {
      domainScore = Math.round(
        (wearableScore * 1.0 + labDomainScore * adjustedLabWeight) / (1.0 + adjustedLabWeight)
      )
    } else if (wearableScore !== null) {
      domainScore = Math.round(wearableScore)
    } else if (labDomainScore !== null) {
      domainScore = Math.round(labDomainScore)
    }

    // Coherence detection
    let coherence: DomainAssessment['coherence'] = null
    if (wearableScore !== null && labDomainScore !== null) {
      const diff = Math.abs(wearableScore - labDomainScore)
      coherence = diff > 15 ? 'discordant' : 'concordant'
    } else if (wearableScore !== null) {
      coherence = 'wearable_only'
    } else if (labDomainScore !== null) {
      coherence = 'lab_only'
    }

    // Personal baseline comparison
    let personalBaselineComparison: DomainAssessment['personalBaselineComparison'] = 'insufficient_history'
    if (domainScore !== null && domainMarkers.length > 0) {
      const relevantBaselines = domainMarkers
        .map(k => baselineMap.get(k))
        .filter((b): b is PersonalBaselineRecord => !!b && b.isPrimary)
      if (relevantBaselines.length > 0) {
        const avgBaselineMean = relevantBaselines.reduce((s, b) => s + b.personalMean, 0) / relevantBaselines.length
        // Compare current lab scores to personal baseline means using zone scoring
        const avgCurrentLabScore = labDomainScore ?? domainScore
        // If domain score is >5% above the personal baseline-derived score, it's above norm
        const baselineScore = avgBaselineMean // Simplified: compare raw scores
        if (avgCurrentLabScore > baselineScore * 1.05) personalBaselineComparison = 'above_personal_norm'
        else if (avgCurrentLabScore < baselineScore * 0.95) personalBaselineComparison = 'below_personal_norm'
        else personalBaselineComparison = 'at_personal_norm'
      }
    }

    // Trajectory confidence
    const trajectoryConfidence = trendCount >= 3 ? 0.8 : trendCount >= 1 ? 0.5 : 0

    // Staleness: hours since freshest data for this domain
    const wearableStaleness = wearable.staleness
    const labStaleness = labRecencyDays * 24
    const domainStaleness = Math.min(
      wearableScoreCount > 0 ? wearableStaleness : 9999,
      labContribution ? labStaleness : 9999
    )

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'low'
    if (wearableScoreCount >= 3 && wearable.staleness < 48) confidence = 'high'
    else if (wearableScoreCount >= 1 || labContribution) confidence = 'medium'

    // Sort signals by absolute percentDiff
    topSignals.sort((a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff))

    // Recommendations for declining signals
    const recommendations: string[] = []
    if (overallTrend === 'declining' && topSignals.length > 0) {
      const recs = getRecommendations(topSignals[0].metric, 'declining', 'higher_better')
      for (const rec of recs.slice(0, 1)) {
        recommendations.push(rec.action)
      }
    }

    domains[domainKey] = {
      domain: domainKey,
      score: domainScore,
      confidence,
      trend: (overallTrend === 'insufficient_data' ? 'insufficient_data' : overallTrend) as DomainAssessment['trend'],
      topSignals: topSignals.slice(0, 3),
      labContribution,
      narrative: buildDomainNarrative(domainKey, domainScore, overallTrend, topSignals),
      coherence,
      personalBaselineComparison,
      trajectoryConfidence,
      staleness: domainStaleness === 9999 ? -1 : domainStaleness,
      recommendations,
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
      coherence: null,
      personalBaselineComparison: 'insufficient_history',
      trajectoryConfidence: 0,
      staleness: -1,
      recommendations: [],
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
    coherence: 'lab_only',
    personalBaselineComparison: 'insufficient_history' as const,
    trajectoryConfidence: 0,
    staleness: labRecency * 24,
    recommendations: concerns.length > 0
      ? [`Review ${concerns[0].biomarkerKey.replace(/_/g, ' ')} levels with your provider`]
      : [],
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

/**
 * Compute aging velocity v3: capacity-first, load-conditioned.
 * Replaces the old scoreToVelocity() path with slope-based capacity signals,
 * load-conditioned fatigue, hard constraints, and Bayesian shrinkage.
 */
async function computeAgingVelocity(
  userId: string,
  domains: Record<string, DomainAssessment>,
  wearable: WearableAssessment,
  labScores: LabScoreEntry[] | null,
  latestUpload: { testDate: Date } | null,
): Promise<AgingVelocityAssessment> {
  // ── v3 Signal Extraction ────────────────────────────────────────────────
  // Build metric data map from wearable daily values
  const metricData = new Map<string, Array<{ date: string; value: number }>>()
  for (const [metricType, data] of wearable.metrics) {
    if (data.dailyValues && data.dailyValues.length > 0) {
      metricData.set(metricType, data.dailyValues)
    }
  }

  // Compute capacity, load, and fatigue signals
  const capacitySignals = computeCapacitySignals(metricData, METRIC_POLARITY)
  const loadSignals = computeLoadSignals(metricData)
  const fatigueSignals = computeFatigueSignals(metricData, loadSignals, capacitySignals, METRIC_POLARITY)

  // Lab recency
  let labRecencyDays = 999
  if (latestUpload) {
    labRecencyDays = differenceInDays(new Date(), new Date(latestUpload.testDate))
  }

  // Build lab score input for velocity model
  const labScoreInput = labScores
    ? labScores.map(s => ({ biomarkerKey: s.biomarkerKey, score: s.zone.score }))
    : null

  // ── v3 Velocity Computation ─────────────────────────────────────────────
  const v3Result = computeVelocityV3({
    capacitySignals,
    fatigueSignals,
    loadSignals,
    labScores: labScoreInput,
    labRecencyDays,
  })

  // ── Map v3 output to AgingVelocityAssessment (backward-compatible) ─────
  const overallVelocity = v3Result.overallVelocity
  const daysGainedAnnually = Math.round((1.0 - overallVelocity) * 365)

  // Build systemVelocities from v3 per-system output
  const systemVelocities: AgingVelocityAssessment['systemVelocities'] = {}
  const missingDomains: string[] = []
  const totalDomainCount = Object.keys(DOMAIN_TO_VELOCITY_SYSTEM).length

  for (const [, systemName] of Object.entries(DOMAIN_TO_VELOCITY_SYSTEM)) {
    const v3System = v3Result.systemVelocities[systemName]
    if (v3System && v3System.velocity !== 1.00) {
      const trend = v3System.trendDirection === 'improving' ? 'decelerating' as const
        : v3System.trendDirection === 'declining' ? 'accelerating' as const
        : 'steady' as const
      systemVelocities[systemName] = {
        velocity: v3System.velocity,
        confidence: v3System.confidence,
        trend,
      }
    } else if (v3System) {
      systemVelocities[systemName] = {
        velocity: v3System.velocity,
        confidence: v3System.confidence,
        trend: 'steady',
      }
    } else {
      systemVelocities[systemName] = { velocity: null, confidence: 0, trend: 'steady' }
      missingDomains.push(systemName)
    }
  }

  // Concordance from v3 system velocities
  const activeVelocities = Object.values(v3Result.systemVelocities)
    .map(s => s.velocity)
    .filter(v => v !== 1.00)
  let concordanceScore = 0
  let concordanceLabel: 'high' | 'moderate' | 'low' = 'low'
  if (activeVelocities.length >= 2) {
    const mean = activeVelocities.reduce((a, b) => a + b, 0) / activeVelocities.length
    const variance = activeVelocities.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / activeVelocities.length
    const stdDev = Math.sqrt(variance)
    concordanceScore = Math.round(Math.max(0, 1 - stdDev / 0.3) * 100) / 100
    if (concordanceScore >= 0.7) concordanceLabel = 'high'
    else if (concordanceScore >= 0.4) concordanceLabel = 'moderate'
  }

  // Effective domains
  const effectiveDomainsCount = Object.values(v3Result.systemVelocities)
    .filter(s => s.confidence > 0).length
  const effectiveWeightSum = Object.values(v3Result.systemVelocities)
    .reduce((s, sv) => s + sv.confidence, 0)

  // Confidence interval
  let overallVelocityCI: [number, number] | null = null
  const err = computeVelocityUncertainty(
    concordanceScore, effectiveWeightSum, effectiveDomainsCount, totalDomainCount
  )
  overallVelocityCI = [
    Math.round((overallVelocity - err) * 100) / 100,
    Math.round((overallVelocity + err) * 100) / 100,
  ]

  // Fetch last 28 days of published velocity history for trend
  const trendSnapshots = await prisma.healthBrainSnapshot.findMany({
    where: {
      userId,
      agingVelocityPublishedAt: { not: null },
      evaluatedAt: { gte: subDays(new Date(), 28) },
    },
    orderBy: { evaluatedAt: 'asc' },
    select: {
      agingVelocityPublishedJson: true,
      agingVelocityPublishedAt: true,
      evaluatedAt: true,
    },
  })

  // Deduplicate by day (keep latest per UTC date)
  const byDay = new Map<string, { date: string; velocity: number; systems: Record<string, { velocity: number | null; confidence: number }> | null; overall: number }>()
  for (const snap of trendSnapshots) {
    try {
      const parsed = JSON.parse(snap.agingVelocityPublishedJson)
      if (parsed.overallVelocity == null) continue
      const day = new Date(snap.evaluatedAt).toISOString().slice(0, 10)
      byDay.set(day, {
        date: day,
        velocity: parsed.overallVelocity,
        systems: parsed.systemVelocities ?? null,
        overall: parsed.overallVelocity,
      })
    } catch { /* skip unparseable */ }
  }

  const velocityHistory = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
  const trendResult = computeVelocityTrend(velocityHistory.map(h => ({ date: h.date, velocity: h.velocity })))

  // Compute top drivers: compare current vs ~7-day-old snapshot
  let topDrivers: VelocityDriver[] = []
  if (overallVelocity !== null && velocityHistory.length >= 7) {
    const olderEntry = velocityHistory[Math.max(0, velocityHistory.length - 8)]
    if (olderEntry.systems) {
      topDrivers = computeTopDrivers(
        systemVelocities,
        overallVelocity,
        olderEntry.systems,
        olderEntry.overall,
      )
    }
  }

  // Map trendDirection → legacy trend field
  const trendDirection = trendResult.trendDirection
  let trend: AgingVelocityAssessment['trend'] = 'steady'
  if (trendDirection === 'improving') trend = 'decelerating'
  else if (trendDirection === 'worsening') trend = 'accelerating'

  // Confidence from snapshot count
  const confidence: AgingVelocityAssessment['confidence'] = velocityHistory.length >= 21 ? 'high'
    : velocityHistory.length >= 10 ? 'medium' : 'low'

  // Score90d from current domain scores
  const currentScores = Object.values(domains).map(d => d.score).filter((s): s is number => s !== null)
  const score90d = currentScores.length > 0
    ? Math.round(currentScores.reduce((a, b) => a + b, 0) / currentScores.length)
    : null

  // Build headline
  let headline: string
  if (overallVelocity !== null && daysGainedAnnually !== null) {
    if (daysGainedAnnually > 0) {
      headline = `Aging at ${overallVelocity.toFixed(2)} years/year — gaining ${daysGainedAnnually} days annually`
    } else if (daysGainedAnnually < 0) {
      headline = `Aging at ${overallVelocity.toFixed(2)} years/year — needs attention`
    } else {
      headline = `Aging at 1.0 years/year — biological age tracking calendar age`
    }
  } else if (score90d !== null) {
    headline = `Health score: ${score90d}`
  } else {
    headline = 'Building your health picture'
  }

  return {
    headline, trend, confidence, score90d,
    systemVelocities, overallVelocity, daysGainedAnnually,
    concordanceScore, concordanceLabel,
    overallVelocityCI, missingDomains, effectiveDomainsCount,
    trendDirection, delta28d: trendResult.delta28d,
    delta28dDays: trendResult.delta28dDays, topDrivers,
  }
}

/** Compute allostatic load from 6 stress components with personal baseline deviations */
async function computeAllostasis(
  wearable: WearableAssessment,
  domains: Record<string, DomainAssessment>,
  personalBaselines: PersonalBaselineRecord[],
  activeProtocolCount: number,
  userId: string
): Promise<AllostasisAssessment> {
  const drivers: string[] = []
  const components: AllostasisAssessment['components'] = {}

  // Build baseline lookup for personal deviation
  const baselineMap = new Map<string, PersonalBaselineRecord>()
  for (const b of personalBaselines) baselineMap.set(b.biomarkerKey, b)

  // Helper: score a component 0-10 from wearable deviations
  const scoreFromDeviation = (metricKey: string, invertPolarity: boolean = false): { score: number; deviation: number } => {
    const data = wearable.metrics.get(metricKey)
    if (!data) return { score: 0, deviation: 0 }
    const pctDiff = data.percentDiff
    // For "higher_better" metrics (HRV, sleep), negative deviation = stress
    // For "lower_better" metrics (RHR), positive deviation = stress
    const stressDirection = invertPolarity ? pctDiff : -pctDiff
    const score = Math.max(0, Math.min(10, stressDirection / 5))
    return { score: Math.round(score * 10) / 10, deviation: Math.round(pctDiff * 10) / 10 }
  }

  // 1. Autonomic: HRV (low = stress) + RHR (high = stress)
  const hrvResult = scoreFromDeviation('hrv')
  const rhrResult = scoreFromDeviation('rhr', true)
  const autonomicScore = Math.round(((hrvResult.score + rhrResult.score) / 2) * 10) / 10
  components.autonomic = {
    name: 'Autonomic Stress',
    score: autonomicScore,
    deviation: hrvResult.deviation,
    contribution: 0,
  }
  if (autonomicScore >= 3) drivers.push('Autonomic stress (HRV/RHR deviation)')

  // 2. Sleep: sleep_score + deep_sleep + sleep_efficiency
  const sleepScoreResult = scoreFromDeviation('sleep_score')
  const deepSleepResult = scoreFromDeviation('deep_sleep')
  const sleepEffResult = scoreFromDeviation('sleep_efficiency')
  const sleepValues = [sleepScoreResult.score, deepSleepResult.score, sleepEffResult.score].filter(v => v > 0)
  const sleepCompScore = sleepValues.length > 0
    ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
    : 0
  components.sleep = {
    name: 'Sleep Disruption',
    score: sleepCompScore,
    deviation: sleepScoreResult.deviation,
    contribution: 0,
  }
  if (sleepCompScore >= 3) drivers.push('Sleep disruption')

  // 3. Body Composition: body_fat, weight trends
  const bfResult = scoreFromDeviation('body_fat_percentage', true) // higher = worse
  const weightResult = scoreFromDeviation('weight', true) // higher = worse
  const bodyCompValues = [bfResult.score, weightResult.score].filter(v => v > 0)
  const bodyCompScore = bodyCompValues.length > 0
    ? Math.round((bodyCompValues.reduce((a, b) => a + b, 0) / bodyCompValues.length) * 10) / 10
    : 0
  components.bodyComp = {
    name: 'Body Composition Stress',
    score: bodyCompScore,
    deviation: bfResult.deviation,
    contribution: 0,
  }
  if (bodyCompScore >= 3) drivers.push('Body composition shift')

  // 4. Recovery: readiness_score
  const readinessResult = scoreFromDeviation('readiness_score')
  const recoveryDomain = domains.recovery
  const recoveryScore = recoveryDomain?.score !== null && recoveryDomain?.score !== undefined
    ? Math.round(Math.max(0, (50 - recoveryDomain.score) / 5) * 10) / 10
    : readinessResult.score
  components.recovery = {
    name: 'Recovery Deficit',
    score: Math.min(10, recoveryScore),
    deviation: readinessResult.deviation,
    contribution: 0,
  }
  if (recoveryScore >= 3) drivers.push('Low recovery')

  // 5. Inflammatory: lab-based (hs-CRP, cortisol personal baselines)
  let inflammatoryScore = 0
  const hsCrpBaseline = baselineMap.get('hs_crp')
  if (hsCrpBaseline && hsCrpBaseline.isPrimary) {
    // Higher than personal mean = inflammatory stress
    const deviation = hsCrpBaseline.lastLabValue
      ? (hsCrpBaseline.lastLabValue - hsCrpBaseline.personalMean) / Math.max(0.1, hsCrpBaseline.personalSD)
      : 0
    inflammatoryScore = Math.max(0, Math.min(10, deviation * 2))
  }
  const cortisolBaseline = baselineMap.get('cortisol')
  if (cortisolBaseline && cortisolBaseline.isPrimary && cortisolBaseline.lastLabValue) {
    const deviation = (cortisolBaseline.lastLabValue - cortisolBaseline.personalMean) / Math.max(0.1, cortisolBaseline.personalSD)
    inflammatoryScore = Math.max(inflammatoryScore, Math.max(0, Math.min(10, deviation * 2)))
  }
  components.inflammatory = {
    name: 'Inflammatory Load',
    score: Math.round(inflammatoryScore * 10) / 10,
    deviation: 0,
    contribution: 0,
  }
  if (inflammatoryScore >= 3) drivers.push('Inflammatory markers elevated vs personal baseline')

  // 6. Protocol Burden: count active protocols × frequency weight
  const protocolBurdenScore = Math.min(10, Math.round(activeProtocolCount * 1.5 * 10) / 10)
  components.protocolBurden = {
    name: 'Protocol Burden',
    score: protocolBurdenScore,
    deviation: activeProtocolCount,
    contribution: 0,
  }
  if (protocolBurdenScore >= 5) drivers.push(`High protocol burden (${activeProtocolCount} active)`)

  // Composite score: weighted average of 6 components
  const componentWeights: Record<string, number> = {
    autonomic: 0.25, sleep: 0.2, bodyComp: 0.1, recovery: 0.2, inflammatory: 0.15, protocolBurden: 0.1,
  }
  let compositeScore = 0
  for (const [key, comp] of Object.entries(components)) {
    const weight = componentWeights[key] ?? 0.1
    comp.contribution = Math.round(comp.score * weight * 100) / 100
    compositeScore += comp.contribution
  }
  compositeScore = Math.round(compositeScore * 10) / 10

  // Load tier
  let load: AllostasisAssessment['load'] = 'low'
  if (compositeScore >= 4) load = 'high'
  else if (compositeScore >= 2) load = 'moderate'

  // Dominant contributor
  const sortedComponents = Object.entries(components).sort((a, b) => b[1].score - a[1].score)
  const dominantContributor = sortedComponents[0]?.[1].name ?? 'None'

  // Trajectory: compare to previous snapshots
  let trajectory: AllostasisAssessment['trajectory'] = 'stable'
  try {
    const prevSnapshots = await prisma.healthBrainSnapshot.findMany({
      where: { userId, evaluatedAt: { gte: subDays(new Date(), 14) } },
      orderBy: { evaluatedAt: 'desc' },
      take: 3,
      select: { allostasisJson: true },
    })
    if (prevSnapshots.length >= 2) {
      const prevScores = prevSnapshots.map(s => {
        try { return JSON.parse(s.allostasisJson)?.score ?? 0 } catch { return 0 }
      })
      const prevAvg = prevScores.reduce((a: number, b: number) => a + b, 0) / prevScores.length
      if (compositeScore > prevAvg + 1) trajectory = 'accumulating'
      else if (compositeScore < prevAvg - 1) trajectory = 'recovering'
    }
  } catch {
    // Non-critical
  }

  // Personal context
  const personalContext = `Your allostatic load of ${compositeScore.toFixed(1)} is ${
    load === 'low' ? 'within a healthy range' : load === 'moderate' ? 'moderately elevated' : 'elevated and needs attention'
  }.`

  // Recommendation
  let recommendation = ''
  if (load === 'high') {
    recommendation = `Focus on ${dominantContributor.toLowerCase()} — consider reducing training load and prioritizing sleep.`
  } else if (load === 'moderate') {
    recommendation = `Monitor ${dominantContributor.toLowerCase()} — small recovery gains will reduce overall load.`
  } else {
    recommendation = 'Your stress-recovery balance is healthy. Maintain current patterns.'
  }

  return {
    load,
    score: compositeScore,
    drivers,
    components,
    trajectory,
    dominantContributor,
    personalContext,
    recommendation,
  }
}

/** Compute risk trajectories across 5 Attia domains + musculoskeletal */
function computeRiskTrajectories(
  domains: Record<string, DomainAssessment>,
  labScores: LabScoreEntry[] | null,
  patterns: LabPattern[],
  personalBaselines: PersonalBaselineRecord[],
  clinicalWeights: ClinicalWeight[]
): Record<string, RiskTrajectoryAssessment> {
  const risks: Record<string, RiskTrajectoryAssessment> = {}

  // Build lookups
  const baselineMap = new Map<string, PersonalBaselineRecord>()
  for (const b of personalBaselines) baselineMap.set(b.biomarkerKey, b)
  const labMap = new Map<string, LabScoreEntry>()
  if (labScores) for (const s of labScores) labMap.set(s.biomarkerKey, s)
  const weightMap = new Map<string, ClinicalWeight>()
  for (const w of clinicalWeights) weightMap.set(w.biomarkerKey, w)

  // Helper: compute a risk domain from marker keys + wearable domain trends
  const computeRiskDomain = (
    domainName: string,
    markerKeys: string[],
    patternKeywords: string[],
    wearableDomainKeys: string[]
  ): RiskTrajectoryAssessment => {
    const keyDrivers: RiskTrajectoryAssessment['keyDrivers'] = []
    let compositeScore = 0
    let driverCount = 0

    // Score from lab markers
    for (const key of markerKeys) {
      const lab = labMap.get(key)
      const baseline = baselineMap.get(key)
      const weight = weightMap.get(key)
      if (!lab) continue

      // Zone score inverted: lower zone score = higher risk contribution
      const riskContribution = Math.max(0, 100 - lab.zone.score)
      compositeScore += riskContribution
      driverCount++

      const def = BIOMARKER_REGISTRY[key]
      let personalTrend = 'no history'
      if (baseline && baseline.isPrimary) {
        if (baseline.trend === 'declining' && def?.polarity === 'higher_better') personalTrend = 'declining from baseline'
        else if (baseline.trend === 'improving') personalTrend = 'improving'
        else if (baseline.trend === 'declining' && def?.polarity === 'lower_better') personalTrend = 'improving (declining)'
        else personalTrend = baseline.trend
      }

      keyDrivers.push({
        biomarkerKey: key,
        displayName: def?.displayName ?? key,
        personalTrend,
        contribution: Math.round(riskContribution),
      })
    }

    // Score from detected patterns
    const relevantPatterns = patterns.filter(p =>
      p.detected && patternKeywords.some(kw => p.patternKey.includes(kw))
    )
    for (const p of relevantPatterns) {
      const patternBoost = p.severity === 'urgent' ? 30 : p.severity === 'action' ? 20 : p.severity === 'attention' ? 10 : 5
      compositeScore += patternBoost
      driverCount++
    }

    // Score from wearable domain trends
    for (const dk of wearableDomainKeys) {
      const domain = domains[dk]
      if (domain?.trend === 'declining') {
        compositeScore += 15
        driverCount++
      }
    }

    // Normalize composite
    const normalizedScore = driverCount > 0 ? Math.round(compositeScore / driverCount) : 0

    // Level from composite
    let level: RiskTrajectoryAssessment['level'] = 'low'
    if (normalizedScore >= 60) level = 'high'
    else if (normalizedScore >= 40) level = 'elevated'
    else if (normalizedScore >= 20) level = 'moderate'

    // Trend from domain trends + baseline trends
    const decliningDrivers = keyDrivers.filter(d => d.personalTrend.includes('declining'))
    const improvingDrivers = keyDrivers.filter(d => d.personalTrend.includes('improving'))
    let trend: RiskTrajectoryAssessment['trend'] = 'stable'
    if (decliningDrivers.length > improvingDrivers.length) trend = 'worsening'
    else if (improvingDrivers.length > decliningDrivers.length) trend = 'improving'

    // Confidence
    const confidence: RiskTrajectoryAssessment['confidence'] =
      driverCount >= 3 ? 'high' : driverCount >= 1 ? 'medium' : 'low'

    // Action items from top drivers
    const actionItems: string[] = []
    const sortedDrivers = [...keyDrivers].sort((a, b) => b.contribution - a.contribution)
    for (const driver of sortedDrivers.slice(0, 2)) {
      if (driver.contribution >= 30) {
        actionItems.push(`Prioritize optimizing ${driver.displayName}`)
      }
    }
    for (const p of relevantPatterns.slice(0, 1)) {
      if (p.recommendations.length > 0) actionItems.push(p.recommendations[0])
    }

    // Next lab recommendation: most stale + highest concern marker
    let nextLabRecommendation: string | null = null
    if (sortedDrivers.length > 0 && sortedDrivers[0].contribution >= 20) {
      nextLabRecommendation = `Retest ${sortedDrivers[0].displayName} on your next panel`
    }

    return {
      level, trend, confidence,
      compositeScore: normalizedScore,
      keyDrivers: sortedDrivers.slice(0, 5),
      actionItems: actionItems.slice(0, 3),
      nextLabRecommendation,
    }
  }

  // 1. Cardiovascular (Attia #1 — atherosclerotic CVD)
  risks.cardiovascular = computeRiskDomain(
    'cardiovascular',
    ['apolipoprotein_b', 'ldl_cholesterol', 'lipoprotein_a', 'hs_crp', 'homocysteine'],
    ['cardiovascular', 'apob_ldl_discordance'],
    ['cardiovascular', 'recovery']
  )

  // 2. Metabolic (Attia #2 — type 2 diabetes / metabolic syndrome)
  risks.metabolic = computeRiskDomain(
    'metabolic',
    ['fasting_insulin', 'fasting_glucose', 'hba1c', 'homa_ir', 'triglycerides', 'trig_hdl_ratio'],
    ['insulin_resistance', 'metabolic'],
    ['metabolic']
  )

  // 3. Cancer (Attia #3 — cancer risk via inflammation + immune + body comp)
  risks.cancer = computeRiskDomain(
    'cancer',
    ['hs_crp', 'esr', 'fasting_insulin'],
    ['inflammation'],
    ['inflammatory', 'bodyComp']
  )

  // 4. Neurodegenerative (Attia #4 — Alzheimer's / cognitive decline)
  risks.neurodegenerative = computeRiskDomain(
    'neurodegenerative',
    ['homocysteine', 'vitamin_b12', 'vitamin_d', 'omega_3_index', 'fasting_insulin'],
    [],
    ['neuro', 'sleep']
  )

  // 5. Musculoskeletal (functional longevity)
  risks.musculoskeletal = computeRiskDomain(
    'musculoskeletal',
    ['vitamin_d', 'total_testosterone', 'free_testosterone'],
    [],
    ['activity', 'bodyComp']
  )

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

/** Store a snapshot of the Brain output with publish pipeline */
async function storeSnapshot(
  userId: string,
  trigger: BrainTrigger,
  output: BrainOutput,
  pipelineMs: number
): Promise<{ publishedVelocity: AgingVelocityAssessment | null; publishedAt: Date | null }> {
  try {
    // Fetch previous snapshot's published state to carry forward
    const previous = await prisma.healthBrainSnapshot.findFirst({
      where: { userId },
      orderBy: { evaluatedAt: 'desc' },
      select: {
        agingVelocityPublishedJson: true,
        agingVelocityPublishedAt: true,
        agingVelocityVersion: true,
      },
    })

    const previousPublishedAt = previous?.agingVelocityPublishedAt ?? null
    const prevVersion = previous?.agingVelocityVersion ?? null
    const versionChanged = prevVersion !== null && prevVersion !== VELOCITY_PIPELINE_VERSION
    const computedAt = new Date()
    const canPublish = isVelocityPublishable(output.agingVelocity, output.dataCompleteness)
    const gateOpen = shouldPublishVelocity(previousPublishedAt)
    // Force publish gate open on pipeline version change — don't anchor to old model's output
    const willPublish = canPublish && (gateOpen || versionChanged)

    let publishedJson: string
    let publishedAt: Date | null

    if (willPublish) {
      // Parse previous published velocity for EWMA
      const prevPublishedStr = previous?.agingVelocityPublishedJson ?? '{}'
      const prevPublished = prevPublishedStr !== '{}'
        ? JSON.parse(prevPublishedStr) as AgingVelocityAssessment
        : null
      const prevStable = prevPublished?.overallVelocity ?? null
      const computedOverall = output.agingVelocity.overallVelocity

      // Apply EWMA smoothing if we have both previous stable and computed values
      // (skipped when pipeline version changed — don't anchor to old model's output)
      let smoothedVelocity = { ...output.agingVelocity }
      const prevBucket = prevPublished?.daysGainedAnnuallyBucket ?? null
      if (prevStable !== null && computedOverall !== null && !versionChanged) {
        const alpha = computeEWMAAlpha(output.agingVelocity.confidence, output.dataCompleteness)
        const ewma = applyVelocityEWMA(prevStable, computedOverall, alpha)

        // Clamp EWMA output to safety bounds
        const clampedStable = Math.round(Math.max(VELOCITY_OUTPUT_MIN, Math.min(VELOCITY_OUTPUT_MAX, ewma.stableVelocity)) * 100) / 100
        if (clampedStable !== Math.round(ewma.stableVelocity * 100) / 100) {
          console.log(JSON.stringify({
            event: 'brain_velocity_guardrail',
            guardrail: 'ewma_output_clamp',
            userId,
            unclamped: ewma.stableVelocity,
            clamped: clampedStable,
            version: VELOCITY_PIPELINE_VERSION,
          }))
        }

        const exactDays = (1.0 - clampedStable) * 365
        const bucket = quantizeDaysGained(exactDays, prevBucket)

        smoothedVelocity = {
          ...output.agingVelocity,
          overallVelocity: clampedStable,
          daysGainedAnnually: Math.round(exactDays),
          daysGainedAnnuallyBucket: bucket,
          note: ewma.wasShockCapped
            ? 'Large data change detected; smoothing applied.'
            : null,
        }

        // Update CI around the clamped stable value
        if (smoothedVelocity.overallVelocityCI && output.agingVelocity.overallVelocityCI) {
          const halfWidth = (output.agingVelocity.overallVelocityCI[1] - output.agingVelocity.overallVelocityCI[0]) / 2
          smoothedVelocity.overallVelocityCI = [
            Math.round((clampedStable - halfWidth) * 100) / 100,
            Math.round((clampedStable + halfWidth) * 100) / 100,
          ]
        }

        console.log(JSON.stringify({
          event: 'brain_velocity_publish',
          userId,
          trigger,
          prevStable,
          computedOverall,
          stableOverall: clampedStable,
          alpha,
          rawDelta: ewma.rawDelta,
          shockCapped: ewma.wasShockCapped,
          daysGainedAnnually: smoothedVelocity.daysGainedAnnually,
          dataCompleteness: output.dataCompleteness,
        }))

        // Audit log: shock cap guardrail
        if (ewma.wasShockCapped) {
          console.log(JSON.stringify({
            event: 'brain_velocity_guardrail',
            guardrail: 'shock_cap',
            userId,
            prevStable,
            computedOverall,
            rawDelta: ewma.rawDelta,
            cappedTo: clampedStable,
            version: VELOCITY_PIPELINE_VERSION,
          }))
        }
      } else {
        // First publish, no computed, or version change — use computed directly, set initial bucket
        if (versionChanged) {
          console.log(JSON.stringify({
            event: 'brain_velocity_version_reset',
            userId,
            prevVersion,
            newVersion: VELOCITY_PIPELINE_VERSION,
            prevStable,
            computedOverall,
          }))
        }
        if (output.agingVelocity.daysGainedAnnually != null) {
          smoothedVelocity.daysGainedAnnuallyBucket = quantizeDaysGained(
            output.agingVelocity.daysGainedAnnually, prevBucket
          )
        }
        console.log(JSON.stringify({
          event: 'brain_velocity_publish',
          userId,
          trigger,
          overallVelocity: output.agingVelocity.overallVelocity,
          daysGainedAnnually: output.agingVelocity.daysGainedAnnually,
          daysGainedAnnuallyBucket: smoothedVelocity.daysGainedAnnuallyBucket,
          dataCompleteness: output.dataCompleteness,
          firstPublish: true,
        }))
      }

      publishedJson = JSON.stringify(smoothedVelocity)
      publishedAt = computedAt
    } else {
      publishedJson = previous?.agingVelocityPublishedJson ?? '{}'
      publishedAt = previousPublishedAt
    }

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
        // Publish pipeline
        agingVelocityPublishedJson: publishedJson,
        agingVelocityPublishedAt: publishedAt,
        agingVelocityComputedAt: computedAt,
        agingVelocityWindowDays: 90,
        agingVelocityVersion: VELOCITY_PIPELINE_VERSION,
      },
    })

    // Resolve published velocity for caller
    const publishedVelocity = publishedJson && publishedJson !== '{}'
      ? JSON.parse(publishedJson) as AgingVelocityAssessment
      : null

    return { publishedVelocity, publishedAt }
  } catch (e) {
    console.error('Brain: failed to store snapshot:', e)
    return { publishedVelocity: null, publishedAt: null }
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
      // Publish pipeline
      publishedVelocity: snapshot.agingVelocityPublishedJson && snapshot.agingVelocityPublishedJson !== '{}'
        ? JSON.parse(snapshot.agingVelocityPublishedJson)
        : null,
      publishedVelocityAt: snapshot.agingVelocityPublishedAt?.toISOString() ?? null,
      velocityComputedAt: snapshot.agingVelocityComputedAt?.toISOString() ?? snapshot.evaluatedAt.toISOString(),
      velocityWindowDays: snapshot.agingVelocityWindowDays ?? 90,
      velocityVersion: snapshot.agingVelocityVersion ?? VELOCITY_PIPELINE_VERSION,
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
