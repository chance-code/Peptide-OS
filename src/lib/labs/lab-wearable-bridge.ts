// Lab-Wearable Bridge — Connects bloodwork findings to daily wearable data
// This is the killer feature: insights no other app can generate

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, type BiomarkerFlag } from '@/lib/lab-biomarker-contract'
import { type LabPattern } from './lab-analyzer'
import { getLabExpectationsForProtocol, getRecommendedLabSchedule } from '@/lib/protocol-lab-expectations'
import { differenceInDays, subDays, format } from 'date-fns'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BridgeMode = 'reactive' | 'predictive' | 'confirmation' | 'protocol_aware' | 'monitoring'

export interface BridgeInsight {
  bridgeKey: string
  title: string
  narrative: string
  labFindings: Array<{
    biomarkerKey: string
    displayName: string
    value: number
    unit: string
    flag: BiomarkerFlag
  }>
  wearableFindings: Array<{
    metricType: string
    displayName: string
    recentAvg: number
    unit: string
    trend: 'declining' | 'stable' | 'improving'
  }>
  connection: string
  actionability: string
  confidence: 'high' | 'medium' | 'speculative'
  priority: 'high' | 'medium' | 'low'
  mode: BridgeMode
}

// ─── Wearable Data Helpers ──────────────────────────────────────────────────

interface RecentMetricSummary {
  avg: number
  trend: 'declining' | 'stable' | 'improving'
  count: number
  unit: string
}

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  hrv: 'HRV',
  rhr: 'Resting Heart Rate',
  resting_heart_rate: 'Resting Heart Rate',
  deep_sleep: 'Deep Sleep',
  recovery_score: 'Recovery Score',
  readiness_score: 'Readiness Score',
  body_fat_percentage: 'Body Fat %',
  vo2_max: 'VO2 Max',
  exercise_minutes: 'Exercise Minutes',
  sleep_duration: 'Sleep Duration',
  weight: 'Weight',
}

const METRIC_UNITS: Record<string, string> = {
  hrv: 'ms',
  rhr: 'bpm',
  resting_heart_rate: 'bpm',
  deep_sleep: 'min',
  recovery_score: 'score',
  readiness_score: 'score',
  body_fat_percentage: '%',
  vo2_max: 'mL/kg/min',
  exercise_minutes: 'min',
  sleep_duration: 'min',
  weight: 'lbs',
}

async function getRecentMetric(
  userId: string,
  metricType: string,
  windowDays: number = 30
): Promise<RecentMetricSummary | null> {
  const since = new Date()
  since.setDate(since.getDate() - windowDays)

  const metrics = await prisma.healthMetric.findMany({
    where: {
      userId,
      metricType,
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: 'asc' },
    select: { value: true, unit: true, recordedAt: true },
  })

  if (metrics.length < 5) return null // Need sufficient data

  const values = metrics.map(m => m.value)
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length

  // Simple trend detection: compare first half average to second half average
  const midpoint = Math.floor(values.length / 2)
  const firstHalfAvg = values.slice(0, midpoint).reduce((s, v) => s + v, 0) / midpoint
  const secondHalfAvg = values.slice(midpoint).reduce((s, v) => s + v, 0) / (values.length - midpoint)
  const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100

  let trend: 'declining' | 'stable' | 'improving'
  if (Math.abs(changePercent) < 3) {
    trend = 'stable'
  } else if (changePercent > 0) {
    trend = 'improving' // Assumes higher is better — caller should invert for rhr
  } else {
    trend = 'declining'
  }

  return {
    avg: Math.round(avg * 10) / 10,
    trend,
    count: metrics.length,
    unit: METRIC_UNITS[metricType] ?? metrics[0]?.unit ?? '',
  }
}

// ─── Bridge Insight Generators ──────────────────────────────────────────────

type BiomarkerMap = Record<string, { value: number; unit: string; flag: BiomarkerFlag }>

function buildBiomarkerMap(
  biomarkers: Array<{ biomarkerKey: string; value: number; unit: string; flag: BiomarkerFlag }>
): BiomarkerMap {
  const map: BiomarkerMap = {}
  for (const b of biomarkers) map[b.biomarkerKey] = b
  return map
}

