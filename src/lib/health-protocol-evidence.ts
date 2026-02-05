// Protocol Evidence Engine
// Computes evidence verdicts for active protocols — honest about uncertainty

import { subDays, parseISO, differenceInDays, format } from 'date-fns'
import { METRIC_POLARITY, computeBaseline, type MetricBaseline } from './health-baselines'
import type { SeedMetric, SeedIntervention, SeedContextEvent } from './demo-data/seed-metrics'

// ─── Types ───────────────────────────────────────────────────────────

export type EvidenceVerdict =
  | 'too_early'              // < 7 days
  | 'accumulating'           // 7-14 days, signal emerging
  | 'weak_positive'          // Small effect or low confidence
  | 'likely_positive'        // Consistent, medium+ effect
  | 'strong_positive'        // Large effect, high confidence
  | 'no_detectable_effect'   // Sufficient data, no change
  | 'possible_negative'      // Unexpected direction
  | 'confounded'             // > 40% confound days

export type RampPhase = 'loading' | 'building' | 'peak' | 'plateau'

export interface ObservedSignal {
  metricType: string
  metricName: string
  percentChange: number
  effectSize: number          // Cohen's d
  magnitude: 'large' | 'medium' | 'small' | 'negligible'
  direction: 'positive' | 'negative' | 'neutral'
  isGood: boolean
}

export interface ProtocolEvidence {
  protocolId: string
  protocolName: string
  protocolType: 'peptide' | 'supplement'
  daysOnProtocol: number
  verdict: EvidenceVerdict
  verdictExplanation: string
  observedSignals: ObservedSignal[]
  confidence: { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] }
  rampPhase: RampPhase
  rampExplanation: string
  confoundDays: number
  totalDays: number
}

// ─── Main Function ───────────────────────────────────────────────────

export function computeProtocolEvidence(
  interventions: SeedIntervention[],
  metrics: SeedMetric[],
  contextEvents: SeedContextEvent[],
  baselines: Map<string, MetricBaseline>
): ProtocolEvidence[] {
  return interventions.map(intervention =>
    computeSingleProtocolEvidence(intervention, metrics, contextEvents, baselines)
  )
}

