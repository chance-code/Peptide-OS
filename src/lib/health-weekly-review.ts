// Health Weekly Review Generator
// Structured weekly reviews — the "Monday morning debrief" that ties
// protocol adherence to health outcomes. No competitor does this.

import prisma from '@/lib/prisma'
import { subDays, startOfWeek, endOfWeek, format, parseISO, differenceInDays } from 'date-fns'
import { getUnifiedMetrics, type UnifiedDailyMetric } from './health-synthesis'
import { METRIC_POLARITY } from './health-baselines'
import { safePercentChange, safeDivide } from './health-constants'
import { getMetricDef } from './health-metric-contract'
import type { MetricType } from './health-constants'
import { BIOMARKER_REGISTRY } from '@/lib/lab-biomarker-contract'
import { computePremiumEvidence } from './health-evidence-engine'
import { runSafetyMonitor, type SafetyAlert } from './protocol-safety-monitor'
import { getLabExpectationsForProtocol, getRecommendedLabSchedule } from './protocol-lab-expectations'

// ─── Types ───────────────────────────────────────────────────────────

export interface WeeklyReview {
  week: { start: string; end: string }
  headline: string
  subheadline: string

  overall: {
    direction: 'improving' | 'stable' | 'declining' | 'mixed'
    metricsImproving: number
    metricsDeclining: number
    metricsStable: number
  }

  categories: {
    sleep: CategoryBreakdown | null
    recovery: CategoryBreakdown | null
    activity: CategoryBreakdown | null
    bodyComp: CategoryBreakdown | null
    bloodwork: BloodworkBreakdown | null
  }

  protocols: ProtocolWeeklyStatus[]

  topWins: MetricHighlight[]
  needsAttention: MetricHighlight[]
  recommendations: string[]

  // Phase 3A enhancements
  protocolEffectiveness: ProtocolWeeklyEffectiveness[]
  topActions: RankedAction[]
  labStatus: LabStatusSection
  lookAhead: LookAheadSection
  safetyAlerts: SafetyAlert[]
}

export interface CategoryBreakdown {
  name: string
  thisWeekAvg: Record<string, number>
  lastWeekAvg: Record<string, number>
  topMetric: string
  topMetricChange: number
  direction: 'improving' | 'stable' | 'declining' | 'mixed'
  momentum: 'accelerating' | 'steady' | 'decelerating'
  narrative: string
}

export interface ProtocolWeeklyStatus {
  protocolId: string
  protocolName: string
  adherencePercent: number
  dosesCompleted: number
  dosesExpected: number
  daysSinceStart: number
  evidencePhase: 'loading' | 'building' | 'peak' | 'plateau'
  topSignal: string | null
}

export interface MetricHighlight {
  metric: string
  displayName: string
  change: number
  narrative: string
}

export interface BloodworkBreakdown {
  testDate: string
  daysSinceTest: number
  totalMarkers: number
  optimalCount: number
  criticalCount: number
  attentionCount: number
  topConcerns: { biomarkerKey: string; displayName: string; value: number; unit: string; flag: string }[]
  narrative: string
}

// Phase 3A enhanced types

export interface ProtocolWeeklyEffectiveness {
  protocolId: string
  protocolName: string
  wearableVerdict: string
  labVerdict: string | null
  combinedConfidence: 'high' | 'medium' | 'low'
  topSignal: string
  labUpdateNeeded: boolean
}

export interface RankedAction {
  rank: number
  text: string
  impactScore: number
  confidenceScore: number
  actionabilityScore: number
  compositeScore: number
  source: string
  domain: string
}

export interface RetestRecommendation {
  biomarkerKey: string
  displayName: string
  reason: string
  urgency: 'soon' | 'scheduled' | 'routine'
}

export interface LabStatusSection {
  lastDrawDate: string | null
  daysSinceLastDraw: number | null
  staleness: 'current' | 'aging' | 'stale' | 'no_data'
  retestRecommendations: RetestRecommendation[]
  protocolSpecificLabNeeds: string[]
}

export interface LookAheadSection {
  nextWeekFocus: string
  upcomingMilestones: string[]
  labScheduleReminders: string[]
}

