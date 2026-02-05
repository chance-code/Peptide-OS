// Protocol Tuning Engine — analyzes response curves and generates tuning recommendations

import prisma from '@/lib/prisma'
import { getUnifiedMetrics } from './health-synthesis'
import { computeBaseline, type DailyMetricValue } from './health-baselines'
import { findProtocolMechanism, getAffectedMetrics } from './protocol-mechanisms'
import { safeDivide, safePercentChange } from './health-constants'
import type { MetricType } from './health-providers'

export type TuningType = 'dose_increase' | 'dose_decrease' | 'timing_change' | 'stack_suggestion' | 'duration_extension' | 'consider_cycling'

export interface ProtocolTuningRecommendation {
  protocolId: string
  protocolName: string
  peptideCategory: string
  daysSinceStart: number
  tunings: TuningItem[]
  overallAssessment: string
  responsePhase: 'loading' | 'responding' | 'plateau' | 'diminishing'
}

export interface TuningItem {
  type: TuningType
  title: string
  rationale: string
  confidence: 'high' | 'medium' | 'low'
  metrics: string[]
  priority: number // 1-10
}

interface WindowEffect {
  metricType: string
  windowIndex: number
  effectSize: number // Percent change vs pre-protocol baseline
  dataPoints: number
}

const BEFORE_WINDOW = 28
const ROLLING_WINDOW = 14
const MIN_PTS = 3
const PLATEAU_RATIO = 0.5

export async function analyzeProtocolTuning(
  userId: string,
  protocolId?: string
): Promise<ProtocolTuningRecommendation[]> {
  const where: { userId: string; status: string; id?: string } = { userId, status: 'active' }
  if (protocolId) where.id = protocolId

  const protocols = await prisma.protocol.findMany({
    where,
    include: { peptide: { select: { name: true, type: true, category: true } } },
    orderBy: { startDate: 'desc' },
    take: 10,
  })

  const results: ProtocolTuningRecommendation[] = []

  for (const protocol of protocols) {
    const startDate = new Date(protocol.startDate)
    const now = new Date()
    const days = Math.floor((now.getTime() - startDate.getTime()) / 86400000)
    if (days < 14) continue

    const name = protocol.peptide.name
    const mechanism = findProtocolMechanism(name)
    const category = mechanism?.category ?? protocol.peptide.type ?? 'unknown'
    const affected = getAffectedMetrics(name)
    if (affected.length === 0) continue

    const beforeStart = new Date(startDate)
    beforeStart.setDate(beforeStart.getDate() - BEFORE_WINDOW)
    const beforeMetrics = await getUnifiedMetrics(userId, beforeStart, startDate, affected as MetricType[])
    const afterMetrics = await getUnifiedMetrics(userId, startDate, now, affected as MetricType[])

    const effects = computeRollingEffects(affected, beforeMetrics, afterMetrics, startDate, days)
    if (effects.length === 0) continue

    const phase = detectPhase(days, effects)
    const tunings = generateTunings(name, phase, effects, days, mechanism)

    results.push({
      protocolId: protocol.id,
      protocolName: name,
      peptideCategory: category,
      daysSinceStart: days,
      tunings: tunings.sort((a, b) => b.priority - a.priority),
      overallAssessment: buildAssessment(name, phase, days, effects),
      responsePhase: phase,
    })
  }

  return results
}

function computeRollingEffects(
  metricTypes: string[],
  beforeMetrics: Map<MetricType, { date: string; value: number }[]>,
  afterMetrics: Map<MetricType, { date: string; value: number }[]>,
  startDate: Date,
  days: number
): WindowEffect[] {
  const effects: WindowEffect[] = []
  const numWindows = Math.max(1, Math.floor(days / ROLLING_WINDOW))

  for (const mt of metricTypes) {
    const before = beforeMetrics.get(mt as MetricType) ?? []
    if (before.length < MIN_PTS) continue
    const vals: DailyMetricValue[] = before.map(m => ({ date: m.date, value: m.value }))
    const baseline = computeBaseline(vals, BEFORE_WINDOW, startDate, MIN_PTS)
    if (!baseline || baseline.mean === 0) continue

    const after = afterMetrics.get(mt as MetricType) ?? []
    if (after.length < MIN_PTS) continue

    for (let w = 0; w < numWindows; w++) {
      const wStart = new Date(startDate)
      wStart.setDate(wStart.getDate() + w * ROLLING_WINDOW)
      const wEnd = new Date(wStart)
      wEnd.setDate(wEnd.getDate() + ROLLING_WINDOW)

      const wData = after.filter(m => { const d = new Date(m.date); return d >= wStart && d < wEnd })
      if (wData.length < MIN_PTS) continue

      const avg = wData.reduce((s, m) => s + m.value, 0) / wData.length
      effects.push({ metricType: mt, windowIndex: w, effectSize: safePercentChange(avg, baseline.mean) ?? 0, dataPoints: wData.length })
    }
  }
  return effects
}