async function bridgeHRVMetabolic(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  // Trigger: Elevated fasting insulin + HOMA-IR >2.5 + HRV actually low
  const insulin = map['fasting_insulin']
  const glucose = map['fasting_glucose']
  if (!insulin || !glucose || insulin.value <= 10) return null

  const homaIR = (glucose.value * insulin.value) / 405
  if (homaIR < 2.5) return null

  const hrvData = await getRecentMetric(userId, 'hrv')
  if (!hrvData || hrvData.avg > 40) return null // Only flag if HRV is actually below average

  return {
    bridgeKey: 'hrv_metabolic_ceiling',
    title: 'Metabolic markers may be influencing your HRV',
    narrative: `Your fasting insulin of ${insulin.value.toFixed(1)} µIU/mL and calculated HOMA-IR of ${homaIR.toFixed(2)} are elevated. Your HRV has been averaging ${hrvData.avg} ms over the past 30 days${hrvData.trend === 'declining' ? ' and trending down' : ''}. Research suggests that insulin resistance can influence autonomic nervous system function, which may be a factor in your HRV levels.`,
    labFindings: [
      { biomarkerKey: 'fasting_insulin', displayName: 'Fasting Insulin', ...insulin },
      { biomarkerKey: 'fasting_glucose', displayName: 'Fasting Glucose', ...glucose },
    ],
    wearableFindings: [{
      metricType: 'hrv',
      displayName: 'HRV',
      recentAvg: hrvData.avg,
      unit: hrvData.unit,
      trend: hrvData.trend,
    }],
    connection: 'Elevated insulin levels are associated with increased sympathetic nervous system activity, which can suppress the parasympathetic tone reflected in HRV. Improving insulin sensitivity may support HRV improvement.',
    actionability: 'Discuss metabolic health with your provider. Regular exercise, balanced nutrition, and consistent sleep all support both insulin sensitivity and HRV.',
    confidence: homaIR > 3.5 ? 'high' : 'medium',
    priority: 'high',
    mode: 'reactive',
  }
}

async function bridgeRecoveryInflammation(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const crp = map['hs_crp']
  if (!crp || crp.value <= 3.0) return null // Only flag above reference range

  const recovery = await getRecentMetric(userId, 'recovery_score')
    ?? await getRecentMetric(userId, 'readiness_score')
  if (!recovery || recovery.avg > 70) return null // Only flag if recovery is actually low

  const metricType = recovery.unit === 'score' ? 'recovery_score' : 'readiness_score'

  return {
    bridgeKey: 'recovery_inflammation',
    title: 'Elevated inflammation may be affecting your recovery',
    narrative: `Your hs-CRP of ${crp.value.toFixed(2)} mg/L is above the reference range (0–3.0). Your ${METRIC_DISPLAY_NAMES[metricType] ?? metricType} has been averaging ${recovery.avg}${recovery.trend === 'declining' ? ' and trending down' : ''} over the past 30 days. Elevated inflammation can impact recovery capacity.`,
    labFindings: [
      { biomarkerKey: 'hs_crp', displayName: 'hs-CRP', ...crp },
    ],
    wearableFindings: [{
      metricType,
      displayName: METRIC_DISPLAY_NAMES[metricType] ?? metricType,
      recentAvg: recovery.avg,
      unit: recovery.unit,
      trend: recovery.trend,
    }],
    connection: 'Systemic inflammation (measured by hs-CRP) can impair autonomic recovery. Inflammatory cytokines influence the sympathetic nervous system and may suppress the recovery processes wearables measure.',
    actionability: 'Discuss the hs-CRP elevation with your provider to identify the underlying cause. Sleep, nutrition, and regular exercise all support healthy inflammatory balance.',
    confidence: crp.value > 5.0 ? 'high' : 'medium',
    priority: 'high',
    mode: 'reactive',
  }
}

