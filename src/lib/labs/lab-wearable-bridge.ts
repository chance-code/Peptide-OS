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
  // Trigger: Elevated fasting insulin + HOMA-IR >1.5 + HRV in bottom range
  const insulin = map['fasting_insulin']
  const glucose = map['fasting_glucose']
  if (!insulin || !glucose || insulin.value <= 5) return null

  const homaIR = (glucose.value * insulin.value) / 405
  if (homaIR < 1.0) return null

  const hrvData = await getRecentMetric(userId, 'hrv')
  if (!hrvData) return null

  return {
    bridgeKey: 'hrv_metabolic_ceiling',
    title: 'Your HRV ceiling is being set by your metabolic health',
    narrative: `Your fasting insulin of ${insulin.value.toFixed(1)} µIU/mL and calculated HOMA-IR of ${homaIR.toFixed(2)} indicate insulin resistance. Your HRV has been averaging ${hrvData.avg} ms over the past 30 days${hrvData.trend === 'declining' ? ' and trending down' : ''}. Insulin resistance impairs autonomic flexibility — even with perfect sleep and training, HRV has a biochemical ceiling until metabolic markers improve.`,
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
    connection: 'Hyperinsulinemia drives sympathetic nervous system dominance, suppressing the parasympathetic tone that produces high HRV. Improving insulin sensitivity has been shown to increase HRV within 8-12 weeks.',
    actionability: 'Focus on improving insulin sensitivity through time-restricted eating, resistance training, and sleep optimization. Retest insulin and HOMA-IR in 3 months and compare with HRV trends.',
    confidence: homaIR > 2.0 ? 'high' : 'medium',
    priority: 'high',
  }
}

async function bridgeRecoveryInflammation(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const crp = map['hs_crp']
  if (!crp || crp.value <= 1.0) return null

  const recovery = await getRecentMetric(userId, 'recovery_score')
    ?? await getRecentMetric(userId, 'readiness_score')
  if (!recovery) return null

  const metricType = recovery.unit === 'score' ? 'recovery_score' : 'readiness_score'

  return {
    bridgeKey: 'recovery_inflammation',
    title: 'Your recovery scores tell the same story as your inflammation markers',
    narrative: `Your hs-CRP of ${crp.value.toFixed(2)} mg/L indicates systemic inflammation. Your ${METRIC_DISPLAY_NAMES[metricType] ?? metricType} has been averaging ${recovery.avg}${recovery.trend === 'declining' ? ' and trending down' : ''} over the past 30 days. The wearable is detecting what your blood confirms.`,
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
    connection: 'Systemic inflammation (measured by hs-CRP) directly impairs parasympathetic recovery. Inflammatory cytokines activate the sympathetic nervous system, reduce HRV, and suppress the physiological recovery processes that wearables measure.',
    actionability: 'Address the root causes of inflammation: optimize sleep, reduce processed food intake, consider omega-3 supplementation (2-4g EPA/DHA daily), and investigate gut health.',
    confidence: crp.value > 3.0 ? 'high' : 'medium',
    priority: 'high',
  }
}