function detectPhase(days: number, effects: WindowEffect[]): 'loading' | 'responding' | 'plateau' | 'diminishing' {
  if (days <= 14) return 'loading'

  const peak = Math.max(...effects.map(e => Math.abs(e.effectSize)), 0)
  if (peak === 0) return 'loading'

  // Compute average effect per window, find peak window avg and latest window avg
  const maxWin = Math.max(...effects.map(e => e.windowIndex))
  const latest = effects.filter(e => e.windowIndex === maxWin)
  const latestAvg = latest.length > 0 ? latest.reduce((s, e) => s + Math.abs(e.effectSize), 0) / latest.length : 0

  const windowTotals = new Map<number, { sum: number; count: number }>()
  for (const e of effects) {
    const cur = windowTotals.get(e.windowIndex) ?? { sum: 0, count: 0 }
    windowTotals.set(e.windowIndex, { sum: cur.sum + Math.abs(e.effectSize), count: cur.count + 1 })
  }
  let peakAvg = 0
  for (const [, { sum, count }] of windowTotals) {
    const avg = safeDivide(sum, count) ?? 0
    if (avg > peakAvg) peakAvg = avg
  }

  if (days > 90 && latestAvg < peakAvg * PLATEAU_RATIO) return 'diminishing'
  if (days > 45 && latestAvg < peakAvg * PLATEAU_RATIO) return 'plateau'
  return 'responding'
}

function generateTunings(
  name: string,
  phase: 'loading' | 'responding' | 'plateau' | 'diminishing',
  effects: WindowEffect[],
  days: number,
  mechanism: ReturnType<typeof findProtocolMechanism>
): TuningItem[] {
  const tunings: TuningItem[] = []
  const metrics = [...new Set(effects.map(e => e.metricType))]
  const synergy = mechanism?.synergyWith?.[0]

  if (phase === 'loading') {
    tunings.push({ type: 'duration_extension', title: 'Too early for tuning', rationale: `${name} started ${days} days ago. Most protocols need 2-4 weeks before effects are measurable.`, confidence: 'high', metrics, priority: 3 })
    return tunings
  }

  if (phase === 'responding') {
    tunings.push({ type: 'duration_extension', title: 'Protocol is working -- maintain current approach', rationale: `${name} is producing measurable improvements. No adjustments recommended.`, confidence: 'high', metrics, priority: 7 })
    if (metrics.length === 1 && synergy) {
      tunings.push({ type: 'stack_suggestion', title: `Consider pairing with ${synergy}`, rationale: `${name} is improving ${metrics[0].replace(/_/g, ' ')} but only one metric is responding. ${synergy} has synergistic mechanisms that may broaden the effect.`, confidence: 'medium', metrics, priority: 4 })
    }
    return tunings
  }

  if (phase === 'plateau') {
    tunings.push({ type: 'dose_increase', title: 'Consider dose adjustment', rationale: `${name} response has plateaued after ${days} days. A modest dose increase may restart progress. Discuss with your provider.`, confidence: 'medium', metrics, priority: 7 })
    tunings.push({ type: 'timing_change', title: 'Try shifting administration timing', rationale: `Changing administration time (e.g., morning to evening) can improve absorption and reset the response curve.`, confidence: 'low', metrics, priority: 5 })
    if (synergy) {
      tunings.push({ type: 'stack_suggestion', title: `Consider adding ${synergy}`, rationale: `${synergy} has synergistic mechanisms with ${name} that may help push past the current plateau.`, confidence: 'medium', metrics, priority: 6 })
    }
    return tunings
  }

  // diminishing
  tunings.push({ type: 'consider_cycling', title: 'Consider a washout period', rationale: `${name} showing diminishing returns after ${days} days. A 2-week washout may restore receptor sensitivity.`, confidence: 'high', metrics, priority: 9 })
  tunings.push({ type: 'dose_decrease', title: 'Consider reducing dose', rationale: `Receptor desensitization may be occurring. A lower maintenance dose could sustain benefits with less downregulation.`, confidence: 'medium', metrics, priority: 6 })
  return tunings
}

function buildAssessment(name: string, phase: string, days: number, effects: WindowEffect[]): string {
  const maxWin = Math.max(...effects.map(e => e.windowIndex), 0)
  const top = effects.filter(e => e.windowIndex === maxWin).sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))[0]

  switch (phase) {
    case 'loading':
      return `${name} started ${days} days ago. Too early for meaningful tuning -- continue current approach.`
    case 'responding':
      return top
        ? `${name} actively improving ${top.metricType.replace(/_/g, ' ')} (${top.effectSize > 0 ? '+' : ''}${top.effectSize.toFixed(1)}%). Maintain current protocol.`
        : `${name} showing active response after ${days} days.`
    case 'plateau':
      return `${name} response has plateaued after day ${days}. Consider adjustments to restart progress.`
    case 'diminishing':
      return `${name} showing diminishing returns after day ${days}. Consider cycling off or adjusting dose.`
    default:
      return `${name} protocol under evaluation.`
  }
}