function computeSingleProtocolEvidence(
  intervention: SeedIntervention,
  metrics: SeedMetric[],
  contextEvents: SeedContextEvent[],
  baselines: Map<string, MetricBaseline>
): ProtocolEvidence {
  const startDate = parseISO(intervention.startDate)
  const today = new Date()
  const daysOnProtocol = differenceInDays(today, startDate)

  // Ramp phase
  const rampPhase: RampPhase =
    daysOnProtocol <= 7 ? 'loading' :
    daysOnProtocol <= 21 ? 'building' :
    daysOnProtocol <= 60 ? 'peak' : 'plateau'

  const rampExplanation = {
    loading: 'Early days — effects typically not measurable yet.',
    building: 'Building phase — signals may start to emerge.',
    peak: 'Peak response window — best time to evaluate effects.',
    plateau: 'Plateau phase — effects should be well-established if present.',
  }[rampPhase]

  // Count confound days in the after period
  const confoundDays = contextEvents.filter(e => {
    const eventDate = parseISO(e.date)
    return eventDate >= startDate &&
      ['alcohol', 'travel', 'illness', 'stress'].includes(e.type)
  }).length

  // Too early check
  if (daysOnProtocol < 7) {
    return {
      protocolId: intervention.id,
      protocolName: intervention.name,
      protocolType: intervention.type,
      daysOnProtocol,
      verdict: 'too_early',
      verdictExplanation: `Only ${daysOnProtocol} day${daysOnProtocol === 1 ? '' : 's'} on protocol. Need at least 7 days before evaluating.`,
      observedSignals: [],
      confidence: { level: 'low', score: 20, reasons: ['Insufficient time on protocol'] },
      rampPhase,
      rampExplanation,
      confoundDays,
      totalDays: daysOnProtocol,
    }
  }

  // Confounded check
  if (daysOnProtocol > 0 && confoundDays / daysOnProtocol > 0.4) {
    return {
      protocolId: intervention.id,
      protocolName: intervention.name,
      protocolType: intervention.type,
      daysOnProtocol,
      verdict: 'confounded',
      verdictExplanation: `${confoundDays} of ${daysOnProtocol} days had confounding events (alcohol, travel, illness). Cannot reliably attribute changes to this protocol.`,
      observedSignals: [],
      confidence: { level: 'low', score: 25, reasons: [`${confoundDays}/${daysOnProtocol} days confounded`] },
      rampPhase,
      rampExplanation,
      confoundDays,
      totalDays: daysOnProtocol,
    }
  }

  // Compute observed signals across key metrics
  const observedSignals = computeObservedSignals(intervention, metrics, baselines)

  // Compute confidence
  const confidence = computeEvidenceConfidence(daysOnProtocol, confoundDays, observedSignals)

  // Determine verdict
  const verdict = determineVerdict(daysOnProtocol, confidence, observedSignals)
  const verdictExplanation = generateVerdictExplanation(verdict, observedSignals, intervention.name)

  return {
    protocolId: intervention.id,
    protocolName: intervention.name,
    protocolType: intervention.type,
    daysOnProtocol,
    verdict,
    verdictExplanation,
    observedSignals,
    confidence,
    rampPhase,
    rampExplanation,
    confoundDays,
    totalDays: daysOnProtocol,
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  hrv: 'HRV',
  rhr: 'Resting HR',
  deep_sleep: 'Deep sleep',
  rem_sleep: 'REM sleep',
  sleep_duration: 'Sleep duration',
  sleep_efficiency: 'Sleep efficiency',
  sleep_score: 'Sleep score',
  steps: 'Steps',
  active_calories: 'Active calories',
  exercise_minutes: 'Exercise',
  weight: 'Weight',
  body_fat_percentage: 'Body fat',
  lean_body_mass: 'Lean mass',
  muscle_mass: 'Muscle mass',
  vo2_max: 'VO2 Max',
  blood_oxygen: 'Blood O2',
  respiratory_rate: 'Respiratory rate',
}

function computeObservedSignals(
  intervention: SeedIntervention,
  metrics: SeedMetric[],
  baselines: Map<string, MetricBaseline>
): ObservedSignal[] {
  const startDate = parseISO(intervention.startDate)
  const signals: ObservedSignal[] = []

  const keyMetrics = [
    'hrv', 'rhr', 'deep_sleep', 'sleep_efficiency', 'sleep_score',
    'rem_sleep', 'sleep_duration',
    'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
    'vo2_max', 'steps', 'active_calories', 'exercise_minutes',
    'respiratory_rate', 'blood_oxygen',
  ]

  for (const metricType of keyMetrics) {
    const metricData = metrics.filter(m => m.metricType === metricType)
    const beforeData = metricData.filter(m => parseISO(m.date) < startDate)
    const afterData = metricData.filter(m => parseISO(m.date) >= startDate)

    // Need minimum data in both periods
    const minPoints = ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass'].includes(metricType) ? 3 : 5
    if (beforeData.length < minPoints || afterData.length < minPoints) continue

    const beforeValues = beforeData.map(m => m.value)
    const afterValues = afterData.map(m => m.value)

    const beforeMean = beforeValues.reduce((a, b) => a + b, 0) / beforeValues.length
    const afterMean = afterValues.reduce((a, b) => a + b, 0) / afterValues.length

    if (beforeMean === 0) continue

    // FIX: Use sample variance (n-1) and proper weighted pooled variance formula
    const n1 = beforeValues.length
    const n2 = afterValues.length
    const beforeVar = beforeValues.reduce((sum, v) => sum + Math.pow(v - beforeMean, 2), 0) / (n1 - 1)
    const afterVar = afterValues.reduce((sum, v) => sum + Math.pow(v - afterMean, 2), 0) / (n2 - 1)

    // Weighted pooled standard deviation (correct formula)
    const pooledVar = ((n1 - 1) * beforeVar + (n2 - 1) * afterVar) / (n1 + n2 - 2)
    const pooledStd = Math.sqrt(pooledVar)

    const cohensD = pooledStd !== 0 ? (afterMean - beforeMean) / pooledStd : 0
    const percentChange = ((afterMean - beforeMean) / beforeMean) * 100

    const absCohensD = Math.abs(cohensD)
    const magnitude: ObservedSignal['magnitude'] =
      absCohensD >= 0.8 ? 'large' :
      absCohensD >= 0.5 ? 'medium' :
      absCohensD >= 0.2 ? 'small' : 'negligible'

    if (magnitude === 'negligible') continue

    const direction: ObservedSignal['direction'] =
      absCohensD < 0.2 ? 'neutral' :
      cohensD > 0 ? 'positive' : 'negative'

    const polarity = METRIC_POLARITY[metricType] || 'higher_better'
    const isGood = (polarity === 'higher_better' && direction === 'positive') ||
                   (polarity === 'lower_better' && direction === 'negative')

    signals.push({
      metricType,
      metricName: METRIC_DISPLAY_NAMES[metricType] || metricType,
      percentChange: Math.round(percentChange * 10) / 10,
      effectSize: Math.round(cohensD * 100) / 100,
      magnitude,
      direction,
      isGood,
    })
  }

  // Sort by absolute effect size
  signals.sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
  return signals
}

function computeEvidenceConfidence(
  daysOnProtocol: number,
  confoundDays: number,
  signals: ObservedSignal[]
): { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 40

  // Time on protocol
  if (daysOnProtocol >= 21) {
    score += 25
    reasons.push(`Strong time window (${daysOnProtocol} days)`)
  } else if (daysOnProtocol >= 14) {
    score += 15
    reasons.push(`Adequate time window (${daysOnProtocol} days)`)
  } else {
    score += 5
    reasons.push(`Limited time window (${daysOnProtocol} days)`)
  }

  // Confounds
  if (confoundDays === 0) {
    score += 15
    reasons.push('No confounding events')
  } else {
    const ratio = confoundDays / daysOnProtocol
    if (ratio < 0.2) {
      score += 5
      reasons.push(`Minor confounds (${confoundDays} days)`)
    } else {
      score -= 10
      reasons.push(`Notable confounds (${confoundDays} days)`)
    }
  }

  // Signal strength
  const strongSignals = signals.filter(s => s.magnitude === 'large' || s.magnitude === 'medium')
  if (strongSignals.length >= 2) {
    score += 15
    reasons.push(`${strongSignals.length} metrics with medium+ effect size`)
  } else if (strongSignals.length === 1) {
    score += 5
  }

  score = Math.max(20, Math.min(95, score))

  const level: 'high' | 'medium' | 'low' =
    score >= 70 ? 'high' :
    score >= 45 ? 'medium' : 'low'

  return { level, score, reasons }
}

function determineVerdict(
  daysOnProtocol: number,
  confidence: { level: 'high' | 'medium' | 'low'; score: number },
  signals: ObservedSignal[]
): EvidenceVerdict {
  // Accumulating: 7-14 days and not high confidence
  if (daysOnProtocol < 14 && confidence.level !== 'high') {
    return signals.some(s => s.isGood && s.magnitude !== 'negligible')
      ? 'accumulating'
      : 'too_early'
  }

  const positiveSignals = signals.filter(s => s.isGood && s.magnitude !== 'negligible')
  const negativeSignals = signals.filter(s => !s.isGood && s.magnitude !== 'negligible')

  // Possible negative
  if (negativeSignals.length > positiveSignals.length && negativeSignals.some(s => s.magnitude === 'large' || s.magnitude === 'medium')) {
    return 'possible_negative'
  }

  // No detectable effect
  if (positiveSignals.length === 0 && negativeSignals.length === 0 && daysOnProtocol >= 14) {
    return 'no_detectable_effect'
  }

  // Positive verdicts
  if (positiveSignals.length > 0) {
    const hasLargeEffect = positiveSignals.some(s => s.magnitude === 'large')
    const hasMediumEffect = positiveSignals.some(s => s.magnitude === 'medium')

    if (hasLargeEffect && confidence.level === 'high') return 'strong_positive'
    if (hasMediumEffect || (hasLargeEffect && confidence.level !== 'low')) return 'likely_positive'
    return 'weak_positive'
  }

  // Default to accumulating for shorter windows
  if (daysOnProtocol < 21) return 'accumulating'
  return 'no_detectable_effect'
}

function generateVerdictExplanation(
  verdict: EvidenceVerdict,
  signals: ObservedSignal[],
  protocolName: string
): string {
  const topPositive = signals.filter(s => s.isGood).slice(0, 2)
  const topNegative = signals.filter(s => !s.isGood).slice(0, 2)

  switch (verdict) {
    case 'too_early':
      return `Not enough time on ${protocolName} to evaluate effects. Check back after 7-14 days.`
    case 'accumulating':
      if (topPositive.length > 0) {
        return `Early signals emerging: ${topPositive.map(s => `${s.metricName} ${s.percentChange > 0 ? '+' : ''}${s.percentChange.toFixed(0)}%`).join(', ')}. Need more time to confirm.`
      }
      return `Data accumulating for ${protocolName}. No clear signal yet.`
    case 'weak_positive':
      return `Small positive effects detected: ${topPositive.map(s => `${s.metricName} ${s.percentChange > 0 ? '+' : ''}${s.percentChange.toFixed(0)}%`).join(', ')}. Effect sizes are small.`
    case 'likely_positive':
      return `${topPositive.map(s => `${s.metricName} improved ${Math.abs(s.percentChange).toFixed(0)}% with ${s.magnitude} effect size`).join('. ')}. ${topPositive.length > 1 ? 'Multiple metrics responding.' : ''}`
    case 'strong_positive':
      return `Strong evidence of benefit. ${topPositive.map(s => `${s.metricName} +${Math.abs(s.percentChange).toFixed(0)}% (d=${s.effectSize.toFixed(1)})`).join(', ')}.`
    case 'no_detectable_effect':
      return `No meaningful changes detected since starting ${protocolName}. Metrics are within normal variation.`
    case 'possible_negative':
      return `Some metrics moved unfavorably: ${topNegative.map(s => `${s.metricName} ${s.percentChange > 0 ? '+' : ''}${s.percentChange.toFixed(0)}%`).join(', ')}. Consider reviewing dosing or timing.`
    case 'confounded':
      return `Too many confounding events (alcohol, travel, illness) to reliably evaluate ${protocolName}.`
  }
}