export type { SafetyAlert } from './protocol-safety-monitor'

// ─── Constants ───────────────────────────────────────────────────────

const CATEGORY_METRICS: Record<string, string[]> = {
  sleep: ['sleep_duration', 'deep_sleep', 'rem_sleep', 'sleep_efficiency', 'sleep_score'],
  recovery: ['hrv', 'resting_heart_rate', 'blood_oxygen', 'respiratory_rate', 'readiness_score'],
  activity: ['steps', 'active_calories', 'exercise_minutes', 'activity_score'],
  bodyComp: ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass'],
}

// ─── Main Function ───────────────────────────────────────────────────

export async function generateWeeklyReview(
  userId: string,
  weekEndDate?: Date
): Promise<WeeklyReview> {
  const endDate = weekEndDate ?? new Date()
  const weekEnd = endOfWeek(endDate, { weekStartsOn: 1 }) // Monday-based weeks
  const weekStart = startOfWeek(endDate, { weekStartsOn: 1 })
  const prevWeekStart = subDays(weekStart, 7)
  const prevWeekEnd = subDays(weekStart, 1)

  // Fetch this week's and last week's metrics
  const [thisWeekMetrics, lastWeekMetrics] = await Promise.all([
    getUnifiedMetrics(userId, weekStart, weekEnd),
    getUnifiedMetrics(userId, prevWeekStart, prevWeekEnd),
  ])

  // Compute category breakdowns
  const bloodwork = await getBloodworkBreakdown(userId, endDate)
  const categories = {
    sleep: computeCategoryBreakdown('Sleep', 'sleep', thisWeekMetrics, lastWeekMetrics),
    recovery: computeCategoryBreakdown('Recovery', 'recovery', thisWeekMetrics, lastWeekMetrics),
    activity: computeCategoryBreakdown('Activity', 'activity', thisWeekMetrics, lastWeekMetrics),
    bodyComp: computeCategoryBreakdown('Body Composition', 'bodyComp', thisWeekMetrics, lastWeekMetrics),
    bloodwork,
  }

  // Collect all metric changes for wins/concerns
  const allChanges = collectMetricChanges(thisWeekMetrics, lastWeekMetrics)

  const topWins = allChanges
    .filter(c => c.direction === 'improving')
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3)
    .map(c => ({
      metric: c.metricType,
      displayName: c.displayName,
      change: c.change,
      narrative: `${c.displayName} ${c.direction === 'improving' ? 'improved' : 'up'} ${Math.abs(c.change).toFixed(1)}% vs last week`,
    }))

  const wearableAttention = allChanges
    .filter(c => c.direction === 'declining')
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3)
    .map(c => ({
      metric: c.metricType,
      displayName: c.displayName,
      change: c.change,
      narrative: `${c.displayName} ${c.direction === 'declining' ? 'declined' : 'down'} ${Math.abs(c.change).toFixed(1)}% — monitor this week`,
    }))

  // Include critical/flagged lab markers in needsAttention
  const labAttention: MetricHighlight[] = (bloodwork?.topConcerns ?? [])
    .slice(0, 2)
    .map(c => ({
      metric: c.biomarkerKey,
      displayName: c.displayName,
      change: 0,
      narrative: `${c.displayName} is ${c.flag.replace('_', ' ')} at ${c.value} ${c.unit} — discuss with your provider`,
    }))

  const needsAttention = [...labAttention, ...wearableAttention].slice(0, 5)

  // Protocol adherence
  const protocols = await computeProtocolAdherence(userId, weekStart, weekEnd, thisWeekMetrics)

  // Overall direction
  const improving = allChanges.filter(c => c.direction === 'improving').length
  const declining = allChanges.filter(c => c.direction === 'declining').length
  const stable = allChanges.filter(c => c.direction === 'stable').length

  let overallDirection: 'improving' | 'stable' | 'declining' | 'mixed'
  if (improving > declining * 2) overallDirection = 'improving'
  else if (declining > improving * 2) overallDirection = 'declining'
  else if (improving === 0 && declining === 0) overallDirection = 'stable'
  else overallDirection = 'mixed'

  // Generate headline and subheadline
  const headline = generateHeadline(overallDirection, categories, topWins)
  const subheadline = generateSubheadline(improving, declining, stable, protocols)

  // Recommendations
  const recommendations = generateRecommendations(categories, needsAttention, protocols, bloodwork)

  // Phase 3A: Enhanced sections (run concurrently)
  const [protocolEffectiveness, labStatus, safetyResult] = await Promise.all([
    computeProtocolEffectiveness(userId),
    computeLabStatus(userId),
    runSafetyMonitor(userId).catch(() => ({ alerts: [] as SafetyAlert[], protocolsChecked: 0, markersChecked: 0, allClear: true })),
  ])

  // Ranked actions (top 3 by impact × confidence × actionability)
  const topActions = rankActions(needsAttention, recommendations, labStatus, protocolEffectiveness)

  // Look-ahead
  const lookAhead = generateLookAhead(protocols, labStatus)

  return {
    week: {
      start: format(weekStart, 'yyyy-MM-dd'),
      end: format(weekEnd, 'yyyy-MM-dd'),
    },
    headline,
    subheadline,
    overall: {
      direction: overallDirection,
      metricsImproving: improving,
      metricsDeclining: declining,
      metricsStable: stable,
    },
    categories,
    protocols,
    topWins,
    needsAttention,
    recommendations,

    // Phase 3A
    protocolEffectiveness,
    topActions,
    labStatus,
    lookAhead,
    safetyAlerts: safetyResult.alerts,
  }
}