async function bridgeSleepThyroid(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const tsh = map['tsh']
  const freeT3 = map['free_t3']
  if (!tsh || tsh.value <= 4.0) return null // Only flag if TSH above reference range

  const deepSleep = await getRecentMetric(userId, 'deep_sleep')
  if (!deepSleep || deepSleep.avg > 60) return null // Only flag if deep sleep is actually low

  const findings = [
    { biomarkerKey: 'tsh', displayName: 'TSH', ...tsh },
  ]
  if (freeT3) findings.push({ biomarkerKey: 'free_t3', displayName: 'Free T3', ...freeT3 })

  return {
    bridgeKey: 'sleep_thyroid',
    title: 'Thyroid function may be influencing your sleep quality',
    narrative: `Your TSH of ${tsh.value.toFixed(2)} mIU/L is above the reference range${freeT3 ? ` and Free T3 of ${freeT3.value.toFixed(1)} pg/mL is ${freeT3.value < 2.3 ? 'low' : 'in range'}` : ''}. Your deep sleep has been averaging ${deepSleep.avg} minutes over the past 30 days${deepSleep.trend === 'declining' ? ' and trending down' : ''}. Thyroid hormones influence sleep architecture, particularly deep sleep.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'deep_sleep',
      displayName: 'Deep Sleep',
      recentAvg: deepSleep.avg,
      unit: deepSleep.unit,
      trend: deepSleep.trend,
    }],
    connection: 'Thyroid hormones influence neurotransmitter systems involved in sleep architecture. Reduced thyroid function has been associated with changes in slow-wave sleep patterns.',
    actionability: 'Discuss thyroid function with your provider. If treatment is initiated, tracking deep sleep trends over time can help assess response.',
    confidence: 'medium',
    priority: 'medium',
    mode: 'reactive',
  }
}

async function bridgeBodyCompHormonal(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const freeT = map['free_testosterone']
  const cortisol = map['cortisol']
  const testLow = freeT && freeT.value < 5.0 // Below reference range
  const cortisolHigh = cortisol && cortisol.value > 19.4 // Above reference range

  if (!testLow && !cortisolHigh) return null

  const bodyFat = await getRecentMetric(userId, 'body_fat_percentage')
  const weight = await getRecentMetric(userId, 'weight')
  const wearable = bodyFat ?? weight
  if (!wearable) return null

  const metricType = bodyFat ? 'body_fat_percentage' : 'weight'
  const findings: BridgeInsight['labFindings'] = []
  if (freeT && testLow) findings.push({ biomarkerKey: 'free_testosterone', displayName: 'Free Testosterone', ...freeT })
  if (cortisol && cortisolHigh) findings.push({ biomarkerKey: 'cortisol', displayName: 'Cortisol', ...cortisol })

  return {
    bridgeKey: 'body_comp_hormonal',
    title: 'Hormonal markers may be influencing body composition',
    narrative: `${testLow ? `Your free testosterone of ${freeT!.value.toFixed(1)} pg/mL is below the reference range. ` : ''}${cortisolHigh ? `Your cortisol of ${cortisol!.value.toFixed(1)} µg/dL is above the reference range. ` : ''}Your ${METRIC_DISPLAY_NAMES[metricType]} has been ${wearable.trend === 'stable' ? 'stable' : wearable.trend === 'improving' ? 'improving' : 'trending unfavorably'} over the past 30 days. Hormonal balance influences body composition outcomes.`,
    labFindings: findings,
    wearableFindings: [{
      metricType,
      displayName: METRIC_DISPLAY_NAMES[metricType] ?? metricType,
      recentAvg: wearable.avg,
      unit: wearable.unit,
      trend: wearable.trend,
    }],
    connection: 'Testosterone supports muscle protein synthesis while cortisol promotes catabolism. When these markers are outside reference ranges, body composition changes may be more difficult. Hormonal evaluation can help identify the cause.',
    actionability: 'Discuss these hormonal results with your provider. Sleep, stress management, and exercise all influence hormone levels.',
    confidence: testLow && cortisolHigh ? 'high' : 'medium',
    priority: 'high',
    mode: 'reactive',
  }
}

async function bridgeVO2Cardiovascular(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const apoB = map['apolipoprotein_b']
  const lpa = map['lipoprotein_a']
  const hasRisk = (apoB && apoB.value > 130) || (lpa && lpa.value > 75)
  if (!hasRisk) return null

  const vo2 = await getRecentMetric(userId, 'vo2_max')
  if (!vo2) return null

  const findings: BridgeInsight['labFindings'] = []
  if (apoB && apoB.value > 130) findings.push({ biomarkerKey: 'apolipoprotein_b', displayName: 'ApoB', ...apoB })
  if (lpa && lpa.value > 75) findings.push({ biomarkerKey: 'lipoprotein_a', displayName: 'Lp(a)', ...lpa })

  return {
    bridgeKey: 'vo2_cardiovascular',
    title: 'Your VO2 Max trajectory has a cardiovascular context',
    narrative: `${apoB && apoB.value > 130 ? `Your ApoB of ${Math.round(apoB.value)} mg/dL is above the reference range. ` : ''}${lpa && lpa.value > 75 ? `Your Lp(a) of ${Math.round(lpa.value)} nmol/L is above the risk threshold. ` : ''}Your VO2 Max has been averaging ${vo2.avg} mL/kg/min${vo2.trend === 'declining' ? ' and is trending down' : ''}. These advanced lipid markers provide context for your cardiovascular health.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'vo2_max',
      displayName: 'VO2 Max',
      recentAvg: vo2.avg,
      unit: vo2.unit,
      trend: vo2.trend,
    }],
    connection: 'Elevated atherogenic particles can affect arterial health over time. Lp(a) is genetically determined and is an independent risk factor. These markers are best interpreted by a cardiologist or lipidologist.',
    actionability: 'Discuss these advanced lipid markers with a cardiologist or lipidologist for personalized guidance. Continue regular exercise — it remains cardioprotective regardless of lipid levels.',
    confidence: 'medium',
    priority: 'high',
    mode: 'reactive',
  }
}

