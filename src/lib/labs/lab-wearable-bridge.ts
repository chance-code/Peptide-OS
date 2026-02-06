// Lab-Wearable Bridge — Connects bloodwork findings to daily wearable data
// This is the killer feature: insights no other app can generate

import prisma from '@/lib/prisma'
import { BIOMARKER_REGISTRY, type BiomarkerFlag } from '@/lib/lab-biomarker-contract'
import { type LabPattern } from './lab-analyzer'

// ─── Types ──────────────────────────────────────────────────────────────────

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
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Generate bridge insights connecting lab results to wearable data.
 * @param userId - The user's ID (for querying wearable data)
 * @param biomarkers - The parsed lab biomarkers
 * @param patterns - Optional pre-computed patterns from lab-analyzer
 * @returns Array of bridge insights, sorted by priority
 */
export async function generateBridgeInsights(
  userId: string,
  biomarkers: Array<{ biomarkerKey: string; value: number; unit: string; flag: BiomarkerFlag }>,
  _patterns?: LabPattern[]
): Promise<BridgeInsight[]> {
  const map = buildBiomarkerMap(biomarkers)

  // Run all bridge generators concurrently
  const results = await Promise.all([
    bridgeHRVMetabolic(userId, map),
    bridgeRecoveryInflammation(userId, map),
    bridgeSleepThyroid(userId, map),
    bridgeBodyCompHormonal(userId, map),
    bridgeVO2Cardiovascular(userId, map),
    bridgeRHRIron(userId, map),
    bridgeActivityNutrient(userId, map),
  ])

  // Filter nulls and sort by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return results
    .filter((r): r is BridgeInsight => r !== null)
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}