// ─── Category Breakdown ──────────────────────────────────────────────

function computeCategoryBreakdown(
  name: string,
  category: string,
  thisWeek: Map<MetricType, UnifiedDailyMetric[]>,
  lastWeek: Map<MetricType, UnifiedDailyMetric[]>,
): CategoryBreakdown | null {
  const metricTypes = CATEGORY_METRICS[category] ?? []
  const thisWeekAvg: Record<string, number> = {}
  const lastWeekAvg: Record<string, number> = {}
  let hasData = false

  for (const metricType of metricTypes) {
    const thisVals = thisWeek.get(metricType as MetricType)
    const lastVals = lastWeek.get(metricType as MetricType)

    if (thisVals && thisVals.length > 0) {
      thisWeekAvg[metricType] = thisVals.reduce((s, m) => s + m.value, 0) / thisVals.length
      hasData = true
    }
    if (lastVals && lastVals.length > 0) {
      lastWeekAvg[metricType] = lastVals.reduce((s, m) => s + m.value, 0) / lastVals.length
    }
  }

  if (!hasData) return null

  // Find top changing metric
  let topMetric = ''
  let topMetricChange = 0
  let improvingCount = 0
  let decliningCount = 0

  for (const mt of metricTypes) {
    if (thisWeekAvg[mt] == null || lastWeekAvg[mt] == null) continue
    const change = safePercentChange(thisWeekAvg[mt], lastWeekAvg[mt]) ?? 0
    const polarity = METRIC_POLARITY[mt] ?? 'higher_better'
    const isImproving = (polarity === 'higher_better' && change > 2) ||
                        (polarity === 'lower_better' && change < -2)
    const isDeclining = (polarity === 'higher_better' && change < -2) ||
                        (polarity === 'lower_better' && change > 2)

    if (isImproving) improvingCount++
    if (isDeclining) decliningCount++

    if (Math.abs(change) > Math.abs(topMetricChange)) {
      topMetric = mt
      topMetricChange = change
    }
  }

  // Direction
  let direction: 'improving' | 'stable' | 'declining' | 'mixed'
  if (improvingCount > decliningCount && improvingCount > 0) direction = 'improving'
  else if (decliningCount > improvingCount && decliningCount > 0) direction = 'declining'
  else if (improvingCount > 0 && decliningCount > 0) direction = 'mixed'
  else direction = 'stable'

  // Momentum — compare magnitude of this week's change to what it was previously
  // Simplified: use magnitude of top metric change
  const momentum: 'accelerating' | 'steady' | 'decelerating' =
    Math.abs(topMetricChange) > 10 ? 'accelerating' :
    Math.abs(topMetricChange) < 2 ? 'decelerating' : 'steady'

  // Narrative
  const topDef = getMetricDef(topMetric)
  const topName = topDef?.displayName ?? topMetric
  let narrative = `${name} is ${direction}.`
  if (topMetric && Math.abs(topMetricChange) > 1) {
    narrative += ` ${topName} ${topMetricChange > 0 ? 'up' : 'down'} ${Math.abs(topMetricChange).toFixed(1)}% from last week.`
  }

  return {
    name,
    thisWeekAvg,
    lastWeekAvg,
    topMetric,
    topMetricChange,
    direction,
    momentum,
    narrative,
  }
}