async function bridgeRHRIron(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const hemoglobin = map['hemoglobin']
  const ferritin = map['ferritin']
  const ironLow = (hemoglobin && hemoglobin.value < 12.6) || (ferritin && ferritin.value < 30)
  if (!ironLow) return null

  const rhrData = await getRecentMetric(userId, 'rhr')
    ?? await getRecentMetric(userId, 'resting_heart_rate')
  if (!rhrData || rhrData.avg < 65) return null // Only flag if RHR is actually elevated

  // For RHR, a higher trend = declining health (invert)
  const rhrTrend = rhrData.trend === 'improving' ? 'declining' : rhrData.trend === 'declining' ? 'improving' : 'stable'

  const findings: BridgeInsight['labFindings'] = []
  if (hemoglobin && hemoglobin.value < 12.6) findings.push({ biomarkerKey: 'hemoglobin', displayName: 'Hemoglobin', ...hemoglobin })
  if (ferritin && ferritin.value < 30) findings.push({ biomarkerKey: 'ferritin', displayName: 'Ferritin', ...ferritin })

  return {
    bridgeKey: 'rhr_iron',
    title: 'Iron status may be influencing your resting heart rate',
    narrative: `${hemoglobin && hemoglobin.value < 12.6 ? `Your hemoglobin of ${hemoglobin.value.toFixed(1)} g/dL is below the reference range` : `Your ferritin of ${ferritin!.value.toFixed(0)} ng/mL is below the reference range`}. Your resting heart rate has been averaging ${rhrData.avg} bpm${rhrTrend === 'declining' ? ' and has been trending up' : ''} over the past 30 days. Low iron can lead to compensatory increases in heart rate.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'rhr',
      displayName: 'Resting Heart Rate',
      recentAvg: rhrData.avg,
      unit: rhrData.unit,
      trend: rhrTrend as 'declining' | 'stable' | 'improving',
    }],
    connection: 'Iron is essential for hemoglobin production. When hemoglobin is low, the cardiovascular system may compensate by increasing heart rate to maintain oxygen delivery.',
    actionability: 'Discuss iron supplementation with your provider. Monitoring your resting heart rate trend can help assess response to treatment.',
    confidence: hemoglobin && hemoglobin.value < 10 ? 'high' : 'medium',
    priority: rhrTrend === 'declining' ? 'high' : 'medium',
    mode: 'reactive',
  }
}

async function bridgeActivityNutrient(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const vitD = map['vitamin_d']
  const mg = map['magnesium'] ?? map['rbc_magnesium']
  const b12 = map['vitamin_b12']

  let depletionCount = 0
  const findings: BridgeInsight['labFindings'] = []
  if (vitD && vitD.value < 30) {
    depletionCount++
    findings.push({ biomarkerKey: 'vitamin_d', displayName: 'Vitamin D', ...vitD })
  }
  if (mg && (mg.value < 1.6 || (map['rbc_magnesium'] && mg.value < 4.0))) {
    depletionCount++
    const key = map['rbc_magnesium'] ? 'rbc_magnesium' : 'magnesium'
    findings.push({ biomarkerKey: key, displayName: BIOMARKER_REGISTRY[key]?.displayName ?? key, ...mg })
  }
  if (b12 && b12.value < 232) {
    depletionCount++
    findings.push({ biomarkerKey: 'vitamin_b12', displayName: 'Vitamin B12', ...b12 })
  }

  if (depletionCount < 2) return null

  const exercise = await getRecentMetric(userId, 'exercise_minutes')
  if (!exercise) return null

  return {
    bridgeKey: 'activity_nutrient',
    title: 'Nutrient deficiencies may be affecting your energy and activity',
    narrative: `${findings.map(f => `${f.displayName}: ${f.value} ${f.unit}`).join(', ')} — multiple nutrients are below their reference ranges. Your exercise minutes have been averaging ${exercise.avg} min/day over the past 30 days${exercise.trend === 'declining' ? ' and trending down' : ''}. These nutrients are important cofactors for energy production and recovery.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'exercise_minutes',
      displayName: 'Exercise Minutes',
      recentAvg: exercise.avg,
      unit: exercise.unit,
      trend: exercise.trend,
    }],
    connection: 'Vitamin D, magnesium, and B12 are cofactors for energy production, muscle function, and red blood cell formation. Deficiencies are common and generally straightforward to address with supplementation.',
    actionability: 'Discuss targeted supplementation with your provider based on which nutrients are deficient. Retest in 3 months to confirm improvement.',
    confidence: depletionCount >= 3 ? 'high' : 'medium',
    priority: exercise.trend === 'declining' ? 'high' : 'medium',
    mode: 'reactive',
  }
}

// ─── Predictive Mode (wearable → lab suggestion) ─────────────────────────────

