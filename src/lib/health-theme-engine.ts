// Health Theme Engine
// Clusters individual signals into high-level themes with narratives.
// Instead of "HRV is up", tells the user: "Recovery is driving your progress."

import prisma from '@/lib/prisma'
import { subDays, format } from 'date-fns'
import { getUnifiedMetrics, type UnifiedDailyMetric } from './health-synthesis'
import { METRIC_POLARITY } from './health-baselines'
import { safePercentChange } from './health-constants'
import { getMetricDef } from './health-metric-contract'
import type { MetricType } from './health-constants'

// ─── Types ───────────────────────────────────────────────────────────

export type ThemeType =
  | 'recovery_driving'       // HRV + RHR + sleep all improving
  | 'sleep_breakthrough'     // Sleep quality significantly better
  | 'activity_surge'         // Activity metrics up together
  | 'body_recomposing'       // Fat down + muscle up
  | 'protocol_responding'    // Multiple metrics shifting after protocol start
  | 'overtraining_risk'      // Activity up but HRV/recovery declining
  | 'metabolic_shift'        // Basal + weight + body comp changing together
  | 'consistency_payoff'     // Stable adherence leading to gradual improvements
  | 'sleep_debt'             // Sleep metrics declining across the board

export interface Theme {
  type: ThemeType
  title: string
  narrative: string
  signals: ThemeSignal[]
  strength: number            // 0-100
  novelty: 'new' | 'continuing' | 'resolved'
  priority: 'high' | 'medium' | 'low'
  correlations: ThemeCorrelation[]
  relatedProtocols: string[]
  iconName: string
  accentColor: string
}

export interface ThemeSignal {
  metricType: string
  displayName: string
  direction: 'improving' | 'stable' | 'declining'
  strength: number
  percentChange: number
}

export interface ThemeCorrelation {
  metric1: string
  metric2: string
  r: number
  narrative: string
}

// ─── Theme Definitions ───────────────────────────────────────────────

interface ThemeRule {
  type: ThemeType
  title: string
  requiredMetrics: string[]
  detect: (changes: Map<string, MetricState>) => boolean
  narrative: (changes: Map<string, MetricState>) => string
  priority: 'high' | 'medium' | 'low'
  iconName: string
  accentColor: string
}

interface MetricState {
  current: number
  previous: number
  change: number
  direction: 'improving' | 'stable' | 'declining'
  dataPoints: number
}