// ─── Metric Changes ─────────────────────────────────────────────────

interface MetricChange {
  metricType: string
  displayName: string
  change: number
  direction: 'improving' | 'stable' | 'declining'
}

function collectMetricChanges(
  thisWeek: Map<MetricType, UnifiedDailyMetric[]>,
  lastWeek: Map<MetricType, UnifiedDailyMetric[]>,
): MetricChange[] {
  const changes: MetricChange[] = []

  for (const [metricType, thisVals] of thisWeek) {
    if (thisVals.length < 2) continue
    const lastVals = lastWeek.get(metricType)
    if (!lastVals || lastVals.length < 2) continue

    const thisAvg = thisVals.reduce((s, m) => s + m.value, 0) / thisVals.length
    const lastAvg = lastVals.reduce((s, m) => s + m.value, 0) / lastVals.length
    const change = safePercentChange(thisAvg, lastAvg) ?? 0
    const polarity = METRIC_POLARITY[metricType] ?? 'higher_better'
    const def = getMetricDef(metricType)
    const displayName = def?.displayName ?? metricType

    const stableThreshold = 2
    let direction: 'improving' | 'stable' | 'declining'
    if (Math.abs(change) < stableThreshold) {
      direction = 'stable'
    } else if (polarity === 'higher_better') {
      direction = change > 0 ? 'improving' : 'declining'
    } else if (polarity === 'lower_better') {
      direction = change < 0 ? 'improving' : 'declining'
    } else {
      direction = 'stable'
    }

    changes.push({ metricType, displayName, change, direction })
  }

  return changes
}

// ─── Protocol Adherence ──────────────────────────────────────────────

async function computeProtocolAdherence(
  userId: string,
  weekStart: Date,
  weekEnd: Date,
  thisWeekMetrics: Map<MetricType, UnifiedDailyMetric[]>,
): Promise<ProtocolWeeklyStatus[]> {
  const protocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: 'active',
      startDate: { lte: weekEnd },
    },
    include: {
      peptide: { select: { name: true } },
    },
  })

  const results: ProtocolWeeklyStatus[] = []

  for (const protocol of protocols) {
    const protocolName = protocol.peptide?.name ?? 'Unknown Protocol'
    const startDate = new Date(protocol.startDate)
    const daysSinceStart = differenceInDays(weekEnd, startDate)

    // Compute evidence phase
    let evidencePhase: ProtocolWeeklyStatus['evidencePhase']
    if (daysSinceStart <= 7) evidencePhase = 'loading'
    else if (daysSinceStart <= 21) evidencePhase = 'building'
    else if (daysSinceStart <= 60) evidencePhase = 'peak'
    else evidencePhase = 'plateau'

    // Count dose logs in this week
    const doseLogs = await prisma.doseLog.findMany({
      where: {
        userId,
        protocolId: protocol.id,
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      select: {
        status: true,
      },
    })

    const dosesExpected = doseLogs.length
    const dosesCompleted = doseLogs.filter(d => d.status === 'completed').length
    const adherencePercent = dosesExpected > 0
      ? Math.round((dosesCompleted / dosesExpected) * 100)
      : 0

    // Find top signal: strongest metric this week (by magnitude of value vs typical)
    let topSignal: string | null = null
    const allCategoryMetrics = Object.values(CATEGORY_METRICS).flat()
    let bestMagnitude = 0
    for (const mt of allCategoryMetrics) {
      const vals = thisWeekMetrics.get(mt as MetricType)
      if (!vals || vals.length < 2) continue
      const avg = vals.reduce((s, m) => s + m.value, 0) / vals.length
      const def = getMetricDef(mt)
      const displayName = def?.displayName ?? mt
      // Use number of data points as a proxy for signal strength
      if (vals.length > bestMagnitude) {
        bestMagnitude = vals.length
        topSignal = `${displayName}: ${avg.toFixed(1)} avg this week`
      }
    }

    results.push({
      protocolId: protocol.id,
      protocolName,
      adherencePercent,
      dosesCompleted,
      dosesExpected,
      daysSinceStart,
      evidencePhase,
      topSignal,
    })
  }

  return results
}