// Wearable trend thresholds that suggest confirmatory labwork
const WEARABLE_LAB_SUGGESTIONS: Array<{
  metricType: string
  threshold: { direction: 'decline' | 'increase'; percent: number; windowDays: number }
  suggestedLabs: Array<{ biomarkerKey: string; displayName: string; rationale: string }>
}> = [
  {
    metricType: 'hrv',
    threshold: { direction: 'decline', percent: 15, windowDays: 21 },
    suggestedLabs: [
      { biomarkerKey: 'hs_crp', displayName: 'hs-CRP', rationale: 'Sustained HRV decline may reflect systemic inflammation' },
      { biomarkerKey: 'cortisol', displayName: 'Cortisol', rationale: 'Chronic stress can suppress parasympathetic tone' },
      { biomarkerKey: 'fasting_insulin', displayName: 'Fasting Insulin', rationale: 'Insulin resistance is associated with reduced HRV' },
    ],
  },
  {
    metricType: 'resting_heart_rate',
    threshold: { direction: 'increase', percent: 10, windowDays: 21 },
    suggestedLabs: [
      { biomarkerKey: 'tsh', displayName: 'TSH', rationale: 'Thyroid dysfunction can alter resting heart rate' },
      { biomarkerKey: 'hemoglobin', displayName: 'Hemoglobin', rationale: 'Anemia causes compensatory heart rate increase' },
      { biomarkerKey: 'ferritin', displayName: 'Ferritin', rationale: 'Iron deficiency can elevate resting heart rate' },
    ],
  },
  {
    metricType: 'deep_sleep',
    threshold: { direction: 'decline', percent: 20, windowDays: 28 },
    suggestedLabs: [
      { biomarkerKey: 'tsh', displayName: 'TSH', rationale: 'Thyroid hormones influence sleep architecture' },
      { biomarkerKey: 'free_t3', displayName: 'Free T3', rationale: 'Low T3 is associated with reduced deep sleep' },
      { biomarkerKey: 'cortisol', displayName: 'Cortisol', rationale: 'Elevated evening cortisol can disrupt sleep stages' },
    ],
  },
]

async function generatePredictiveInsights(userId: string): Promise<BridgeInsight[]> {
  const insights: BridgeInsight[] = []

  for (const suggestion of WEARABLE_LAB_SUGGESTIONS) {
    const recentWindow = Math.min(suggestion.threshold.windowDays, 7)
    const baselineWindow = suggestion.threshold.windowDays

    const [recent, baseline] = await Promise.all([
      getRecentMetric(userId, suggestion.metricType, recentWindow),
      getRecentMetric(userId, suggestion.metricType, baselineWindow),
    ])

    if (!recent || !baseline || baseline.avg === 0) continue

    const changePercent = ((recent.avg - baseline.avg) / baseline.avg) * 100
    const isTriggered = suggestion.threshold.direction === 'decline'
      ? changePercent < -suggestion.threshold.percent
      : changePercent > suggestion.threshold.percent

    if (!isTriggered) continue

    const directionWord = suggestion.threshold.direction === 'decline' ? 'declined' : 'increased'
    const labList = suggestion.suggestedLabs.map(l => l.displayName).join(', ')

    insights.push({
      bridgeKey: `predictive_${suggestion.metricType}`,
      title: `${METRIC_DISPLAY_NAMES[suggestion.metricType] ?? suggestion.metricType} trend suggests considering labwork`,
      narrative: `Your ${METRIC_DISPLAY_NAMES[suggestion.metricType] ?? suggestion.metricType} has ${directionWord} ${Math.abs(Math.round(changePercent))}% over the past ${baselineWindow} days. This sustained change may have underlying causes that could show up in bloodwork. Consider discussing ${labList} with your provider.`,
      labFindings: [],
      wearableFindings: [{
        metricType: suggestion.metricType,
        displayName: METRIC_DISPLAY_NAMES[suggestion.metricType] ?? suggestion.metricType,
        recentAvg: recent.avg,
        unit: recent.unit,
        trend: recent.trend,
      }],
      connection: suggestion.suggestedLabs.map(l => `${l.displayName}: ${l.rationale}`).join('. '),
      actionability: `Consider requesting ${labList} at your next provider visit to investigate this trend.`,
      confidence: 'speculative',
      priority: 'medium',
      mode: 'predictive',
    })
  }

  return insights
}

// ─── Confirmation Mode (lab → wearable explanation) ──────────────────────────

