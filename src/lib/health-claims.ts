// Claims with Receipts Engine
// Generates trustworthy, evidence-backed health insights

import { subDays, parseISO, format, differenceInDays } from 'date-fns'
import { MetricBaseline, compareToBaseline, METRIC_POLARITY, calculateVolatility } from './health-baselines'
import type { SeedMetric, SeedIntervention, SeedContextEvent } from './demo-data/seed-metrics'

export interface EffectSize {
  cohensD: number           // Standardized effect size
  percentChange: number     // Raw percentage change
  absoluteChange: number    // Raw absolute change
  direction: 'positive' | 'negative' | 'neutral'
  magnitude: 'large' | 'medium' | 'small' | 'negligible'
}

export interface ConfidenceLevel {
  level: 'high' | 'medium' | 'low'
  score: number             // 0-100
  reasons: string[]
}

export interface Receipt {
  sampleSize: { before: number; after: number }
  effectSize: EffectSize
  timeWindow: { start: string; end: string }
  confoundsPresent: string[]
  confoundDaysExcluded: number
  dataPointIds: string[]    // For "view days included"
  methodology: string
}

export interface Claim {
  id: string
  type: 'improvement' | 'decline' | 'correlation' | 'warning' | 'recommendation' | 'observation'
  priority: 'high' | 'medium' | 'low'

  // Content
  headline: string
  evidence: string
  actionable?: string

  // Context
  metricType?: string
  interventionId?: string
  interventionName?: string

  // Trust layer
  confidence: ConfidenceLevel
  receipt: Receipt

  // Filters applied
  filters: {
    excludeTravel: boolean
    excludeAlcohol: boolean
    excludeIllness: boolean
    trainingDaysOnly: boolean
    restDaysOnly: boolean
  }
}

export interface ClaimGeneratorInput {
  metrics: SeedMetric[]
  interventions: SeedIntervention[]
  contextEvents: SeedContextEvent[]
  baselines: Map<string, MetricBaseline>
}

// Adaptive thresholds — body comp and VO2 max update less frequently than daily metrics
const METRIC_THRESHOLDS: Record<string, { minForTrend: number; minForBaseline: number }> = {
  weight: { minForTrend: 5, minForBaseline: 4 },
  body_fat_percentage: { minForTrend: 5, minForBaseline: 4 },
  lean_body_mass: { minForTrend: 5, minForBaseline: 4 },
  muscle_mass: { minForTrend: 5, minForBaseline: 4 },
  bmi: { minForTrend: 5, minForBaseline: 4 },
  bone_mass: { minForTrend: 5, minForBaseline: 4 },
  body_water: { minForTrend: 5, minForBaseline: 4 },
  vo2_max: { minForTrend: 3, minForBaseline: 3 },
}
const DEFAULT_THRESHOLD = { minForTrend: 14, minForBaseline: 5 }

function getThreshold(metricType: string) {
  return METRIC_THRESHOLDS[metricType] || DEFAULT_THRESHOLD
}

// Metrics available with Oura or Eight Sleep — optional extras beyond Apple Health
const PROVIDER_EXCLUSIVE_METRICS: Record<string, string> = {
  deep_sleep: 'Oura Ring or Eight Sleep',
  sleep_efficiency: 'Oura Ring or Eight Sleep',
  waso: 'Oura Ring or Eight Sleep',
  sleep_latency: 'Oura Ring or Eight Sleep',
  sleep_score: 'Oura Ring',
  readiness_score: 'Oura Ring',
}

// Main claim generation function
export function generateClaims(input: ClaimGeneratorInput): Claim[] {
  const claims: Claim[] = []

  // 1. Generate intervention impact claims
  for (const intervention of input.interventions) {
    const interventionClaims = generateInterventionClaims(
      intervention,
      input.metrics,
      input.contextEvents,
      input.baselines
    )
    claims.push(...interventionClaims)
  }

  // 2. Generate daily delta claims (what changed today)
  const deltaClaims = generateDeltaClaims(input.metrics, input.baselines)
  claims.push(...deltaClaims)

  // 3. Generate warning claims
  const warningClaims = generateWarningClaims(input.metrics, input.baselines)
  claims.push(...warningClaims)

  // 4. Generate correlation claims (cross-metric relationships)
  const correlationClaims = generateCorrelationClaims(input.metrics, input.contextEvents)
  claims.push(...correlationClaims)

  // 4.5 Body composition multi-signal claims (recomposition detection)
  const recompClaims = generateRecompositionClaims(input.metrics, input.baselines)
  claims.push(...recompClaims)

  // 5. Generate multi-window trend claims (7/14/30/90 day)
  const trendClaims = generateTrendClaims(input.metrics, input.baselines)
  claims.push(...trendClaims)

  // 6. Generate temporal protocol correlation claims
  const temporalClaims = generateTemporalClaims(
    input.interventions,
    input.metrics,
    input.baselines
  )
  claims.push(...temporalClaims)

  // 7. Generate data availability observations
  const availabilityClaims = generateDataAvailabilityClaims(input.metrics, input.baselines)
  claims.push(...availabilityClaims)

  // Sort by priority and confidence
  claims.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return b.confidence.score - a.confidence.score
  })

  // Deduplicate conflicting directional claims per metric.
  // When multiple claims for the same metric disagree on direction
  // (e.g. "HRV up today" + "HRV trending down 30d"), keep only the
  // highest-priority/confidence one to avoid contradictory display.
  return deduplicateConflictingClaims(claims)
}

function deduplicateConflictingClaims(claims: Claim[]): Claim[] {
  const directionTypes = new Set(['improvement', 'decline', 'warning'])
  const kept = new Map<string, Claim>()  // metricType → first directional claim
  const result: Claim[] = []

  for (const claim of claims) {
    if (!claim.metricType || !directionTypes.has(claim.type)) {
      result.push(claim)
      continue
    }

    const existing = kept.get(claim.metricType)
    if (!existing) {
      kept.set(claim.metricType, claim)
      result.push(claim)
      continue
    }

    // Same direction → keep both (reinforcing signals are fine)
    const existingDir = existing.type === 'improvement' ? 'up' : 'down'
    const claimDir = claim.type === 'improvement' ? 'up' : 'down'
    if (existingDir === claimDir) {
      result.push(claim)
      continue
    }

    // Conflicting direction → suppress the lower-confidence one.
    // The existing claim already won (it was sorted first), so skip this one.
  }

  return result
}