// ─── Headline Generation ─────────────────────────────────────────────

function generateHeadline(
  direction: string,
  categories: WeeklyReview['categories'],
  wins: MetricHighlight[],
): string {
  // Find the strongest category
  const catEntries = Object.entries(categories).filter(([_, v]) => v != null) as [string, CategoryBreakdown][]
  const bestCat = catEntries
    .sort((a, b) => {
      const aScore = a[1].direction === 'improving' ? 2 : a[1].direction === 'stable' ? 1 : 0
      const bScore = b[1].direction === 'improving' ? 2 : b[1].direction === 'stable' ? 1 : 0
      return bScore - aScore
    })[0]

  if (direction === 'improving' && bestCat) {
    return `Strong week — ${bestCat[1].name.toLowerCase()} leading the way`
  }
  if (direction === 'declining') {
    return 'Recovery week — some metrics need attention'
  }
  if (direction === 'mixed' && wins.length > 0) {
    return `Mixed signals — ${wins[0].displayName} standout`
  }
  return 'Steady week — holding the line'
}

function generateSubheadline(
  improving: number,
  declining: number,
  stable: number,
  protocols: ProtocolWeeklyStatus[],
): string {
  const parts: string[] = []
  if (improving > 0) parts.push(`${improving} improving`)
  if (declining > 0) parts.push(`${declining} declining`)
  if (stable > 0) parts.push(`${stable} stable`)

  const metricSummary = parts.join(', ')
  const activeProtocols = protocols.filter(p => p.adherencePercent > 0)
  if (activeProtocols.length > 0) {
    const avgAdherence = Math.round(
      activeProtocols.reduce((s, p) => s + p.adherencePercent, 0) / activeProtocols.length
    )
    return `${metricSummary} · ${avgAdherence}% protocol adherence`
  }

  return metricSummary
}

// ─── Recommendations ─────────────────────────────────────────────────

function generateRecommendations(
  categories: WeeklyReview['categories'],
  concerns: MetricHighlight[],
  protocols: ProtocolWeeklyStatus[],
  bloodwork: BloodworkBreakdown | null,
): string[] {
  const recs: string[] = []

  // Lab staleness recommendation (highest priority)
  if (bloodwork && bloodwork.daysSinceTest >= 180) {
    recs.push('Lab results are over 6 months old. Updated bloodwork would improve the accuracy of your health insights.')
  } else if (bloodwork && bloodwork.criticalCount > 0) {
    recs.push(`${bloodwork.criticalCount} lab marker${bloodwork.criticalCount > 1 ? 's' : ''} outside reference range — worth discussing with your healthcare provider.`)
  }

  // Sleep recommendation
  if (categories.sleep?.direction === 'declining') {
    recs.push('Sleep declined this week. Prioritizing sleep duration and a consistent bedtime may help.')
  }

  // Recovery recommendation
  if (categories.recovery?.direction === 'declining') {
    recs.push('Recovery metrics dipped. Lighter training for 2-3 days may help your body recover.')
  }

  // Activity recommendation
  if (categories.activity?.direction === 'declining') {
    recs.push('Activity dropped off. Even a 20-minute walk can help maintain momentum.')
  }

  // Protocol adherence recommendation
  const lowAdherence = protocols.filter(p => p.adherencePercent < 80 && p.dosesExpected > 0)
  if (lowAdherence.length > 0) {
    const names = lowAdherence.map(p => p.protocolName).join(', ')
    recs.push(`Protocol adherence below 80% for ${names}. Consistency is key for measurable effects.`)
  }

  // Top concern recommendation
  if (concerns.length > 0 && recs.length < 3) {
    recs.push(`Watch ${concerns[0].displayName} closely — it's been trending down.`)
  }

  // Lab retest recommendation (lower priority)
  if (bloodwork && bloodwork.daysSinceTest >= 90 && bloodwork.daysSinceTest < 180 && recs.length < 4) {
    recs.push('Lab results are getting stale. Consider scheduling follow-up bloodwork.')
  }

  return recs.slice(0, 5)
}