const THEME_RULES: ThemeRule[] = [
  {
    type: 'recovery_driving',
    title: 'Recovery is driving your progress',
    requiredMetrics: ['hrv', 'resting_heart_rate'],
    detect: (changes) => {
      const hrv = changes.get('hrv')
      const rhr = changes.get('resting_heart_rate')
      const sleep = changes.get('sleep_efficiency') ?? changes.get('sleep_duration')
      return (
        hrv?.direction === 'improving' &&
        (rhr?.direction === 'improving' || !rhr) &&
        (sleep?.direction !== 'declining')
      ) ?? false
    },
    narrative: (changes) => {
      const hrv = changes.get('hrv')
      const parts = ['HRV']
      if (changes.get('resting_heart_rate')?.direction === 'improving') parts.push('resting heart rate')
      if (changes.get('sleep_efficiency')?.direction === 'improving') parts.push('sleep quality')
      if (changes.get('sleep_duration')?.direction === 'improving') parts.push('sleep duration')
      const metrics = parts.join(', ')
      return `${metrics} are all trending favorably. Your body is recovering well${hrv ? ` — HRV ${hrv.change > 0 ? 'up' : 'down'} ${Math.abs(hrv.change).toFixed(1)}%` : ''}.`
    },
    priority: 'high',
    iconName: 'heart.circle.fill',
    accentColor: 'green',
  },
  {
    type: 'sleep_breakthrough',
    title: 'Sleep quality breakthrough',
    requiredMetrics: ['sleep_duration'],
    detect: (changes) => {
      const duration = changes.get('sleep_duration')
      const deep = changes.get('deep_sleep')
      const efficiency = changes.get('sleep_efficiency')
      const improvingCount = [duration, deep, efficiency].filter(m => m?.direction === 'improving').length
      return improvingCount >= 2
    },
    narrative: (changes) => {
      const parts: string[] = []
      if (changes.get('sleep_duration')?.direction === 'improving') {
        parts.push(`duration ${changes.get('sleep_duration')!.change > 0 ? 'up' : 'down'} ${Math.abs(changes.get('sleep_duration')!.change).toFixed(1)}%`)
      }
      if (changes.get('deep_sleep')?.direction === 'improving') {
        parts.push(`deep sleep ${changes.get('deep_sleep')!.change > 0 ? 'up' : 'down'} ${Math.abs(changes.get('deep_sleep')!.change).toFixed(1)}%`)
      }
      if (changes.get('sleep_efficiency')?.direction === 'improving') {
        parts.push(`efficiency improving`)
      }
      return `Your sleep has significantly improved — ${parts.join(', ')}. This drives recovery and cognitive performance.`
    },
    priority: 'high',
    iconName: 'moon.circle.fill',
    accentColor: 'indigo',
  },
  {
    type: 'activity_surge',
    title: 'Activity on the rise',
    requiredMetrics: ['steps'],
    detect: (changes) => {
      const steps = changes.get('steps')
      const exercise = changes.get('exercise_minutes')
      const calories = changes.get('active_calories')
      const improvingCount = [steps, exercise, calories].filter(m => m?.direction === 'improving').length
      return improvingCount >= 2
    },
    narrative: (changes) => {
      const parts: string[] = []
      if (changes.get('steps')?.direction === 'improving') parts.push('steps')
      if (changes.get('exercise_minutes')?.direction === 'improving') parts.push('exercise time')
      if (changes.get('active_calories')?.direction === 'improving') parts.push('active calories')
      return `${parts.join(', ')} are all climbing. Great consistency — make sure recovery keeps pace.`
    },
    priority: 'medium',
    iconName: 'figure.run.circle.fill',
    accentColor: 'orange',
  },
  {
    type: 'body_recomposing',
    title: 'Body recomposition in progress',
    requiredMetrics: ['body_fat_percentage'],
    detect: (changes) => {
      const fat = changes.get('body_fat_percentage')
      const lean = changes.get('lean_body_mass') ?? changes.get('muscle_mass')
      return fat?.direction === 'improving' && lean?.direction === 'improving'
    },
    narrative: (changes) => {
      const fat = changes.get('body_fat_percentage')
      const lean = changes.get('lean_body_mass') ?? changes.get('muscle_mass')
      const fatChange = fat ? `body fat ${fat.change > 0 ? 'up' : 'down'} ${Math.abs(fat.change).toFixed(1)}%` : ''
      const leanChange = lean ? `, lean mass ${lean.change > 0 ? 'up' : 'down'} ${Math.abs(lean.change).toFixed(1)}%` : ''
      return `You're recomposing — ${fatChange}${leanChange}. This is the gold standard of body composition change.`
    },
    priority: 'high',
    iconName: 'scalemass.fill',
    accentColor: 'cyan',
  },
  {
    type: 'overtraining_risk',
    title: 'Watch for overtraining',
    requiredMetrics: ['hrv'],
    detect: (changes) => {
      const hrv = changes.get('hrv')
      const rhr = changes.get('resting_heart_rate')
      const activity = changes.get('steps') ?? changes.get('exercise_minutes')
      // Activity up but recovery declining
      return (
        hrv?.direction === 'declining' &&
        (rhr?.direction === 'declining' || !rhr) &&
        activity?.direction === 'improving'
      ) ?? false
    },
    narrative: () => {
      return 'Activity is increasing while recovery markers are declining. Consider a rest day or reducing intensity to prevent burnout.'
    },
    priority: 'high',
    iconName: 'exclamationmark.triangle.fill',
    accentColor: 'orange',
  },
  {
    type: 'sleep_debt',
    title: 'Sleep debt accumulating',
    requiredMetrics: ['sleep_duration'],
    detect: (changes) => {
      const duration = changes.get('sleep_duration')
      const deep = changes.get('deep_sleep')
      const efficiency = changes.get('sleep_efficiency')
      const decliningCount = [duration, deep, efficiency].filter(m => m?.direction === 'declining').length
      return decliningCount >= 2
    },
    narrative: (changes) => {
      const parts: string[] = []
      if (changes.get('sleep_duration')?.direction === 'declining') parts.push('duration')
      if (changes.get('deep_sleep')?.direction === 'declining') parts.push('deep sleep')
      if (changes.get('sleep_efficiency')?.direction === 'declining') parts.push('efficiency')
      return `Sleep quality is declining across ${parts.join(' and ')}. This will cascade into recovery and performance within days.`
    },
    priority: 'high',
    iconName: 'moon.zzz.fill',
    accentColor: 'red',
  },
  {
    type: 'metabolic_shift',
    title: 'Metabolic adaptation detected',
    requiredMetrics: ['weight'],
    detect: (changes) => {
      const weight = changes.get('weight')
      const basal = changes.get('basal_calories')
      const fat = changes.get('body_fat_percentage')
      // Weight stalled + basal declining = metabolic adaptation
      return weight?.direction === 'stable' && basal?.direction === 'declining'
    },
    narrative: () => {
      return 'Weight has stalled while basal metabolic rate is declining. Your body may be adapting to current caloric intake. Consider a refeed day or temporary diet break.'
    },
    priority: 'medium',
    iconName: 'flame.fill',
    accentColor: 'yellow',
  },
  {
    type: 'protocol_responding',
    title: 'Protocol is driving results',
    requiredMetrics: ['hrv'],
    detect: (changes) => {
      // Count how many metrics are improving
      let improvingCount = 0
      for (const [, state] of changes) {
        if (state.direction === 'improving') improvingCount++
      }
      // Trigger when 3+ metrics are improving simultaneously
      return improvingCount >= 3
    },
    narrative: (changes) => {
      const improving: string[] = []
      for (const [mt, state] of changes) {
        if (state.direction === 'improving') {
          const def = getMetricDef(mt)
          improving.push(def?.displayName ?? mt)
        }
      }
      const top = improving.slice(0, 4).join(', ')
      return `Multiple health metrics are shifting favorably — ${top}. Your active protocol appears to be taking effect.`
    },
    priority: 'high',
    iconName: 'pills.fill',
    accentColor: 'teal',
  },
  {
    type: 'consistency_payoff',
    title: 'Consistency is paying off',
    requiredMetrics: ['hrv'],
    detect: (changes) => {
      // Check for gradual, broad improvement: 4+ metrics improving with small (<15%) changes
      let gradualImprovingCount = 0
      let totalWithData = 0
      for (const [, state] of changes) {
        totalWithData++
        if (state.direction === 'improving' && Math.abs(state.change) < 15) {
          gradualImprovingCount++
        }
      }
      return gradualImprovingCount >= 4
    },
    narrative: (changes) => {
      const gradual: string[] = []
      for (const [mt, state] of changes) {
        if (state.direction === 'improving' && Math.abs(state.change) < 15) {
          const def = getMetricDef(mt)
          gradual.push(`${def?.displayName ?? mt} (${state.change > 0 ? '+' : ''}${state.change.toFixed(1)}%)`)
        }
      }
      const top = gradual.slice(0, 4).join(', ')
      return `Steady, incremental improvements across ${gradual.length} metrics — ${top}. Small consistent gains compound over time.`
    },
    priority: 'medium',
    iconName: 'chart.line.uptrend.xyaxis',
    accentColor: 'green',
  },
]