// Maps abnormal lab findings to wearable metrics that could corroborate
const LAB_WEARABLE_CORROBORATION: Array<{
  biomarkerKey: string
  displayName: string
  abnormalCondition: (value: number) => boolean
  corroboratingMetrics: Array<{
    metricType: string
    expectedTrend: 'declining' | 'improving'
    explanation: string
  }>
}> = [
  {
    biomarkerKey: 'tsh',
    displayName: 'TSH',
    abnormalCondition: (v) => v > 4.0,
    corroboratingMetrics: [
      { metricType: 'deep_sleep', expectedTrend: 'declining', explanation: 'Elevated TSH may explain your reduced deep sleep, as thyroid hormones regulate sleep architecture' },
      { metricType: 'resting_heart_rate', expectedTrend: 'declining', explanation: 'Elevated TSH is consistent with a lower resting heart rate, as hypothyroidism slows cardiac function' },
    ],
  },
  {
    biomarkerKey: 'free_testosterone',
    displayName: 'Free Testosterone',
    abnormalCondition: (v) => v < 5.0,
    corroboratingMetrics: [
      { metricType: 'recovery_score', expectedTrend: 'declining', explanation: 'Low free testosterone may be contributing to reduced recovery, as testosterone supports muscle repair and autonomic balance' },
      { metricType: 'body_fat_percentage', expectedTrend: 'improving', explanation: 'Low free testosterone is associated with increased body fat accumulation' },
    ],
  },
  {
    biomarkerKey: 'ferritin',
    displayName: 'Ferritin',
    abnormalCondition: (v) => v < 30,
    corroboratingMetrics: [
      { metricType: 'resting_heart_rate', expectedTrend: 'improving', explanation: 'Low ferritin may explain your elevated resting heart rate, as iron deficiency causes compensatory cardiac output' },
      { metricType: 'exercise_minutes', expectedTrend: 'declining', explanation: 'Low ferritin can reduce exercise tolerance due to impaired oxygen transport' },
    ],
  },
  {
    biomarkerKey: 'hs_crp',
    displayName: 'hs-CRP',
    abnormalCondition: (v) => v > 3.0,
    corroboratingMetrics: [
      { metricType: 'hrv', expectedTrend: 'declining', explanation: 'Elevated hs-CRP may explain your HRV decline, as systemic inflammation suppresses parasympathetic tone' },
      { metricType: 'recovery_score', expectedTrend: 'declining', explanation: 'Elevated hs-CRP may be impacting your recovery capacity through inflammatory pathways' },
    ],
  },
]