// ─── Bloodwork Breakdown ────────────────────────────────────────────

async function getBloodworkBreakdown(
  userId: string,
  now: Date,
): Promise<BloodworkBreakdown | null> {
  const latestUpload = await prisma.labUpload.findFirst({
    where: { userId },
    orderBy: { testDate: 'desc' },
    include: { biomarkers: true },
  })

  if (!latestUpload) return null

  const daysSinceTest = differenceInDays(now, latestUpload.testDate)
  const biomarkers = latestUpload.biomarkers

  let optimalCount = 0
  let criticalCount = 0
  let attentionCount = 0

  for (const bm of biomarkers) {
    if (bm.flag === 'optimal') optimalCount++
    else if (bm.flag === 'critical_low' || bm.flag === 'critical_high') criticalCount++
    else if (bm.flag === 'high' || bm.flag === 'low') attentionCount++
  }

  const flaggedMarkers = biomarkers
    .filter(bm => !['optimal', 'normal'].includes(bm.flag))
    .sort((a, b) => {
      const priority = (f: string) => f.startsWith('critical') ? 0 : (f === 'high' || f === 'low') ? 1 : 2
      return priority(a.flag) - priority(b.flag)
    })

  const topConcerns = flaggedMarkers.slice(0, 5).map(bm => {
    const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
    return {
      biomarkerKey: bm.biomarkerKey,
      displayName: def?.displayName ?? bm.rawName ?? bm.biomarkerKey,
      value: bm.value,
      unit: bm.unit,
      flag: bm.flag,
    }
  })

  // Build narrative
  let narrative = `Bloodwork: ${biomarkers.length} markers tested`
  if (optimalCount > 0) narrative += `, ${optimalCount} optimal`
  if (criticalCount > 0) narrative += `, ${criticalCount} outside range`
  if (attentionCount > 0) narrative += `, ${attentionCount} need attention`
  narrative += '.'
  if (daysSinceTest >= 90) narrative += ` Results are ${daysSinceTest} days old.`

  return {
    testDate: format(latestUpload.testDate, 'yyyy-MM-dd'),
    daysSinceTest,
    totalMarkers: biomarkers.length,
    optimalCount,
    criticalCount,
    attentionCount,
    topConcerns,
    narrative,
  }
}

// ─── Phase 3A: Protocol Effectiveness ─────────────────────────────────

async function computeProtocolEffectiveness(
  userId: string
): Promise<ProtocolWeeklyEffectiveness[]> {
  try {
    const evidence = await computePremiumEvidence(userId)
    return evidence.map(e => ({
      protocolId: e.protocolId,
      protocolName: e.protocolName,
      wearableVerdict: e.verdict,
      labVerdict: e.labVerdict ?? null,
      combinedConfidence: e.confidence.level,
      topSignal: e.effects.primary
        ? `${e.effects.primary.metricName}: ${e.effects.primary.change.direction} ${Math.abs(e.effects.primary.change.percent).toFixed(1)}%`
        : (e.labEffects?.[0]
          ? `${e.labEffects[0].displayName}: ${e.labEffects[0].percentChange !== null ? `${e.labEffects[0].percentChange > 0 ? '+' : ''}${e.labEffects[0].percentChange.toFixed(1)}%` : 'pending'}`
          : 'No detectable signal yet'),
      labUpdateNeeded: !e.labEffects || e.labEffects.length === 0 || e.labVerdict === 'lab_insufficient_data',
    }))
  } catch {
    return []
  }
}

// ─── Phase 3A: Lab Status ─────────────────────────────────────────────