// ─── Cross-Metric Correlations ───────────────────────────────────────

const CORRELATION_PAIRS: [string, string][] = [
  ['sleep_duration', 'hrv'],
  ['exercise_minutes', 'deep_sleep'],
  ['steps', 'resting_heart_rate'],
  ['weight', 'body_fat_percentage'],
  ['sleep_efficiency', 'readiness_score'],
  ['active_calories', 'hrv'],
]

function computePearsonR(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 5) return null
  const n = x.length
  const sumX = x.reduce((s, v) => s + v, 0)
  const sumY = y.reduce((s, v) => s + v, 0)
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0)
  const sumX2 = x.reduce((s, v) => s + v * v, 0)
  const sumY2 = y.reduce((s, v) => s + v * v, 0)

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

  if (denominator === 0) return null
  return numerator / denominator
}

// ─── Main Function ───────────────────────────────────────────────────

export async function generateThemes(
  userId: string,
  periodDays: number = 7,
): Promise<Theme[]> {
  const endDate = new Date()
  const startDate = subDays(endDate, periodDays)
  const prevStart = subDays(startDate, periodDays)

  // Fetch current and previous period metrics
  const [currentMetrics, previousMetrics] = await Promise.all([
    getUnifiedMetrics(userId, startDate, endDate),
    getUnifiedMetrics(userId, prevStart, startDate),
  ])

  // Compute metric states
  const metricStates = new Map<string, MetricState>()

  for (const [metricType, currentVals] of currentMetrics) {
    if (currentVals.length < 2) continue
    const previousVals = previousMetrics.get(metricType)
    if (!previousVals || previousVals.length < 2) continue

    const currentAvg = currentVals.reduce((s, m) => s + m.value, 0) / currentVals.length
    const previousAvg = previousVals.reduce((s, m) => s + m.value, 0) / previousVals.length
    const change = safePercentChange(currentAvg, previousAvg) ?? 0
    const polarity = METRIC_POLARITY[metricType] ?? 'higher_better'

    let direction: 'improving' | 'stable' | 'declining'
    const stableThreshold = 2
    if (Math.abs(change) < stableThreshold) {
      direction = 'stable'
    } else if (polarity === 'higher_better') {
      direction = change > 0 ? 'improving' : 'declining'
    } else if (polarity === 'lower_better') {
      direction = change < 0 ? 'improving' : 'declining'
    } else {
      direction = 'stable'
    }

    metricStates.set(metricType, {
      current: currentAvg,
      previous: previousAvg,
      change,
      direction,
      dataPoints: currentVals.length,
    })
  }

  // Detect themes
  const themes: Theme[] = []

  for (const rule of THEME_RULES) {
    // Check if required metrics have data
    const hasRequired = rule.requiredMetrics.some(m => metricStates.has(m))
    if (!hasRequired) continue

    if (rule.detect(metricStates)) {
      // Collect signals for this theme
      const signals: ThemeSignal[] = []
      for (const [mt, state] of metricStates) {
        if (state.direction !== 'stable') {
          const def = getMetricDef(mt)
          signals.push({
            metricType: mt,
            displayName: def?.displayName ?? mt,
            direction: state.direction,
            strength: Math.min(Math.abs(state.change) / 20, 1), // normalize to 0-1
            percentChange: state.change,
          })
        }
      }

      // Compute strength based on number and magnitude of signals
      const strength = Math.min(
        signals.reduce((s, sig) => s + sig.strength, 0) / Math.max(signals.length, 1) * 100,
        100
      )

      // Compute correlations relevant to this theme
      const correlations = computeCorrelations(currentMetrics, periodDays)

      // Find related protocols
      const relatedProtocols = await findRelatedProtocols(userId)

      themes.push({
        type: rule.type,
        title: rule.title,
        narrative: rule.narrative(metricStates),
        signals: signals.sort((a, b) => b.strength - a.strength).slice(0, 5),
        strength: Math.round(strength),
        novelty: 'new', // Would need historical theme tracking for continuing/resolved
        priority: rule.priority,
        correlations,
        relatedProtocols,
        iconName: rule.iconName,
        accentColor: rule.accentColor,
      })
    }
  }

  // Sort by priority (high > medium > low) then strength
  const priorityOrder = { high: 3, medium: 2, low: 1 }
  themes.sort((a, b) => {
    const pDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
    if (pDiff !== 0) return pDiff
    return b.strength - a.strength
  })

  return themes
}