async function generateConfirmationInsights(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight[]> {
  const insights: BridgeInsight[] = []

  for (const corr of LAB_WEARABLE_CORROBORATION) {
    const labValue = map[corr.biomarkerKey]
    if (!labValue || !corr.abnormalCondition(labValue.value)) continue

    for (const metric of corr.corroboratingMetrics) {
      const wearableData = await getRecentMetric(userId, metric.metricType)
      if (!wearableData) continue

      // For RHR, improving = higher values, so invert the trend interpretation
      const isRHR = metric.metricType === 'rhr' || metric.metricType === 'resting_heart_rate'
      const effectiveTrend = isRHR
        ? (wearableData.trend === 'improving' ? 'declining' : wearableData.trend === 'declining' ? 'improving' : 'stable')
        : wearableData.trend

      // Only generate insight if the wearable trend matches the expected direction
      if (effectiveTrend !== metric.expectedTrend) continue

      insights.push({
        bridgeKey: `confirmation_${corr.biomarkerKey}_${metric.metricType}`,
        title: `${corr.displayName} result may explain your ${METRIC_DISPLAY_NAMES[metric.metricType] ?? metric.metricType} trend`,
        narrative: `Your ${corr.displayName} of ${labValue.value} ${labValue.unit} is outside the reference range, and your ${METRIC_DISPLAY_NAMES[metric.metricType] ?? metric.metricType} has been trending ${wearableData.trend === 'declining' ? 'down' : 'up'}. ${metric.explanation}.`,
        labFindings: [{
          biomarkerKey: corr.biomarkerKey,
          displayName: corr.displayName,
          ...labValue,
        }],
        wearableFindings: [{
          metricType: metric.metricType,
          displayName: METRIC_DISPLAY_NAMES[metric.metricType] ?? metric.metricType,
          recentAvg: wearableData.avg,
          unit: wearableData.unit,
          trend: wearableData.trend,
        }],
        connection: metric.explanation,
        actionability: `Discuss this finding with your provider. If ${corr.displayName} is addressed, monitoring your ${METRIC_DISPLAY_NAMES[metric.metricType] ?? metric.metricType} trend can help assess response.`,
        confidence: 'medium',
        priority: 'medium',
        mode: 'confirmation',
      })
    }
  }

  return insights
}

// ─── Protocol-Aware Mode (protocol + wearable → lab recommendation) ──────────

async function generateProtocolAwareInsights(userId: string): Promise<BridgeInsight[]> {
  const insights: BridgeInsight[] = []

  // Get active protocols
  const activeProtocols = await prisma.protocol.findMany({
    where: { userId, status: 'active' },
    include: { peptide: { select: { name: true, canonicalName: true } } },
  })

  for (const protocol of activeProtocols) {
    const protocolName = protocol.peptide.canonicalName || protocol.peptide.name
    const expectations = getLabExpectationsForProtocol(protocolName)
    if (!expectations) continue

    const weeksSinceStart = Math.floor(differenceInDays(new Date(), protocol.startDate) / 7)

    // Check if any expected wearable-correlated effects are showing up
    for (const effect of expectations.expectedLabEffects) {
      // Map lab effects to wearable proxies
      const wearableProxy = LAB_TO_WEARABLE_PROXY[effect.biomarkerKey]
      if (!wearableProxy) continue

      const wearableData = await getRecentMetric(userId, wearableProxy.metricType)
      if (!wearableData) continue

      // Check if we're within the expected onset window
      if (weeksSinceStart < effect.onsetWeeks.min) continue

      // Check if wearable signal is trending in the expected direction
      const expectedWearableTrend = effect.expectedDirection === 'increase'
        ? wearableProxy.whenIncreasing
        : wearableProxy.whenDecreasing

      if (wearableData.trend !== expectedWearableTrend) continue

      // Wearable signal matches expected protocol effect — suggest confirmatory labs
      insights.push({
        bridgeKey: `protocol_aware_${protocol.id}_${effect.biomarkerKey}`,
        title: `Wearable signal aligns with expected ${protocolName} effect`,
        narrative: `You've been on ${protocolName} for ${weeksSinceStart} weeks. Your ${METRIC_DISPLAY_NAMES[wearableProxy.metricType] ?? wearableProxy.metricType} has been ${wearableData.trend === 'improving' ? 'improving' : 'trending in the expected direction'}, which is consistent with ${effect.displayName} ${effect.expectedDirection === 'increase' ? 'increasing' : 'decreasing'}. Confirmatory labwork could verify this effect.`,
        labFindings: [],
        wearableFindings: [{
          metricType: wearableProxy.metricType,
          displayName: METRIC_DISPLAY_NAMES[wearableProxy.metricType] ?? wearableProxy.metricType,
          recentAvg: wearableData.avg,
          unit: wearableData.unit,
          trend: wearableData.trend,
        }],
        connection: `${effect.mechanism}. Expected ${effect.expectedDirection} of ${effect.magnitudeRange.min}-${effect.magnitudeRange.max}% in ${effect.biomarkerKey} by weeks ${effect.onsetWeeks.min}-${effect.peakWeeks.max}.`,
        actionability: `Consider requesting ${effect.displayName} at your next lab draw to confirm whether ${protocolName} is producing the expected effect.`,
        confidence: 'speculative',
        priority: weeksSinceStart >= effect.onsetWeeks.max ? 'high' : 'medium',
        mode: 'protocol_aware',
      })
    }
  }

  return insights
}

// Map lab biomarkers to wearable proxy metrics for protocol-aware mode
const LAB_TO_WEARABLE_PROXY: Record<string, {
  metricType: string
  whenIncreasing: 'improving' | 'declining'
  whenDecreasing: 'improving' | 'declining'
}> = {
  igf_1: { metricType: 'recovery_score', whenIncreasing: 'improving', whenDecreasing: 'declining' },
  hs_crp: { metricType: 'hrv', whenIncreasing: 'declining', whenDecreasing: 'improving' },
  hba1c: { metricType: 'hrv', whenIncreasing: 'declining', whenDecreasing: 'improving' },
  fasting_glucose: { metricType: 'hrv', whenIncreasing: 'declining', whenDecreasing: 'improving' },
  fasting_insulin: { metricType: 'hrv', whenIncreasing: 'declining', whenDecreasing: 'improving' },
  free_testosterone: { metricType: 'recovery_score', whenIncreasing: 'improving', whenDecreasing: 'declining' },
}

// ─── Continuous Monitoring Mode (staleness + protocol → retest) ──────────────

async function generateMonitoringInsights(userId: string): Promise<BridgeInsight[]> {
  const insights: BridgeInsight[] = []

  // Check days since last lab draw
  const latestUpload = await prisma.labUpload.findFirst({
    where: { userId },
    orderBy: { testDate: 'desc' },
    select: { testDate: true },
  })

  const daysSinceLastDraw = latestUpload
    ? differenceInDays(new Date(), latestUpload.testDate)
    : null

  // Get active protocols with lab expectations
  const activeProtocols = await prisma.protocol.findMany({
    where: { userId, status: 'active' },
    include: { peptide: { select: { name: true, canonicalName: true } } },
  })

  const protocolsWithExpectations = activeProtocols
    .map(p => ({
      protocol: p,
      name: p.peptide.canonicalName || p.peptide.name,
      expectations: getLabExpectationsForProtocol(p.peptide.canonicalName || p.peptide.name),
      weeksSinceStart: Math.floor(differenceInDays(new Date(), p.startDate) / 7),
    }))
    .filter(p => p.expectations !== null)

  if (protocolsWithExpectations.length === 0) return insights

  // Check each protocol's recommended lab schedule
  for (const { protocol, name, expectations, weeksSinceStart } of protocolsWithExpectations) {
    if (!expectations) continue
    const schedule = expectations.recommendedLabSchedule

    // Check if we're near a midpoint or endpoint lab window
    const nearMidpoint = Math.abs(weeksSinceStart - schedule.midpoint.weekNumber) <= 2
    const nearEndpoint = Math.abs(weeksSinceStart - schedule.endpoint.weekNumber) <= 2
    const pastMidpointNoLab = weeksSinceStart > schedule.midpoint.weekNumber + 2
      && daysSinceLastDraw !== null
      && daysSinceLastDraw > (schedule.midpoint.weekNumber * 7)

    if (!nearMidpoint && !nearEndpoint && !pastMidpointNoLab) continue

    let timepoint: string
    let biomarkers: string[]
    let urgency: 'high' | 'medium'

    if (nearEndpoint) {
      timepoint = 'endpoint'
      biomarkers = schedule.endpoint.biomarkers
      urgency = 'high'
    } else if (nearMidpoint) {
      timepoint = 'midpoint'
      biomarkers = schedule.midpoint.biomarkers
      urgency = 'medium'
    } else {
      timepoint = 'overdue midpoint'
      biomarkers = schedule.midpoint.biomarkers
      urgency = 'high'
    }

    const biomarkerNames = biomarkers
      .map(k => BIOMARKER_REGISTRY[k]?.displayName ?? k)
      .join(', ')

    const staleNote = daysSinceLastDraw !== null
      ? ` It's been ${daysSinceLastDraw} days since your last lab draw.`
      : ' No previous lab draws on file.'

    insights.push({
      bridgeKey: `monitoring_${protocol.id}_${timepoint}`,
      title: `${name}: ${timepoint} labs recommended`,
      narrative: `You're at week ${weeksSinceStart} of ${name}, which is ${nearEndpoint ? 'the endpoint evaluation window' : nearMidpoint ? 'the midpoint check-in window' : 'past the recommended midpoint check'}.${staleNote} Recommended labs: ${biomarkerNames}.`,
      labFindings: [],
      wearableFindings: [],
      connection: `The ${timepoint} lab panel for ${name} helps assess whether the protocol is producing expected effects and monitors safety markers.`,
      actionability: `Schedule a lab draw including ${biomarkerNames} to evaluate your ${name} protocol progress.`,
      confidence: 'high',
      priority: urgency,
      mode: 'monitoring',
    })
  }

  return insights
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Generate bridge insights connecting lab results to wearable data.
 * Supports multiple modes: reactive (lab+wearable), predictive (wearable→lab),
 * confirmation (lab→wearable), protocol_aware, and monitoring (staleness+protocol).
 *
 * @param userId - The user's ID
 * @param biomarkers - The parsed lab biomarkers (required for reactive + confirmation modes)
 * @param patterns - Optional pre-computed patterns from lab-analyzer
 * @param options - Optional mode filter; defaults to all modes
 * @returns Array of bridge insights, sorted by priority
 */
export async function generateBridgeInsights(
  userId: string,
  biomarkers: Array<{ biomarkerKey: string; value: number; unit: string; flag: BiomarkerFlag }>,
  _patterns?: LabPattern[],
  options?: { modes?: BridgeMode[] }
): Promise<BridgeInsight[]> {
  const modes = options?.modes ?? ['reactive', 'predictive', 'confirmation', 'protocol_aware', 'monitoring']
  const map = buildBiomarkerMap(biomarkers)

  const generators: Promise<(BridgeInsight | null)[] | BridgeInsight[]>[] = []

  // Reactive mode: existing 7 bridges that require both lab + wearable data
  if (modes.includes('reactive')) {
    generators.push(
      Promise.all([
        bridgeHRVMetabolic(userId, map),
        bridgeRecoveryInflammation(userId, map),
        bridgeSleepThyroid(userId, map),
        bridgeBodyCompHormonal(userId, map),
        bridgeVO2Cardiovascular(userId, map),
        bridgeRHRIron(userId, map),
        bridgeActivityNutrient(userId, map),
      ])
    )
  }

  // Predictive mode: wearable trends → lab suggestions (no biomarker input needed)
  if (modes.includes('predictive')) {
    generators.push(generatePredictiveInsights(userId))
  }

  // Confirmation mode: abnormal labs → wearable corroboration
  if (modes.includes('confirmation') && biomarkers.length > 0) {
    generators.push(generateConfirmationInsights(userId, map))
  }

  // Protocol-aware mode: active protocols + wearable → lab recommendations
  if (modes.includes('protocol_aware')) {
    generators.push(generateProtocolAwareInsights(userId))
  }

  // Monitoring mode: lab staleness + protocol schedules → retest reminders
  if (modes.includes('monitoring')) {
    generators.push(generateMonitoringInsights(userId))
  }

  // Run all selected modes concurrently
  const allResults = await Promise.all(generators)
  const flatResults = allResults.flat()

  // Filter nulls and sort by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return flatResults
    .filter((r): r is BridgeInsight => r !== null)
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}