async function bridgeSleepThyroid(
  userId: string,
  map: BiomarkerMap
): Promise<BridgeInsight | null> {
  const tsh = map['tsh']
  const freeT3 = map['free_t3']
  if (!tsh || tsh.value <= 2.0) return null

  const deepSleep = await getRecentMetric(userId, 'deep_sleep')
  if (!deepSleep) return null

  const findings = [
    { biomarkerKey: 'tsh', displayName: 'TSH', ...tsh },
  ]
  if (freeT3) findings.push({ biomarkerKey: 'free_t3', displayName: 'Free T3', ...freeT3 })

  return {
    bridgeKey: 'sleep_thyroid',
    title: 'Your sleep architecture may improve once thyroid is optimized',
    narrative: `Your TSH of ${tsh.value.toFixed(2)} mIU/L${freeT3 ? ` and Free T3 of ${freeT3.value.toFixed(1)} pg/mL` : ''} suggest suboptimal thyroid function. Your deep sleep has been averaging ${deepSleep.avg} minutes over the past 30 days${deepSleep.trend === 'declining' ? ' and trending down' : ''}. T3 directly influences sleep architecture, particularly slow-wave (deep) sleep.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'deep_sleep',
      displayName: 'Deep Sleep',
      recentAvg: deepSleep.avg,
      unit: deepSleep.unit,
      trend: deepSleep.trend,
    }],
    connection: 'Thyroid hormone T3 modulates neurotransmitter systems involved in sleep architecture. Low T3 reduces slow-wave sleep generation and can cause lighter, more fragmented sleep. This is a commonly underdiagnosed cause of poor deep sleep.',
    actionability: 'Discuss thyroid optimization with your provider. If T4-to-T3 conversion is poor, selenium and zinc supplementation may help. Track deep sleep trends after any thyroid intervention.',
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
  const testLow = freeT && freeT.value < 10
  const cortisolHigh = cortisol && cortisol.value > 18

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
    title: 'Your body composition goals have a hormonal headwind',
    narrative: `${testLow ? `Your free testosterone of ${freeT!.value.toFixed(1)} pg/mL is below optimal. ` : ''}${cortisolHigh ? `Your cortisol of ${cortisol!.value.toFixed(1)} µg/dL is elevated. ` : ''}Your ${METRIC_DISPLAY_NAMES[metricType]} has been ${wearable.trend === 'stable' ? 'stable' : wearable.trend === 'improving' ? 'improving' : 'trending unfavorably'} despite your training efforts. The hormonal environment directly determines whether training stimulus converts to lean mass.`,
    labFindings: findings,
    wearableFindings: [{
      metricType,
      displayName: METRIC_DISPLAY_NAMES[metricType] ?? metricType,
      recentAvg: wearable.avg,
      unit: wearable.unit,
      trend: wearable.trend,
    }],
    connection: 'Testosterone drives muscle protein synthesis and inhibits fat storage. Cortisol does the opposite — it promotes muscle breakdown and fat accumulation (especially visceral). When both are suboptimal, body composition changes become very difficult regardless of training and nutrition.',
    actionability: 'Address the hormonal foundation first: optimize sleep (testosterone is produced during deep sleep), manage stress (to lower cortisol), and consider a hormonal evaluation with your provider.',
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
  const hasRisk = (apoB && apoB.value > 90) || (lpa && lpa.value > 75)
  if (!hasRisk) return null

  const vo2 = await getRecentMetric(userId, 'vo2_max')
  if (!vo2) return null

  const findings: BridgeInsight['labFindings'] = []
  if (apoB && apoB.value > 90) findings.push({ biomarkerKey: 'apolipoprotein_b', displayName: 'ApoB', ...apoB })
  if (lpa && lpa.value > 75) findings.push({ biomarkerKey: 'lipoprotein_a', displayName: 'Lp(a)', ...lpa })

  return {
    bridgeKey: 'vo2_cardiovascular',
    title: 'Your VO2 Max trajectory has a cardiovascular context',
    narrative: `${apoB && apoB.value > 90 ? `Your ApoB of ${Math.round(apoB.value)} mg/dL indicates elevated atherogenic burden. ` : ''}${lpa && lpa.value > 75 ? `Your Lp(a) of ${Math.round(lpa.value)} nmol/L is a genetic risk factor. ` : ''}Your VO2 Max has been averaging ${vo2.avg} mL/kg/min${vo2.trend === 'declining' ? ' and is trending down' : ''}. Advanced lipid markers indicate vascular burden that can limit peak cardiovascular output. This creates urgency — both for performance and longevity.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'vo2_max',
      displayName: 'VO2 Max',
      recentAvg: vo2.avg,
      unit: vo2.unit,
      trend: vo2.trend,
    }],
    connection: 'Atherosclerotic plaque reduces arterial compliance and impairs coronary blood flow, directly limiting cardiac output during peak exercise. This effect compounds with Lp(a), which promotes both plaque growth and thrombosis.',
    actionability: 'Aggressive management of modifiable lipid markers (ApoB, LDL) is recommended when Lp(a) is elevated. Discuss with a cardiologist or lipidologist. Continue aerobic training — exercise itself is cardioprotective even in the presence of adverse lipids.',
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
  const ironLow = (hemoglobin && hemoglobin.value < 14) || (ferritin && ferritin.value < 50)
  if (!ironLow) return null

  const rhrData = await getRecentMetric(userId, 'rhr')
    ?? await getRecentMetric(userId, 'resting_heart_rate')
  if (!rhrData) return null

  // For RHR, a higher trend = declining health (invert)
  const rhrTrend = rhrData.trend === 'improving' ? 'declining' : rhrData.trend === 'declining' ? 'improving' : 'stable'

  const findings: BridgeInsight['labFindings'] = []
  if (hemoglobin) findings.push({ biomarkerKey: 'hemoglobin', displayName: 'Hemoglobin', ...hemoglobin })
  if (ferritin && ferritin.value < 50) findings.push({ biomarkerKey: 'ferritin', displayName: 'Ferritin', ...ferritin })

  return {
    bridgeKey: 'rhr_iron',
    title: 'Your resting heart rate elevation correlates with your iron status',
    narrative: `${hemoglobin ? `Your hemoglobin of ${hemoglobin.value.toFixed(1)} g/dL` : `Your ferritin of ${ferritin!.value.toFixed(0)} ng/mL`} suggests reduced iron availability. Your resting heart rate has been averaging ${rhrData.avg} bpm${rhrTrend === 'declining' ? ' and has been trending up' : ''} over the past 30 days. The heart compensates for reduced oxygen-carrying capacity by beating faster.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'rhr',
      displayName: 'Resting Heart Rate',
      recentAvg: rhrData.avg,
      unit: rhrData.unit,
      trend: rhrTrend as 'declining' | 'stable' | 'improving',
    }],
    connection: 'Iron is essential for hemoglobin production. When hemoglobin is low, each heartbeat carries less oxygen. The cardiovascular system compensates by increasing heart rate. Correcting iron/ferritin often normalizes resting heart rate within 6-8 weeks.',
    actionability: 'Start iron supplementation (iron bisglycinate with vitamin C) and retest in 8 weeks. Monitor your resting heart rate trend — it should decrease as iron status improves.',
    confidence: hemoglobin && hemoglobin.value < 13 ? 'high' : 'medium',
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
  if (vitD && vitD.value < 40) {
    depletionCount++
    findings.push({ biomarkerKey: 'vitamin_d', displayName: 'Vitamin D', ...vitD })
  }
  if (mg && (mg.value < 2.0 || (map['rbc_magnesium'] && mg.value < 5.0))) {
    depletionCount++
    const key = map['rbc_magnesium'] ? 'rbc_magnesium' : 'magnesium'
    findings.push({ biomarkerKey: key, displayName: BIOMARKER_REGISTRY[key]?.displayName ?? key, ...mg })
  }
  if (b12 && b12.value < 500) {
    depletionCount++
    findings.push({ biomarkerKey: 'vitamin_b12', displayName: 'Vitamin B12', ...b12 })
  }

  if (depletionCount < 2) return null

  const exercise = await getRecentMetric(userId, 'exercise_minutes')
  if (!exercise) return null

  return {
    bridgeKey: 'activity_nutrient',
    title: 'Your activity tolerance may be limited by your nutrient foundation',
    narrative: `${findings.map(f => `${f.displayName}: ${f.value} ${f.unit}`).join(', ')} — multiple key nutrients are below optimal. Your exercise minutes have been averaging ${exercise.avg} min/day over the past 30 days${exercise.trend === 'declining' ? ' and trending down' : ''}. These nutrients are cofactors for energy production, muscle contraction, and recovery. Depletion creates a performance ceiling that no amount of willpower overcomes.`,
    labFindings: findings,
    wearableFindings: [{
      metricType: 'exercise_minutes',
      displayName: 'Exercise Minutes',
      recentAvg: exercise.avg,
      unit: exercise.unit,
      trend: exercise.trend,
    }],
    connection: 'Vitamin D is required for calcium handling in muscle contraction and immune modulation post-exercise. Magnesium is a cofactor for ATP production (the energy currency of every cell). B12 is essential for red blood cell formation and neurological function. Together, these create the biochemical foundation for exercise capacity.',
    actionability: 'Start targeted supplementation: Vitamin D3 with K2 (5000 IU/day if <30 ng/mL), magnesium glycinate (400mg before bed), and B12 (methylcobalamin 1000mcg sublingual). Retest in 3 months.',
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