// ─── Helpers ─────────────────────────────────────────────────────────

function computeCorrelations(
  metrics: Map<MetricType, UnifiedDailyMetric[]>,
  periodDays: number,
): ThemeCorrelation[] {
  const correlations: ThemeCorrelation[] = []

  for (const [m1, m2] of CORRELATION_PAIRS) {
    const vals1 = metrics.get(m1 as MetricType)
    const vals2 = metrics.get(m2 as MetricType)
    if (!vals1 || !vals2) continue

    // Align by date
    const dateMap1 = new Map(vals1.map(v => [v.date, v.value]))
    const dateMap2 = new Map(vals2.map(v => [v.date, v.value]))

    const aligned1: number[] = []
    const aligned2: number[] = []
    for (const [date, val] of dateMap1) {
      const val2 = dateMap2.get(date)
      if (val2 != null) {
        aligned1.push(val)
        aligned2.push(val2)
      }
    }

    const r = computePearsonR(aligned1, aligned2)
    if (r != null && Math.abs(r) > 0.4) {
      const def1 = getMetricDef(m1)
      const def2 = getMetricDef(m2)
      const name1 = def1?.displayName ?? m1
      const name2 = def2?.displayName ?? m2
      const direction = r > 0 ? 'move together' : 'inversely related'
      correlations.push({
        metric1: m1,
        metric2: m2,
        r: Math.round(r * 100) / 100,
        narrative: `${name1} and ${name2} are ${direction} (r=${r.toFixed(2)}).`,
      })
    }
  }

  return correlations
}

async function findRelatedProtocols(userId: string): Promise<string[]> {
  const protocols = await prisma.protocol.findMany({
    where: { userId, status: 'active' },
    include: { peptide: { select: { name: true } } },
    take: 5,
  })
  return protocols.map(p => p.peptide?.name ?? 'Unknown')
}