async function computeLabStatus(
  userId: string
): Promise<LabStatusSection> {
  // Find most recent lab date from personal baselines
  const latestBaseline = await prisma.personalBaseline.findFirst({
    where: { userId, lastLabDate: { not: null } },
    orderBy: { lastLabDate: 'desc' },
    select: { lastLabDate: true },
  })

  const lastDrawDate = latestBaseline?.lastLabDate ?? null
  const daysSinceLastDraw = lastDrawDate
    ? differenceInDays(new Date(), lastDrawDate)
    : null

  let staleness: LabStatusSection['staleness']
  if (daysSinceLastDraw === null) staleness = 'no_data'
  else if (daysSinceLastDraw <= 30) staleness = 'current'
  else if (daysSinceLastDraw <= 90) staleness = 'aging'
  else staleness = 'stale'

  // Get active protocols and their lab needs
  const activeProtocols = await prisma.protocol.findMany({
    where: { userId, status: 'active' },
    include: { peptide: { select: { name: true, canonicalName: true } } },
  })

  const retestRecommendations: RetestRecommendation[] = []
  const protocolSpecificLabNeeds: string[] = []

  for (const protocol of activeProtocols) {
    const name = protocol.peptide.canonicalName || protocol.peptide.name
    const schedule = getRecommendedLabSchedule(name)
    if (!schedule) continue

    const weeksSinceStart = Math.floor(differenceInDays(new Date(), protocol.startDate) / 7)

    // Check if midpoint labs are due
    if (weeksSinceStart >= schedule.midpoint.weekNumber - 1 && weeksSinceStart <= schedule.midpoint.weekNumber + 2) {
      protocolSpecificLabNeeds.push(
        `${name} is at week ${weeksSinceStart} — midpoint labs recommended (${schedule.midpoint.biomarkers.join(', ')})`
      )
      for (const biomarkerKey of schedule.midpoint.biomarkers) {
        const def = BIOMARKER_REGISTRY[biomarkerKey]
        retestRecommendations.push({
          biomarkerKey,
          displayName: def?.displayName ?? biomarkerKey,
          reason: `${name} midpoint check (week ${schedule.midpoint.weekNumber})`,
          urgency: 'soon',
        })
      }
    }

    // Check if endpoint labs are due
    if (weeksSinceStart >= schedule.endpoint.weekNumber - 1) {
      protocolSpecificLabNeeds.push(
        `${name} is at week ${weeksSinceStart} — endpoint labs recommended (${schedule.endpoint.biomarkers.join(', ')})`
      )
      for (const biomarkerKey of schedule.endpoint.biomarkers) {
        const def = BIOMARKER_REGISTRY[biomarkerKey]
        retestRecommendations.push({
          biomarkerKey,
          displayName: def?.displayName ?? biomarkerKey,
          reason: `${name} endpoint check (week ${schedule.endpoint.weekNumber})`,
          urgency: 'scheduled',
        })
      }
    }
  }

  // Staleness-based recommendations
  if (staleness === 'stale' || staleness === 'no_data') {
    retestRecommendations.push({
      biomarkerKey: 'comprehensive_panel',
      displayName: 'Comprehensive Panel',
      reason: staleness === 'no_data'
        ? 'No lab data on file — a baseline panel will unlock protocol-lab tracking'
        : `Labs are ${daysSinceLastDraw} days old — fresh data will improve all health intelligence`,
      urgency: staleness === 'no_data' ? 'soon' : 'routine',
    })
  }

  // Deduplicate by biomarkerKey (keep highest urgency)
  const urgencyOrder = { soon: 0, scheduled: 1, routine: 2 }
  const dedupedRecs = new Map<string, RetestRecommendation>()
  for (const rec of retestRecommendations) {
    const existing = dedupedRecs.get(rec.biomarkerKey)
    if (!existing || urgencyOrder[rec.urgency] < urgencyOrder[existing.urgency]) {
      dedupedRecs.set(rec.biomarkerKey, rec)
    }
  }

  return {
    lastDrawDate: lastDrawDate ? format(lastDrawDate, 'yyyy-MM-dd') : null,
    daysSinceLastDraw,
    staleness,
    retestRecommendations: Array.from(dedupedRecs.values()).sort(
      (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    ),
    protocolSpecificLabNeeds,
  }
}

// ─── Phase 3A: Ranked Actions ─────────────────────────────────────────

function rankActions(
  needsAttention: MetricHighlight[],
  recommendations: string[],
  labStatus: LabStatusSection,
  protocolEffectiveness: ProtocolWeeklyEffectiveness[]
): RankedAction[] {
  const candidates: RankedAction[] = []

  // From needsAttention (wearable concerns)
  for (const item of needsAttention) {
    candidates.push({
      rank: 0,
      text: item.narrative,
      impactScore: Math.min(100, Math.abs(item.change) * 5),
      confidenceScore: 70,
      actionabilityScore: 60,
      compositeScore: 0,
      source: 'wearable',
      domain: item.metric,
    })
  }

  // From lab retest recommendations
  for (const rec of labStatus.retestRecommendations.slice(0, 3)) {
    candidates.push({
      rank: 0,
      text: `Retest ${rec.displayName}: ${rec.reason}`,
      impactScore: rec.urgency === 'soon' ? 80 : rec.urgency === 'scheduled' ? 60 : 40,
      confidenceScore: 90,
      actionabilityScore: 90,
      compositeScore: 0,
      source: 'lab_status',
      domain: rec.biomarkerKey,
    })
  }

  // From protocol effectiveness (lab updates needed)
  for (const pe of protocolEffectiveness.filter(p => p.labUpdateNeeded)) {
    candidates.push({
      rank: 0,
      text: `${pe.protocolName}: Lab confirmation needed to validate wearable signals`,
      impactScore: 70,
      confidenceScore: 60,
      actionabilityScore: 85,
      compositeScore: 0,
      source: 'protocol_evidence',
      domain: pe.protocolName,
    })
  }

  // From general recommendations
  for (const rec of recommendations.slice(0, 2)) {
    candidates.push({
      rank: 0,
      text: rec,
      impactScore: 50,
      confidenceScore: 60,
      actionabilityScore: 70,
      compositeScore: 0,
      source: 'recommendation',
      domain: 'general',
    })
  }

  // Compute composite scores and rank
  for (const c of candidates) {
    c.compositeScore = (c.impactScore * c.confidenceScore * c.actionabilityScore) / 10000
  }

  candidates.sort((a, b) => b.compositeScore - a.compositeScore)

  return candidates.slice(0, 3).map((c, i) => ({
    ...c,
    rank: i + 1,
  }))
}

// ─── Phase 3A: Look-Ahead ────────────────────────────────────────────

function generateLookAhead(
  protocols: ProtocolWeeklyStatus[],
  labStatus: LabStatusSection
): LookAheadSection {
  const upcomingMilestones: string[] = []
  const labScheduleReminders: string[] = []

  for (const p of protocols) {
    // Check for upcoming phase transitions
    if (p.daysSinceStart >= 5 && p.daysSinceStart <= 9) {
      upcomingMilestones.push(`${p.protocolName} entering building phase this week — early signals may start to emerge`)
    }
    if (p.daysSinceStart >= 19 && p.daysSinceStart <= 23) {
      upcomingMilestones.push(`${p.protocolName} entering peak response window — best time to evaluate`)
    }
    if (p.daysSinceStart >= 55 && p.daysSinceStart <= 63) {
      upcomingMilestones.push(`${p.protocolName} reaching plateau phase — effects should be well-established`)
    }
  }

  // Lab schedule reminders
  for (const need of labStatus.protocolSpecificLabNeeds) {
    labScheduleReminders.push(need)
  }
  if (labStatus.staleness === 'stale') {
    labScheduleReminders.push(`Labs are ${labStatus.daysSinceLastDraw} days old — consider scheduling a draw`)
  }

  // Next week focus
  let nextWeekFocus: string
  if (labStatus.retestRecommendations.some(r => r.urgency === 'soon')) {
    nextWeekFocus = 'Priority: Schedule lab draw for protocol monitoring'
  } else if (upcomingMilestones.length > 0) {
    nextWeekFocus = upcomingMilestones[0]
  } else if (protocols.some(p => p.adherencePercent < 80)) {
    nextWeekFocus = 'Focus on protocol adherence — consistency drives results'
  } else {
    nextWeekFocus = 'Continue current trajectory — consistency is your best tool'
  }

  return {
    nextWeekFocus,
    upcomingMilestones,
    labScheduleReminders,
  }
}