// Generate claims for a specific intervention
function generateInterventionClaims(
  intervention: SeedIntervention,
  metrics: SeedMetric[],
  contextEvents: SeedContextEvent[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []
  const startDate = parseISO(intervention.startDate)
  const today = new Date()
  const daysSinceStart = differenceInDays(today, startDate)

  if (daysSinceStart < 7) {
    return [] // Not enough data
  }

  // Analyze impact on ALL tracked metrics
  const keyMetrics = [
    // Sleep
    'hrv', 'deep_sleep', 'sleep_efficiency', 'rhr', 'sleep_score', 'readiness_score',
    'rem_sleep', 'sleep_duration', 'waso', 'sleep_latency',
    // Body composition
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi',
    // Fitness & Activity
    'vo2_max', 'steps', 'active_calories', 'exercise_minutes', 'walking_running_distance',
    // Vitals
    'respiratory_rate', 'blood_oxygen',
  ]

  for (const metricType of keyMetrics) {
    const metricData = metrics.filter(m => m.metricType === metricType)
    const threshold = getThreshold(metricType)
    if (metricData.length < threshold.minForTrend) continue

    const baseline = baselines.get(metricType)
    if (!baseline) continue

    // Split into before and after
    const beforeData = metricData.filter(m => parseISO(m.date) < startDate)
    const afterData = metricData.filter(m => parseISO(m.date) >= startDate)

    if (beforeData.length < threshold.minForBaseline || afterData.length < threshold.minForBaseline) continue

    // Calculate effect
    const beforeValues = beforeData.map(m => m.value)
    const afterValues = afterData.map(m => m.value)
    const effectSize = calculateEffectSize(beforeValues, afterValues)

    // Determine confounds in the after period
    const confounds = contextEvents.filter(e =>
      parseISO(e.date) >= startDate &&
      ['alcohol', 'travel', 'illness'].includes(e.type)
    )
    const confoundTypes = [...new Set(confounds.map(c => c.type))]

    // Calculate confidence
    const confidence = calculateConfidence(
      afterData.length,
      confoundTypes.length,
      effectSize.cohensD
    )

    // Only create claim if effect is meaningful
    if (effectSize.magnitude === 'negligible') continue

    const polarity = METRIC_POLARITY[metricType] || 'higher_better'
    const isPositive = (polarity === 'higher_better' && effectSize.direction === 'positive') ||
                       (polarity === 'lower_better' && effectSize.direction === 'negative')

    const claim: Claim = {
      id: `${intervention.id}_${metricType}`,
      type: isPositive ? 'improvement' : 'decline',
      priority: confidence.level === 'high' && Math.abs(effectSize.cohensD) > 0.5 ? 'high' : 'medium',

      headline: generateInterventionHeadline(intervention.name, metricType, effectSize, isPositive),
      evidence: generateInterventionEvidence(intervention, metricType, effectSize, afterData.length),
      actionable: isPositive
        ? `Continue ${intervention.name} protocol`
        : `Review ${intervention.name} dosing or timing`,

      metricType,
      interventionId: intervention.id,
      interventionName: intervention.name,

      confidence,
      receipt: {
        sampleSize: { before: beforeData.length, after: afterData.length },
        effectSize,
        timeWindow: {
          start: format(startDate, 'MMM d'),
          end: format(today, 'MMM d')
        },
        confoundsPresent: confoundTypes,
        confoundDaysExcluded: 0,
        dataPointIds: afterData.map(d => d.date),
        methodology: 'Before/after comparison with baseline adjustment'
      },

      filters: {
        excludeTravel: false,
        excludeAlcohol: false,
        excludeIllness: false,
        trainingDaysOnly: false,
        restDaysOnly: false
      }
    }

    claims.push(claim)
  }

  return claims
}

// Generate daily change claims
function generateDeltaClaims(
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  const keyMetrics = [
    'hrv', 'deep_sleep', 'sleep_efficiency', 'rhr', 'waso', 'sleep_score',
    'rem_sleep', 'sleep_duration', 'sleep_latency',
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
    'vo2_max', 'steps', 'active_calories', 'exercise_minutes',
    'respiratory_rate', 'blood_oxygen',
  ]

  for (const metricType of keyMetrics) {
    const baseline = baselines.get(metricType)
    if (!baseline) continue

    const todayMetric = metrics.find(m => m.date === today && m.metricType === metricType)
    const yesterdayMetric = metrics.find(m => m.date === yesterday && m.metricType === metricType)

    // Use yesterday if today not available
    const currentMetric = todayMetric || yesterdayMetric
    if (!currentMetric) continue

    const polarity = METRIC_POLARITY[metricType] || 'higher_better'
    const delta = compareToBaseline(currentMetric.value, baseline, polarity)

    // Only report significant changes
    if (delta.significance === 'none') continue

    const isPositive = (polarity === 'higher_better' && delta.direction === 'above') ||
                       (polarity === 'lower_better' && delta.direction === 'below')

    claims.push({
      id: `delta_${metricType}_${currentMetric.date}`,
      type: 'observation',
      priority: delta.significance === 'high' ? 'high' : 'medium',

      headline: generateDeltaHeadline(metricType, delta, isPositive),
      evidence: `${delta.zScore > 0 ? '+' : ''}${delta.zScore.toFixed(1)}σ vs your 28-day baseline`,

      metricType,

      confidence: {
        level: baseline.dataPoints >= 20 ? 'high' : baseline.dataPoints >= 10 ? 'medium' : 'low',
        score: Math.min(95, 50 + baseline.dataPoints * 2),
        reasons: [`Based on ${baseline.dataPoints} days of baseline data`]
      },

      receipt: {
        sampleSize: { before: baseline.dataPoints, after: 1 },
        effectSize: {
          cohensD: delta.zScore,
          percentChange: delta.percentDelta,
          absoluteChange: delta.absoluteDelta,
          direction: delta.direction === 'above' ? 'positive' : 'negative',
          magnitude: Math.abs(delta.zScore) > 2 ? 'large' : Math.abs(delta.zScore) > 1 ? 'medium' : 'small'
        },
        timeWindow: { start: currentMetric.date, end: currentMetric.date },
        confoundsPresent: [],
        confoundDaysExcluded: 0,
        dataPointIds: [currentMetric.date],
        methodology: 'Z-score comparison to rolling baseline'
      },

      filters: {
        excludeTravel: false,
        excludeAlcohol: false,
        excludeIllness: false,
        trainingDaysOnly: false,
        restDaysOnly: false
      }
    })
  }

  return claims
}

// Generate warning claims
function generateWarningClaims(
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []

  // Check for declining trends across all metric categories
  const declineMetrics = [
    // Sleep & Recovery
    'hrv', 'deep_sleep', 'sleep_efficiency', 'rem_sleep', 'sleep_duration',
    // Body Composition (watch for adverse trends)
    'body_fat_percentage', 'weight', 'lean_body_mass', 'muscle_mass',
    // Activity (watch for detraining)
    'steps', 'active_calories', 'exercise_minutes', 'vo2_max',
    // Vitals
    'rhr', 'blood_oxygen',
  ]

  // Contextual recommendations per metric
  const warningRecommendations: Record<string, string> = {
    body_fat_percentage: 'Review nutrition and training. Consider body composition recheck.',
    weight: 'Track alongside body fat % — weight alone doesn\'t tell the full story.',
    lean_body_mass: 'Ensure adequate protein intake and resistance training.',
    muscle_mass: 'Check training volume and protein intake. Consider recovery quality.',
    steps: 'Look for opportunities to increase daily movement.',
    active_calories: 'Activity is trending down — consider adjusting training plan.',
    exercise_minutes: 'Exercise frequency declining — check schedule and energy levels.',
    vo2_max: 'Cardiovascular fitness declining — consider adding cardio sessions.',
    rhr: 'Rising resting heart rate can indicate stress, overtraining, or poor recovery.',
    blood_oxygen: 'Declining blood oxygen — monitor and consult provider if persistent.',
    rem_sleep: 'REM sleep supports memory and learning. Check alcohol, stress, or late caffeine.',
    sleep_duration: 'Prioritize sleep hygiene and consistent bedtime.',
  }

  for (const metricType of declineMetrics) {
    const metricData = metrics
      .filter(m => m.metricType === metricType)
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

    const threshold = getThreshold(metricType)
    if (metricData.length < threshold.minForTrend) continue

    // Use available data: split into recent half and prior half
    const halfLen = Math.min(7, Math.floor(metricData.length / 2))
    const recent = metricData.slice(-halfLen)
    const prior = metricData.slice(-(halfLen * 2), -halfLen)

    if (recent.length < 2 || prior.length < 2) continue

    const recentAvg = recent.reduce((s, m) => s + m.value, 0) / recent.length
    const priorAvg = prior.reduce((s, m) => s + m.value, 0) / prior.length

    const change = priorAvg !== 0 ? clampPercent(((recentAvg - priorAvg) / priorAvg) * 100) : 0
    const polarity = METRIC_POLARITY[metricType] || 'higher_better'

    // Tighter thresholds for slow-changing body composition metrics
    const bodyCompMetrics = ['body_fat_percentage', 'weight', 'lean_body_mass', 'muscle_mass', 'bmi']
    const warningThreshold = bodyCompMetrics.includes(metricType) ? 3 : 10

    // Warn if declining significantly
    const isDecline = (polarity === 'higher_better' && change < -warningThreshold) ||
                      (polarity === 'lower_better' && change > warningThreshold)

    if (isDecline) {
      claims.push({
        id: `warning_${metricType}`,
        type: 'warning',
        priority: 'high',

        headline: `${getMetricDisplayName(metricType)} declining`,
        evidence: `Down ${Math.abs(change).toFixed(0)}% over the past ${halfLen * 2} days`,
        actionable: warningRecommendations[metricType] || 'Review recent changes to sleep habits, training load, or stress',

        metricType,

        confidence: {
          level: 'medium',
          score: 70,
          reasons: [`Based on ${halfLen * 2}-day comparison`, 'May be influenced by recent events']
        },

        receipt: {
          sampleSize: { before: prior.length, after: recent.length },
          effectSize: {
            cohensD: 0,
            percentChange: change,
            absoluteChange: recentAvg - priorAvg,
            direction: 'negative',
            magnitude: Math.abs(change) > 20 ? 'large' : 'medium'
          },
          timeWindow: {
            start: prior[0]?.date || '',
            end: recent[recent.length - 1]?.date || ''
          },
          confoundsPresent: [],
          confoundDaysExcluded: 0,
          dataPointIds: [...prior, ...recent].map(m => m.date),
          methodology: 'Period-over-period comparison'
        },

        filters: {
          excludeTravel: false,
          excludeAlcohol: false,
          excludeIllness: false,
          trainingDaysOnly: false,
          restDaysOnly: false
        }
      })
    }
  }

  return claims
}

// Generate correlation claims between behaviors and outcomes
function generateCorrelationClaims(
  metrics: SeedMetric[],
  contextEvents: SeedContextEvent[]
): Claim[] {
  const claims: Claim[] = []

  // Alcohol impact on sleep
  const alcoholDays = contextEvents.filter(e => e.type === 'alcohol').map(e => e.date)
  if (alcoholDays.length >= 3) {
    const deepSleepData = metrics.filter(m => m.metricType === 'deep_sleep')

    const alcoholNights = deepSleepData.filter(m => alcoholDays.includes(m.date))
    const normalNights = deepSleepData.filter(m => !alcoholDays.includes(m.date))

    if (alcoholNights.length >= 3 && normalNights.length >= 5) {
      const alcoholAvg = alcoholNights.reduce((s, m) => s + m.value, 0) / alcoholNights.length
      const normalAvg = normalNights.reduce((s, m) => s + m.value, 0) / normalNights.length
      const diff = alcoholAvg - normalAvg
      const pctDiff = normalAvg !== 0 ? clampPercent((diff / normalAvg) * 100) : 0

      if (Math.abs(pctDiff) > 10) {
        claims.push({
          id: 'correlation_alcohol_deep_sleep',
          type: 'correlation',
          priority: 'medium',

          headline: `Alcohol reduces your deep sleep by ${Math.abs(pctDiff).toFixed(0)}%`,
          evidence: `On alcohol nights: ${Math.round(alcoholAvg)}min avg deep sleep vs ${Math.round(normalAvg)}min on normal nights`,
          actionable: 'Consider limiting alcohol to protect sleep quality',

          metricType: 'deep_sleep',

          confidence: {
            level: alcoholNights.length >= 5 ? 'high' : 'medium',
            score: Math.min(90, 50 + alcoholNights.length * 5),
            reasons: [`Based on ${alcoholNights.length} alcohol nights and ${normalNights.length} normal nights`]
          },

          receipt: {
            sampleSize: { before: normalNights.length, after: alcoholNights.length },
            effectSize: {
              cohensD: 0,
              percentChange: pctDiff,
              absoluteChange: diff,
              direction: 'negative',
              magnitude: Math.abs(pctDiff) > 25 ? 'large' : 'medium'
            },
            timeWindow: { start: '', end: '' },
            confoundsPresent: [],
            confoundDaysExcluded: 0,
            dataPointIds: alcoholNights.map(m => m.date),
            methodology: 'Comparison of alcohol vs non-alcohol nights'
          },

          filters: {
            excludeTravel: false,
            excludeAlcohol: false,
            excludeIllness: false,
            trainingDaysOnly: false,
            restDaysOnly: false
          }
        })
      }
    }
  }

  // Sleep quality x next-day activity
  const sleepData = metrics
    .filter(m => m.metricType === 'sleep_duration')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
  const stepsData = metrics
    .filter(m => m.metricType === 'steps')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

  if (sleepData.length >= 14 && stepsData.length >= 14) {
    // Build date→value maps
    const sleepByDate = new Map(sleepData.map(m => [m.date, m.value]))
    const stepsByDate = new Map(stepsData.map(m => [m.date, m.value]))

    // Find days where we have both sleep (previous night) and steps (that day)
    const goodSleepSteps: number[] = []
    const badSleepSteps: number[] = []
    const sleepMedian = [...sleepData.map(m => m.value)].sort((a, b) => a - b)[Math.floor(sleepData.length / 2)]

    for (const [date, steps] of stepsByDate) {
      const prevDate = format(subDays(parseISO(date), 1), 'yyyy-MM-dd')
      const prevSleep = sleepByDate.get(prevDate)
      if (prevSleep === undefined) continue
      if (prevSleep >= sleepMedian) {
        goodSleepSteps.push(steps)
      } else {
        badSleepSteps.push(steps)
      }
    }

    if (goodSleepSteps.length >= 5 && badSleepSteps.length >= 5) {
      const goodAvg = goodSleepSteps.reduce((a, b) => a + b, 0) / goodSleepSteps.length
      const badAvg = badSleepSteps.reduce((a, b) => a + b, 0) / badSleepSteps.length
      const pctDiff = badAvg !== 0 ? clampPercent(((goodAvg - badAvg) / badAvg) * 100) : 0

      if (Math.abs(pctDiff) > 10) {
        claims.push({
          id: 'correlation_sleep_activity',
          type: 'correlation',
          priority: 'medium',
          headline: `Good sleep nights → ${pctDiff > 0 ? Math.round(pctDiff) + '% more' : Math.abs(Math.round(pctDiff)) + '% fewer'} steps next day`,
          evidence: `After sleeping >${Math.round(sleepMedian / 60)}h: avg ${Math.round(goodAvg).toLocaleString()} steps. After shorter sleep: avg ${Math.round(badAvg).toLocaleString()} steps.`,
          actionable: 'Prioritize sleep to maintain activity levels.',
          metricType: 'steps',
          confidence: {
            level: goodSleepSteps.length >= 10 ? 'high' : 'medium',
            score: Math.min(85, 50 + goodSleepSteps.length * 2),
            reasons: [`Based on ${goodSleepSteps.length} good-sleep days and ${badSleepSteps.length} poor-sleep days`]
          },
          receipt: {
            sampleSize: { before: badSleepSteps.length, after: goodSleepSteps.length },
            effectSize: { cohensD: 0, percentChange: pctDiff, absoluteChange: goodAvg - badAvg, direction: pctDiff > 0 ? 'positive' : 'negative', magnitude: Math.abs(pctDiff) > 20 ? 'large' : 'medium' },
            timeWindow: { start: sleepData[0]?.date || '', end: sleepData[sleepData.length - 1]?.date || '' },
            confoundsPresent: [],
            confoundDaysExcluded: 0,
            dataPointIds: [],
            methodology: 'Sleep quality stratified by next-day activity levels'
          },
          filters: { excludeTravel: false, excludeAlcohol: false, excludeIllness: false, trainingDaysOnly: false, restDaysOnly: false }
        })
      }
    }
  }

  // Training load x next-day HRV
  const exerciseData = metrics
    .filter(m => m.metricType === 'exercise_minutes')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
  const hrvData = metrics
    .filter(m => m.metricType === 'hrv')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

  if (exerciseData.length >= 14 && hrvData.length >= 14) {
    const exerciseByDate = new Map(exerciseData.map(m => [m.date, m.value]))
    const hrvByDate = new Map(hrvData.map(m => [m.date, m.value]))

    const exerciseMedian = [...exerciseData.map(m => m.value)].sort((a, b) => a - b)[Math.floor(exerciseData.length / 2)]
    const highExDayHRV: number[] = []
    const lowExDayHRV: number[] = []

    for (const [date, hrv] of hrvByDate) {
      const prevDate = format(subDays(parseISO(date), 1), 'yyyy-MM-dd')
      const prevExercise = exerciseByDate.get(prevDate)
      if (prevExercise === undefined) continue
      if (prevExercise >= exerciseMedian) {
        highExDayHRV.push(hrv)
      } else {
        lowExDayHRV.push(hrv)
      }
    }

    if (highExDayHRV.length >= 5 && lowExDayHRV.length >= 5) {
      const highAvg = highExDayHRV.reduce((a, b) => a + b, 0) / highExDayHRV.length
      const lowAvg = lowExDayHRV.reduce((a, b) => a + b, 0) / lowExDayHRV.length
      const hrvDiff = highAvg - lowAvg
      const pctDiff = lowAvg !== 0 ? clampPercent((hrvDiff / lowAvg) * 100) : 0

      if (Math.abs(pctDiff) > 5) {
        claims.push({
          id: 'correlation_training_hrv',
          type: 'correlation',
          priority: 'medium',
          headline: `Heavy training days ${hrvDiff < 0 ? 'reduce' : 'boost'} next-morning HRV by ${Math.abs(Math.round(hrvDiff))}ms`,
          evidence: `After high-activity days (>${Math.round(exerciseMedian)}min): avg HRV ${Math.round(highAvg)}ms. After lighter days: avg ${Math.round(lowAvg)}ms.`,
          actionable: hrvDiff < 0
            ? 'Allow recovery days after intense training to maintain HRV.'
            : 'Your body recovers well from training. Maintain current intensity.',
          metricType: 'hrv',
          confidence: {
            level: highExDayHRV.length >= 10 ? 'high' : 'medium',
            score: Math.min(85, 50 + highExDayHRV.length * 2),
            reasons: [`Based on ${highExDayHRV.length} high-activity days and ${lowExDayHRV.length} low-activity days`]
          },
          receipt: {
            sampleSize: { before: lowExDayHRV.length, after: highExDayHRV.length },
            effectSize: { cohensD: 0, percentChange: pctDiff, absoluteChange: hrvDiff, direction: hrvDiff > 0 ? 'positive' : 'negative', magnitude: Math.abs(pctDiff) > 15 ? 'large' : 'medium' },
            timeWindow: { start: exerciseData[0]?.date || '', end: exerciseData[exerciseData.length - 1]?.date || '' },
            confoundsPresent: [],
            confoundDaysExcluded: 0,
            dataPointIds: [],
            methodology: 'Training load stratified by next-morning HRV'
          },
          filters: { excludeTravel: false, excludeAlcohol: false, excludeIllness: false, trainingDaysOnly: false, restDaysOnly: false }
        })
      }
    }
  }

  return claims
}

// Generate multi-window trend claims (7/14/30/90 day comparisons)
function generateTrendClaims(
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []

  const trendMetrics = [
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
    'vo2_max', 'hrv', 'rhr', 'steps', 'active_calories', 'exercise_minutes',
    'deep_sleep', 'sleep_efficiency',
  ]

  const windows = [
    { days: 7, label: '7 days' },
    { days: 14, label: '2 weeks' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
  ]

  for (const metricType of trendMetrics) {
    const metricData = metrics
      .filter(m => m.metricType === metricType)
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

    const trendThreshold = getThreshold(metricType)
    if (metricData.length < trendThreshold.minForTrend) continue

    // Find the longest window we have enough data for
    for (const window of windows.reverse()) {
      if (metricData.length < window.days) continue

      const recentHalf = metricData.slice(-Math.floor(window.days / 2))
      const olderHalf = metricData.slice(-window.days, -Math.floor(window.days / 2))

      if (recentHalf.length < 3 || olderHalf.length < 3) continue

      const recentAvg = recentHalf.reduce((s, m) => s + m.value, 0) / recentHalf.length
      const olderAvg = olderHalf.reduce((s, m) => s + m.value, 0) / olderHalf.length

      const change = olderAvg !== 0 ? clampPercent(((recentAvg - olderAvg) / olderAvg) * 100) : 0
      const absChange = Math.abs(change)

      // Only report meaningful trends (>3% for most metrics, >1% for weight/body comp)
      const threshold = ['weight', 'body_fat_percentage', 'bmi'].includes(metricType) ? 1 : 3
      if (absChange < threshold) continue

      const polarity = METRIC_POLARITY[metricType] || 'higher_better'
      const isPositive = (polarity === 'higher_better' && change > 0) ||
                         (polarity === 'lower_better' && change < 0)

      const metricName = getMetricDisplayName(metricType)
      const direction = change > 0 ? 'up' : 'down'
      const quality = isPositive ? '' : ' (watch this)'

      claims.push({
        id: `trend_${metricType}_${window.days}d`,
        type: isPositive ? 'improvement' : 'observation',
        priority: absChange > 10 ? 'high' : 'medium',

        headline: `${metricName} trending ${direction} ${absChange.toFixed(1)}% over ${window.label}${quality}`,
        evidence: `Recent avg: ${formatMetricValue(recentAvg, metricType)} vs prior: ${formatMetricValue(olderAvg, metricType)} (${window.days}-day window)`,

        metricType,

        confidence: {
          level: metricData.length >= 30 ? 'high' : metricData.length >= 14 ? 'medium' : 'low',
          score: Math.min(90, 50 + metricData.length),
          reasons: [`Based on ${metricData.length} data points over ${window.label}`]
        },

        receipt: {
          sampleSize: { before: olderHalf.length, after: recentHalf.length },
          effectSize: {
            cohensD: 0,
            percentChange: change,
            absoluteChange: recentAvg - olderAvg,
            direction: change > 0 ? 'positive' : 'negative',
            magnitude: absChange > 15 ? 'large' : absChange > 5 ? 'medium' : 'small'
          },
          timeWindow: {
            start: metricData[metricData.length - window.days]?.date || '',
            end: metricData[metricData.length - 1]?.date || ''
          },
          confoundsPresent: [],
          confoundDaysExcluded: 0,
          dataPointIds: metricData.slice(-window.days).map(m => m.date),
          methodology: `${window.days}-day trend comparison (first half vs second half)`
        },

        filters: {
          excludeTravel: false,
          excludeAlcohol: false,
          excludeIllness: false,
          trainingDaysOnly: false,
          restDaysOnly: false
        }
      })

      break // Only use the longest available window per metric
    }
  }

  return claims
}

// Generate temporal correlation claims — which metrics changed most since each protocol started
function generateTemporalClaims(
  interventions: SeedIntervention[],
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []

  const allMetricTypes = [
    'hrv', 'rhr', 'deep_sleep', 'sleep_efficiency', 'sleep_score',
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
    'vo2_max', 'steps', 'active_calories', 'exercise_minutes',
    'respiratory_rate', 'blood_oxygen',
  ]

  for (const intervention of interventions) {
    const startDate = parseISO(intervention.startDate)
    const daysSinceStart = differenceInDays(new Date(), startDate)

    if (daysSinceStart < 7) continue // Need at least 7 days of data

    // For each metric, compute the change since this protocol started
    const metricChanges: Array<{
      metricType: string
      effectSize: EffectSize
      afterCount: number
      beforeCount: number
    }> = []

    for (const metricType of allMetricTypes) {
      const metricData = metrics.filter(m => m.metricType === metricType)
      const beforeData = metricData.filter(m => parseISO(m.date) < startDate)
      const afterData = metricData.filter(m => parseISO(m.date) >= startDate)

      const temporalThreshold = getThreshold(metricType)
      if (beforeData.length < temporalThreshold.minForBaseline || afterData.length < temporalThreshold.minForBaseline) continue

      const beforeValues = beforeData.map(m => m.value)
      const afterValues = afterData.map(m => m.value)
      const effect = calculateEffectSize(beforeValues, afterValues)

      if (effect.magnitude !== 'negligible') {
        metricChanges.push({
          metricType,
          effectSize: effect,
          afterCount: afterData.length,
          beforeCount: beforeData.length,
        })
      }
    }

    // Sort by effect size magnitude, take top 3
    metricChanges.sort((a, b) => Math.abs(b.effectSize.cohensD) - Math.abs(a.effectSize.cohensD))
    const topChanges = metricChanges.slice(0, 3)

    for (const change of topChanges) {
      const polarity = METRIC_POLARITY[change.metricType] || 'higher_better'
      const isPositive = (polarity === 'higher_better' && change.effectSize.direction === 'positive') ||
                         (polarity === 'lower_better' && change.effectSize.direction === 'negative')

      const metricName = getMetricDisplayName(change.metricType)
      const direction = change.effectSize.percentChange > 0 ? 'increased' : 'decreased'
      const absPercent = Math.abs(change.effectSize.percentChange).toFixed(0)

      claims.push({
        id: `temporal_${intervention.id}_${change.metricType}`,
        type: isPositive ? 'correlation' : 'observation',
        priority: Math.abs(change.effectSize.cohensD) > 0.5 ? 'high' : 'medium',

        headline: `Since starting ${intervention.name} (${daysSinceStart}d ago), ${metricName} ${direction} ${absPercent}%`,
        evidence: `Effect size: ${change.effectSize.magnitude} (d=${change.effectSize.cohensD.toFixed(2)}), based on ${change.afterCount} days post-start vs ${change.beforeCount} days prior`,
        actionable: isPositive
          ? `${intervention.name} may be contributing to ${metricName.toLowerCase()} improvement`
          : `Monitor ${metricName.toLowerCase()} — consider ${intervention.name} timing or dose`,

        metricType: change.metricType,
        interventionId: intervention.id,
        interventionName: intervention.name,

        confidence: calculateConfidence(
          change.afterCount,
          0, // No confound info for temporal claims
          change.effectSize.cohensD
        ),

        receipt: {
          sampleSize: { before: change.beforeCount, after: change.afterCount },
          effectSize: change.effectSize,
          timeWindow: {
            start: format(startDate, 'MMM d'),
            end: format(new Date(), 'MMM d')
          },
          confoundsPresent: [],
          confoundDaysExcluded: 0,
          dataPointIds: [],
          methodology: 'Temporal before/after comparison anchored to protocol start date'
        },

        filters: {
          excludeTravel: false,
          excludeAlcohol: false,
          excludeIllness: false,
          trainingDaysOnly: false,
          restDaysOnly: false
        }
      })
    }
  }

  return claims
}

// Generate body recomposition claims — multi-signal body composition insights
function generateRecompositionClaims(
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []

  const bodyFatData = metrics
    .filter(m => m.metricType === 'body_fat_percentage')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
  const weightData = metrics
    .filter(m => m.metricType === 'weight')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())

  // Prefer muscle_mass, fall back to lean_body_mass
  let massMetricType = 'muscle_mass'
  let massData = metrics
    .filter(m => m.metricType === 'muscle_mass')
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
  if (massData.length < 5) {
    massMetricType = 'lean_body_mass'
    massData = metrics
      .filter(m => m.metricType === 'lean_body_mass')
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
  }

  // Need at least 5 data points for body comp
  if (bodyFatData.length < 5 || massData.length < 5) return claims

  const halfBF = Math.floor(bodyFatData.length / 2)
  const recentBFAvg = bodyFatData.slice(-halfBF).reduce((s, m) => s + m.value, 0) / halfBF
  const olderBFAvg = bodyFatData.slice(0, halfBF).reduce((s, m) => s + m.value, 0) / halfBF
  const bfChange = recentBFAvg - olderBFAvg

  const halfMass = Math.floor(massData.length / 2)
  const recentMassAvg = massData.slice(-halfMass).reduce((s, m) => s + m.value, 0) / halfMass
  const olderMassAvg = massData.slice(0, halfMass).reduce((s, m) => s + m.value, 0) / halfMass
  const massChange = recentMassAvg - olderMassAvg

  const massName = massMetricType === 'muscle_mass' ? 'muscle mass' : 'lean mass'
  const defaultFilters = { excludeTravel: false, excludeAlcohol: false, excludeIllness: false, trainingDaysOnly: false, restDaysOnly: false }

  // RECOMPOSITION: body fat down AND muscle/lean mass up
  if (bfChange < -0.3 && massChange > 0.1) {
    const effectSize = calculateEffectSize(
      bodyFatData.slice(0, halfBF).map(m => m.value),
      bodyFatData.slice(-halfBF).map(m => m.value)
    )
    claims.push({
      id: 'body_recomposition',
      type: 'improvement',
      priority: 'high',
      headline: 'Body recomposition detected',
      evidence: `Body fat ${bfChange.toFixed(1)}% while ${massName} +${massChange.toFixed(1)}kg. You are simultaneously losing fat and gaining muscle.`,
      actionable: 'Your training and nutrition are producing optimal body composition changes. Continue current approach.',
      metricType: 'body_fat_percentage',
      confidence: {
        level: Math.min(bodyFatData.length, massData.length) >= 10 ? 'high' : 'medium',
        score: Math.min(90, 50 + Math.min(bodyFatData.length, massData.length) * 3),
        reasons: [`Based on ${bodyFatData.length} body fat and ${massData.length} ${massName} data points`]
      },
      receipt: {
        sampleSize: { before: halfBF, after: halfBF },
        effectSize,
        timeWindow: {
          start: bodyFatData[0]?.date || '',
          end: bodyFatData[bodyFatData.length - 1]?.date || ''
        },
        confoundsPresent: [],
        confoundDaysExcluded: 0,
        dataPointIds: bodyFatData.map(m => m.date),
        methodology: 'Multi-signal body composition analysis (body fat + lean mass trends)'
      },
      filters: defaultFilters
    })
  }

  // WEIGHT STABLE BUT COMPOSITION CHANGING
  if (weightData.length >= 5) {
    const halfW = Math.floor(weightData.length / 2)
    const recentWAvg = weightData.slice(-halfW).reduce((s, m) => s + m.value, 0) / halfW
    const olderWAvg = weightData.slice(0, halfW).reduce((s, m) => s + m.value, 0) / halfW
    const weightChange = recentWAvg - olderWAvg

    if (Math.abs(weightChange) < 0.5 && (Math.abs(bfChange) > 0.5 || Math.abs(massChange) > 0.3)) {
      claims.push({
        id: 'weight_stable_recomp',
        type: 'observation',
        priority: 'medium',
        headline: 'Weight stable, but composition is shifting',
        evidence: `Weight barely moved (${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}kg) but body fat ${bfChange > 0 ? '+' : ''}${bfChange.toFixed(1)}% and ${massName} ${massChange > 0 ? '+' : ''}${massChange.toFixed(1)}kg.`,
        actionable: 'The scale doesn\'t tell the full story. Track body composition, not just weight.',
        metricType: 'weight',
        confidence: {
          level: 'medium',
          score: 70,
          reasons: [`Based on ${weightData.length} weight, ${bodyFatData.length} body fat, and ${massData.length} ${massName} data points`]
        },
        receipt: {
          sampleSize: { before: halfW, after: halfW },
          effectSize: { cohensD: 0, percentChange: 0, absoluteChange: weightChange, direction: 'neutral', magnitude: 'negligible' },
          timeWindow: {
            start: weightData[0]?.date || '',
            end: weightData[weightData.length - 1]?.date || ''
          },
          confoundsPresent: [],
          confoundDaysExcluded: 0,
          dataPointIds: [...weightData, ...bodyFatData].map(m => m.date),
          methodology: 'Weight vs body composition divergence analysis'
        },
        filters: defaultFilters
      })
    }

    // WEIGHT DROPPING, LEAN MASS STABLE = fat loss
    if (weightChange < -0.5 && Math.abs(massChange) < 0.3 && bfChange < -0.3) {
      claims.push({
        id: 'fat_loss_lean_preserved',
        type: 'improvement',
        priority: 'medium',
        headline: 'Fat loss with lean mass preserved',
        evidence: `Weight down ${Math.abs(weightChange).toFixed(1)}kg, body fat ${bfChange.toFixed(1)}%, ${massName} stable (${massChange > 0 ? '+' : ''}${massChange.toFixed(1)}kg). Weight loss is primarily fat.`,
        actionable: 'Good trajectory. Maintain protein intake to continue preserving lean mass.',
        metricType: 'weight',
        confidence: {
          level: 'medium',
          score: 70,
          reasons: [`Based on ${weightData.length} weight and ${bodyFatData.length} body fat data points`]
        },
        receipt: {
          sampleSize: { before: halfW, after: halfW },
          effectSize: { cohensD: 0, percentChange: olderWAvg !== 0 ? clampPercent((weightChange / olderWAvg) * 100) : 0, absoluteChange: weightChange, direction: 'negative', magnitude: 'small' },
          timeWindow: {
            start: weightData[0]?.date || '',
            end: weightData[weightData.length - 1]?.date || ''
          },
          confoundsPresent: [],
          confoundDaysExcluded: 0,
          dataPointIds: weightData.map(m => m.date),
          methodology: 'Weight loss composition analysis (fat vs lean mass)'
        },
        filters: defaultFilters
      })
    }
  }

  return claims
}

// Generate data availability observations — explain missing or insufficient data
function generateDataAvailabilityClaims(
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): Claim[] {
  const claims: Claim[] = []
  const metricCounts = new Map<string, number>()

  for (const m of metrics) {
    metricCounts.set(m.metricType, (metricCounts.get(m.metricType) || 0) + 1)
  }

  // Check for provider-exclusive metrics with zero data
  for (const [metricType, providerName] of Object.entries(PROVIDER_EXCLUSIVE_METRICS)) {
    if (!metricCounts.has(metricType)) {
      claims.push({
        id: `availability_${metricType}`,
        type: 'observation',
        priority: 'low',
        headline: `${getMetricDisplayName(metricType)} available with ${providerName}`,
        evidence: `This is an optional metric not tracked by Apple Health`,
        actionable: `Connect ${providerName} if you want ${getMetricDisplayName(metricType).toLowerCase()} insights`,
        metricType,
        confidence: { level: 'high', score: 95, reasons: ['Provider requirement'] },
        receipt: {
          sampleSize: { before: 0, after: 0 },
          effectSize: { cohensD: 0, percentChange: 0, absoluteChange: 0, direction: 'neutral', magnitude: 'negligible' },
          timeWindow: { start: '', end: '' },
          confoundsPresent: [],
          confoundDaysExcluded: 0,
          dataPointIds: [],
          methodology: 'Data source availability check'
        },
        filters: { excludeTravel: false, excludeAlcohol: false, excludeIllness: false, trainingDaysOnly: false, restDaysOnly: false }
      })
    }
  }

  // Check for metrics with some data but below threshold
  const trackableMetrics = [
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
    'hrv', 'rhr', 'sleep_duration', 'rem_sleep',
    'steps', 'active_calories', 'exercise_minutes', 'vo2_max',
    'respiratory_rate', 'blood_oxygen',
  ]

  for (const metricType of trackableMetrics) {
    const count = metricCounts.get(metricType) || 0
    if (count === 0) continue // No data at all — skip (not tracking this)

    const threshold = getThreshold(metricType)
    if (count >= threshold.minForTrend) continue // Enough data — insights are generating

    const daysNeeded = threshold.minForTrend - count
    claims.push({
      id: `availability_growing_${metricType}`,
      type: 'observation',
      priority: 'low',
      headline: `${getMetricDisplayName(metricType)}: ${count} data points so far`,
      evidence: `Need ${daysNeeded} more to start generating trend insights`,
      metricType,
      confidence: { level: 'high', score: 95, reasons: ['Data accumulation check'] },
      receipt: {
        sampleSize: { before: 0, after: count },
        effectSize: { cohensD: 0, percentChange: 0, absoluteChange: 0, direction: 'neutral', magnitude: 'negligible' },
        timeWindow: { start: '', end: '' },
        confoundsPresent: [],
        confoundDaysExcluded: 0,
        dataPointIds: [],
        methodology: 'Data sufficiency check'
      },
      filters: { excludeTravel: false, excludeAlcohol: false, excludeIllness: false, trainingDaysOnly: false, restDaysOnly: false }
    })
  }

  return claims
}

// Format metric value for display in evidence strings
function formatMetricValue(value: number, metricType: string): string {
  if (['weight', 'lean_body_mass', 'muscle_mass', 'bone_mass'].includes(metricType)) {
    return `${value.toFixed(1)}kg`
  }
  if (metricType === 'body_fat_percentage') return `${value.toFixed(1)}%`
  if (metricType === 'bmi') return value.toFixed(1)
  if (metricType === 'hrv') return `${Math.round(value)}ms`
  if (metricType === 'rhr') return `${Math.round(value)}bpm`
  if (metricType === 'vo2_max') return `${value.toFixed(1)}ml/kg/min`
  if (metricType === 'blood_oxygen') return `${value.toFixed(1)}%`
  if (metricType === 'respiratory_rate') return `${value.toFixed(1)}br/min`
  if (metricType === 'steps') return `${Math.round(value).toLocaleString()}`
  if (metricType === 'active_calories') return `${Math.round(value)}kcal`
  if (metricType === 'exercise_minutes') return `${Math.round(value)}min`
  if (metricType === 'walking_running_distance') return `${value.toFixed(1)}km`
  if (['deep_sleep', 'rem_sleep', 'sleep_duration', 'waso'].includes(metricType)) {
    return `${Math.round(value)}min`
  }
  if (metricType === 'sleep_efficiency') return `${value.toFixed(0)}%`
  return value.toFixed(1)
}

// Calculate effect size between two groups
function calculateEffectSize(before: number[], after: number[]): EffectSize {
  const beforeMean = before.reduce((a, b) => a + b, 0) / before.length
  const afterMean = after.reduce((a, b) => a + b, 0) / after.length

  const beforeVar = before.reduce((sum, v) => sum + Math.pow(v - beforeMean, 2), 0) / before.length
  const afterVar = after.reduce((sum, v) => sum + Math.pow(v - afterMean, 2), 0) / after.length

  const pooledStd = Math.sqrt((beforeVar + afterVar) / 2)
  const cohensD = pooledStd !== 0 ? (afterMean - beforeMean) / pooledStd : 0

  const percentChange = beforeMean !== 0 ? clampPercent(((afterMean - beforeMean) / beforeMean) * 100) : 0
  const absoluteChange = afterMean - beforeMean

  const direction: EffectSize['direction'] =
    Math.abs(cohensD) < 0.2 ? 'neutral' :
    cohensD > 0 ? 'positive' : 'negative'

  const magnitude: EffectSize['magnitude'] =
    Math.abs(cohensD) >= 0.8 ? 'large' :
    Math.abs(cohensD) >= 0.5 ? 'medium' :
    Math.abs(cohensD) >= 0.2 ? 'small' : 'negligible'

  return {
    cohensD: Math.round(cohensD * 100) / 100,
    percentChange: Math.round(percentChange * 10) / 10,
    absoluteChange: Math.round(absoluteChange * 10) / 10,
    direction,
    magnitude
  }
}

// Calculate confidence level
function calculateConfidence(
  sampleSize: number,
  confoundCount: number,
  effectSize: number
): ConfidenceLevel {
  const reasons: string[] = []
  let score = 50

  // Sample size contribution
  if (sampleSize >= 21) {
    score += 30
    reasons.push(`Strong sample size (${sampleSize} days)`)
  } else if (sampleSize >= 14) {
    score += 20
    reasons.push(`Good sample size (${sampleSize} days)`)
  } else if (sampleSize >= 7) {
    score += 10
    reasons.push(`Adequate sample size (${sampleSize} days)`)
  } else {
    reasons.push(`Limited sample size (${sampleSize} days)`)
  }

  // Confound penalty
  if (confoundCount === 0) {
    score += 15
    reasons.push('No confounds detected')
  } else if (confoundCount <= 2) {
    score += 5
    reasons.push(`${confoundCount} minor confounds present`)
  } else {
    score -= 10
    reasons.push(`${confoundCount} confounds may affect results`)
  }

  // Effect size contribution
  if (Math.abs(effectSize) >= 0.8) {
    score += 10
    reasons.push('Large effect size')
  } else if (Math.abs(effectSize) >= 0.5) {
    score += 5
  }

  score = Math.min(95, Math.max(20, score))

  const level: ConfidenceLevel['level'] =
    score >= 75 ? 'high' :
    score >= 50 ? 'medium' : 'low'

  return { level, score, reasons }
}

// Helper functions for generating text
function generateInterventionHeadline(
  interventionName: string,
  metricType: string,
  effect: EffectSize,
  isPositive: boolean
): string {
  const metric = getMetricDisplayName(metricType)
  const direction = isPositive ? 'improved' : 'changed'
  const amount = Math.abs(effect.percentChange).toFixed(0)

  return `${interventionName} ${direction} ${metric} by ${amount}%`
}

function generateInterventionEvidence(
  intervention: SeedIntervention,
  metricType: string,
  effect: EffectSize,
  dataPoints: number
): string {
  return `Based on ${dataPoints} days since starting ${intervention.name}. Effect size: ${effect.magnitude} (d=${effect.cohensD.toFixed(2)})`
}

function generateDeltaHeadline(
  metricType: string,
  delta: ReturnType<typeof compareToBaseline>,
  isPositive: boolean
): string {
  const metric = getMetricDisplayName(metricType)
  const direction = delta.direction === 'above' ? 'up' : 'down'
  const quality = isPositive ? '(good)' : ''

  return `${metric} ${direction} ${Math.abs(delta.percentDelta).toFixed(0)}% ${quality}`
}

// Helper: Clamp percent change to prevent extreme values from division edge cases
function clampPercent(pct: number): number {
  return Math.max(-500, Math.min(500, pct))
}

function getMetricDisplayName(metricType: string): string {
  const names: Record<string, string> = {
    hrv: 'HRV',
    rhr: 'Resting HR',
    deep_sleep: 'Deep sleep',
    rem_sleep: 'REM sleep',
    sleep_duration: 'Sleep duration',
    sleep_efficiency: 'Sleep efficiency',
    sleep_score: 'Sleep score',
    readiness_score: 'Readiness',
    waso: 'Wake time',
    sleep_latency: 'Sleep latency',
    temp_deviation: 'Temp deviation',
    steps: 'Steps',
    active_calories: 'Active calories',
    exercise_minutes: 'Exercise',
    weight: 'Weight',
    body_fat_percentage: 'Body fat',
    lean_body_mass: 'Lean mass',
    muscle_mass: 'Muscle mass',
    bmi: 'BMI',
    bone_mass: 'Bone mass',
    body_water: 'Body water',
    vo2_max: 'VO2 Max',
    blood_oxygen: 'Blood O2',
    respiratory_rate: 'Respiratory rate',
    walking_running_distance: 'Distance',
    basal_calories: 'Basal calories',
    stand_hours: 'Stand hours',
    body_temperature: 'Body temp',
  }
  return names[metricType] || metricType
}

// Get today's most important claims for the "What Changed" card
export function getTodaysClaims(claims: Claim[]): Claim[] {
  return claims
    .filter(c => c.type === 'observation' || c.type === 'warning')
    .slice(0, 4)
}

// Get the single best recommendation
export function getTopRecommendation(claims: Claim[]): Claim | null {
  const recommendations = claims.filter(c =>
    c.type === 'recommendation' ||
    (c.actionable && c.priority === 'high')
  )
  return recommendations[0] || null
}

// Get protocol impact claims
export function getProtocolImpactClaims(claims: Claim[], interventionId: string): Claim[] {
  return claims.filter(c =>
    c.interventionId === interventionId &&
    (c.type === 'improvement' || c.type === 'decline')
  )
}

// ─── Insight Themes ─────────────────────────────────────────────────

export type InsightThemeType =
  | 'recovery_state' | 'sleep_architecture' | 'body_composition'
  | 'training_response' | 'protocol_evidence' | 'lifestyle_impact' | 'risk_alert'

export interface InsightTheme {
  id: string
  type: InsightThemeType
  title: string
  summary: string
  timespan: string
  priority: 'high' | 'medium' | 'low'
  claims: Claim[]
  metricTypes: string[]
  actionable: string | null
}

const THEME_METRIC_MAP: Record<InsightThemeType, string[]> = {
  recovery_state: ['hrv', 'rhr', 'readiness_score', 'respiratory_rate', 'blood_oxygen'],
  sleep_architecture: ['sleep_duration', 'deep_sleep', 'rem_sleep', 'sleep_efficiency', 'sleep_score', 'waso', 'sleep_latency'],
  body_composition: ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi', 'bone_mass', 'body_water'],
  training_response: ['steps', 'active_calories', 'exercise_minutes', 'walking_running_distance', 'vo2_max', 'stand_hours'],
  protocol_evidence: [], // Matched by interventionId, not metricType
  lifestyle_impact: [], // Matched by correlation type
  risk_alert: [], // Matched by warning type
}

/**
 * Groups existing claims into themed insight groups.
 * Each claim appears in at most one theme. Max 5 themes, max 3 claims initially visible.
 */
export function groupClaimsIntoThemes(claims: Claim[]): InsightTheme[] {
  const usedClaimIds = new Set<string>()
  const themes: InsightTheme[] = []

  // 1. Risk alerts (warnings)
  const warnings = claims.filter(c => c.type === 'warning' && !usedClaimIds.has(c.id))
  if (warnings.length > 0) {
    for (const c of warnings) usedClaimIds.add(c.id)
    themes.push({
      id: 'theme_risk_alert',
      type: 'risk_alert',
      title: 'Needs Attention',
      summary: warnings.length === 1
        ? warnings[0].headline
        : `${warnings.length} metrics declining — review recommended`,
      timespan: '7 days',
      priority: 'high',
      claims: warnings.slice(0, 5),
      metricTypes: [...new Set(warnings.map(c => c.metricType).filter(Boolean) as string[])],
      actionable: warnings[0]?.actionable || null,
    })
  }

  // 2. Protocol evidence themes (group by intervention)
  const interventionIds = [...new Set(claims.filter(c => c.interventionId).map(c => c.interventionId!))]
  for (const interventionId of interventionIds) {
    const protocolClaims = claims.filter(c =>
      c.interventionId === interventionId && !usedClaimIds.has(c.id)
    )
    if (protocolClaims.length === 0) continue

    for (const c of protocolClaims) usedClaimIds.add(c.id)
    const name = protocolClaims[0].interventionName || 'Protocol'
    const improvements = protocolClaims.filter(c => c.type === 'improvement')
    const declines = protocolClaims.filter(c => c.type === 'decline')

    themes.push({
      id: `theme_protocol_${interventionId}`,
      type: 'protocol_evidence',
      title: `${name} Effects`,
      summary: improvements.length > 0
        ? `${improvements.length} metric${improvements.length > 1 ? 's' : ''} improving since starting ${name}`
        : declines.length > 0
        ? `${declines.length} metric${declines.length > 1 ? 's' : ''} changed since starting ${name}`
        : `Tracking effects of ${name}`,
      timespan: 'Since start',
      priority: improvements.length > 0 || declines.length > 0 ? 'medium' : 'low',
      claims: protocolClaims.slice(0, 5),
      metricTypes: [...new Set(protocolClaims.map(c => c.metricType).filter(Boolean) as string[])],
      actionable: protocolClaims.find(c => c.actionable)?.actionable || null,
    })

    if (themes.length >= 5) break
  }

  // 3. Category-based themes
  const categoryThemes: Array<{ type: InsightThemeType; title: string }> = [
    { type: 'recovery_state', title: 'Recovery' },
    { type: 'sleep_architecture', title: 'Sleep' },
    { type: 'body_composition', title: 'Body Composition' },
    { type: 'training_response', title: 'Training & Activity' },
  ]

  for (const { type, title } of categoryThemes) {
    if (themes.length >= 5) break

    const metricSet = new Set(THEME_METRIC_MAP[type])
    const matchedClaims = claims.filter(c =>
      !usedClaimIds.has(c.id) && c.metricType && metricSet.has(c.metricType)
    )

    if (matchedClaims.length === 0) continue
    for (const c of matchedClaims) usedClaimIds.add(c.id)

    const topClaim = matchedClaims[0]
    const improvements = matchedClaims.filter(c => c.type === 'improvement')
    const observations = matchedClaims.filter(c => c.type === 'observation' || c.type === 'correlation')

    themes.push({
      id: `theme_${type}`,
      type,
      title,
      summary: topClaim.headline,
      timespan: topClaim.receipt.timeWindow.start && topClaim.receipt.timeWindow.end
        ? `${topClaim.receipt.timeWindow.start} — ${topClaim.receipt.timeWindow.end}`
        : 'Recent',
      priority: matchedClaims.some(c => c.priority === 'high') ? 'high' : 'medium',
      claims: matchedClaims.slice(0, 5),
      metricTypes: [...new Set(matchedClaims.map(c => c.metricType).filter(Boolean) as string[])],
      actionable: matchedClaims.find(c => c.actionable)?.actionable || null,
    })
  }

  // 4. Lifestyle impact (correlations not yet claimed)
  if (themes.length < 5) {
    const correlations = claims.filter(c => c.type === 'correlation' && !usedClaimIds.has(c.id))
    if (correlations.length > 0) {
      for (const c of correlations) usedClaimIds.add(c.id)
      themes.push({
        id: 'theme_lifestyle',
        type: 'lifestyle_impact',
        title: 'Lifestyle Patterns',
        summary: correlations[0].headline,
        timespan: 'Recent',
        priority: 'medium',
        claims: correlations.slice(0, 5),
        metricTypes: [...new Set(correlations.map(c => c.metricType).filter(Boolean) as string[])],
        actionable: correlations.find(c => c.actionable)?.actionable || null,
      })
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  themes.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return themes.slice(0, 5)
}
