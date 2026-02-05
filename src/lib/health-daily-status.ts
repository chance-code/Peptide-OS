// Daily Status Classification Engine
// Classifies today based on overnight metrics and evaluates yesterday's recommendation

import { subDays, format } from 'date-fns'
import { computeBaseline, type DailyMetricValue, METRIC_POLARITY } from './health-baselines'
import { getUnifiedMetrics } from './health-synthesis'
import type { MetricType } from './health-providers'
import { normalizeMetricUnit } from './health-providers'

export type DailyStatusType = 'recovery_priority' | 'training_window' | 'maintain' | 'peak_performance'

export interface DailySignal {
  metric: string
  value: number
  unit: string
  vs_baseline: 'above' | 'below' | 'normal'
  percent_diff: number
}

export interface NextDayEvaluation {
  yesterdayStatus: DailyStatusType
  yesterdayRecommendation: string
  todayOutcome: string
  improved: boolean
  metrics: { metric: string; yesterday: number; today: number; change_pct: number }[]
}

export interface DailyStatus {
  date: string
  status: DailyStatusType
  title: string
  subtitle: string
  icon: string
  color: string
  signals: DailySignal[]
  recommendation: string
  evaluation?: NextDayEvaluation
}

const KEY_METRICS: MetricType[] = [
  'sleep_duration', 'deep_sleep', 'sleep_score', 'sleep_efficiency', 'hrv', 'rhr',
]

const CONFIG: Record<DailyStatusType, {
  title: string; subtitle: string; icon: string; color: string; recommendation: string
}> = {
  recovery_priority: {
    title: 'Recovery Priority',
    subtitle: 'Low HRV and poor sleep — focus on rest today',
    icon: 'bed.double.fill', color: 'red',
    recommendation: 'Prioritize 8+ hours tonight. Skip intense exercise.',
  },
  maintain: {
    title: 'Steady Day',
    subtitle: 'Metrics are near baseline — stay the course',
    icon: 'equal.circle.fill', color: 'gold',
    recommendation: 'Moderate activity ok. Stay hydrated and aim for consistent sleep.',
  },
  training_window: {
    title: 'Training Window',
    subtitle: 'Good recovery — body is ready for a push',
    icon: 'figure.run', color: 'blue',
    recommendation: 'Great recovery — good day for challenging workouts.',
  },
  peak_performance: {
    title: 'Peak Performance Day',
    subtitle: 'All signals firing — make the most of today',
    icon: 'bolt.fill', color: 'green',
    recommendation: 'Everything firing — push your limits today.',
  },
}

function classifyScore(score: number): DailyStatusType {
  if (score >= 3) return 'peak_performance'
  if (score >= 1) return 'training_window'
  if (score >= -1) return 'maintain'
  return 'recovery_priority'
}

function rd(value: number, d: number): number {
  const f = Math.pow(10, d)
  return Math.round(value * f) / f
}

function pctChange(current: number, base: number): number {
  return base === 0 ? 0 : ((current - base) / Math.abs(base)) * 100
}

export async function getDailyStatus(userId: string): Promise<DailyStatus> {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const metricsMap = await getUnifiedMetrics(userId, subDays(now, 30), now, KEY_METRICS)

  const signals: DailySignal[] = []
  let totalScore = 0

  for (const metricType of KEY_METRICS) {
    const unified = metricsMap.get(metricType)
    if (!unified || unified.length === 0) continue

    const dailyValues: DailyMetricValue[] = unified.map(m => ({ date: m.date, value: m.value }))
    const baseline = computeBaseline(dailyValues, 28, now)
    if (!baseline) continue
    baseline.metricType = metricType

    // Most recent day's value
    const sorted = [...dailyValues].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const latest = sorted[0]
    if (!latest) continue

    const diff = latest.value - baseline.mean
    const pctDiff = rd(pctChange(latest.value, baseline.mean), 1)
    const vsBaseline: 'above' | 'below' | 'normal' =
      Math.abs(diff) <= baseline.stdDev ? 'normal' : diff > 0 ? 'above' : 'below'

    // Score: +1 above, -1 below, 0 normal. Invert for lower_better (e.g. RHR)
    const polarity = METRIC_POLARITY[metricType] ?? 'higher_better'
    let metricScore = 0
    if (vsBaseline === 'above') metricScore = polarity === 'lower_better' ? -1 : 1
    else if (vsBaseline === 'below') metricScore = polarity === 'lower_better' ? 1 : -1
    totalScore += metricScore

    signals.push({
      metric: metricType,
      value: rd(latest.value, 1),
      unit: normalizeMetricUnit(metricType),
      vs_baseline: vsBaseline,
      percent_diff: pctDiff,
    })
  }

  const status = classifyScore(totalScore)
  const cfg = CONFIG[status]
  const evaluation = buildEvaluation(metricsMap)

  return {
    date: today, status,
    title: cfg.title, subtitle: cfg.subtitle,
    icon: cfg.icon, color: cfg.color,
    signals, recommendation: cfg.recommendation,
    evaluation: evaluation ?? undefined,
  }
}

function buildEvaluation(
  metricsMap: Map<MetricType, { date: string; value: number }[]>,
): NextDayEvaluation | null {
  const evalMetrics: MetricType[] = ['sleep_duration', 'sleep_score', 'hrv', 'rhr']
  const changes: NextDayEvaluation['metrics'] = []
  let hasYesterday = false

  for (const mt of evalMetrics) {
    const unified = metricsMap.get(mt)
    if (!unified || unified.length < 2) continue
    const sorted = [...unified].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const [todayVal, yesterdayVal] = [sorted[0], sorted[1]]
    if (!todayVal || !yesterdayVal) continue

    const dayDiff = (new Date(todayVal.date).getTime() - new Date(yesterdayVal.date).getTime()) / 864e5
    if (dayDiff > 2) continue

    hasYesterday = true
    changes.push({
      metric: mt,
      yesterday: rd(yesterdayVal.value, 1),
      today: rd(todayVal.value, 1),
      change_pct: rd(pctChange(todayVal.value, yesterdayVal.value), 1),
    })
  }

  if (!hasYesterday || changes.length === 0) return null

  // Count polarity-aware improvements
  let improvementCount = 0
  for (const mc of changes) {
    const pol = METRIC_POLARITY[mc.metric] ?? 'higher_better'
    const improved = pol === 'lower_better' ? mc.change_pct < 0 : mc.change_pct > 0
    if (improved && Math.abs(mc.change_pct) > 1) improvementCount++
  }
  const improved = improvementCount > changes.length / 2

  const yesterdayStatus: DailyStatusType = improved ? 'recovery_priority' : 'maintain'
  const topChange = [...changes].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))[0]
  const dir = topChange.change_pct > 0 ? 'improved' : 'declined'

  return {
    yesterdayStatus,
    yesterdayRecommendation: CONFIG[yesterdayStatus].recommendation,
    todayOutcome: `${topChange.metric.replace(/_/g, ' ')} ${dir} by ${Math.abs(topChange.change_pct)}%`,
    improved,
    metrics: changes,
  }
}
