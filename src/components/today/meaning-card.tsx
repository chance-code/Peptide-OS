/* TodayMeaningCard — compact health body-state assessment.
 * Answers: "Is my body helping or fighting me today, and why?"
 * Collapsed by default when Neutral; expanded otherwise.
 * Spacing: header py-3 px-4, body pb-3 space-y-3 (standard scale).
 * Motion: grid-template-rows transition on expand/collapse. */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Output Model ────────────────────────────────────────────────────

export type BodyState = 'Strong' | 'Neutral' | 'Strained' | 'Recovering'
export type Confidence = 'High' | 'Medium' | 'Low'

export interface TodayMeaning {
  state: BodyState
  confidence: Confidence
  drivers: string[] // max 3, human language
  actions: string[] // max 2, bounded and optional
}

// ─── DailyStatus shape from /api/health/daily-status ─────────────────

export interface DailyStatusSignal {
  metric: string
  value: number
  unit: string
  vs_baseline: 'above' | 'below' | 'normal'
  percent_diff: number
}

export interface DailyStatusResponse {
  status: 'recovery_priority' | 'training_window' | 'maintain' | 'peak_performance'
  signals: DailyStatusSignal[]
  recommendation: string
  evaluation?: { improved: boolean }
  brainConfidence?: 'high' | 'medium' | 'low'
}

// ─── Signal → Human Language ─────────────────────────────────────────

const SIGNAL_HUMAN: Record<string, Record<string, string>> = {
  hrv:              { above: 'Recovery signals are strong',    below: 'Recovery signals are low' },
  rhr:              { above: 'Heart rate is elevated',         below: 'Resting heart rate is low' },
  sleep_duration:   { above: 'You slept longer than usual',    below: 'Sleep was shorter than usual' },
  deep_sleep:       { above: 'Deep sleep was strong',          below: 'Deep sleep was limited' },
  sleep_score:      { above: 'Sleep quality was high',         below: 'Sleep quality dropped' },
  sleep_efficiency: { above: 'Sleep was efficient',            below: 'Sleep was restless' },
}

// Assertive language for High confidence (no "may", "might", "consider")
const ASSERTIVE_ACTIONS: Record<string, string> = {
  recovery_priority: 'Rest today. Focus on sleep and lighter activity.',
  maintain:          'Stay the course. Moderate activity and consistent sleep.',
  training_window:   'Good day for challenging workouts.',
  peak_performance:  'Push your limits today.',
}

// ─── Computation ─────────────────────────────────────────────────────

export function computeMeaning(data: DailyStatusResponse): TodayMeaning | null {
  if (data.signals.length === 0) return null

  // State
  let state: BodyState
  switch (data.status) {
    case 'peak_performance':
    case 'training_window':
      state = 'Strong'
      break
    case 'maintain':
      state = 'Neutral'
      break
    case 'recovery_priority':
      state = data.evaluation?.improved ? 'Recovering' : 'Strained'
      break
  }

  // Confidence
  let confidence: Confidence
  if (data.brainConfidence) {
    confidence = data.brainConfidence === 'high' ? 'High'
      : data.brainConfidence === 'medium' ? 'Medium' : 'Low'
  } else {
    confidence = data.signals.length >= 5 ? 'High'
      : data.signals.length >= 3 ? 'Medium' : 'Low'
  }

  // Drivers: non-normal signals sorted by magnitude, max 3, human language
  const drivers = data.signals
    .filter(s => s.vs_baseline !== 'normal')
    .sort((a, b) => Math.abs(b.percent_diff) - Math.abs(a.percent_diff))
    .slice(0, 3)
    .map(s => {
      const labels = SIGNAL_HUMAN[s.metric]
      if (labels?.[s.vs_baseline]) return labels[s.vs_baseline]
      const name = s.metric.replace(/_/g, ' ')
      return s.vs_baseline === 'above' ? `${name} is above baseline` : `${name} is below baseline`
    })

  // Actions: assertive for High, recommendation for Medium, none for Low
  let actions: string[] = []
  if (confidence === 'High') {
    actions = [ASSERTIVE_ACTIONS[data.status]]
  } else if (confidence === 'Medium' && data.recommendation) {
    actions = [data.recommendation]
  }
  // Low confidence → no actions (reduce pressure)

  return { state, confidence, drivers, actions }
}

// ─── Component ───────────────────────────────────────────────────────

const STATE_COLORS: Record<BodyState, string> = {
  Strong:     'var(--success)',
  Neutral:    'var(--muted-foreground)',
  Strained:   'var(--warning)',
  Recovering: 'var(--accent)',
}

interface TodayMeaningCardProps {
  meaning: TodayMeaning
}

export function TodayMeaningCard({ meaning }: TodayMeaningCardProps) {
  const defaultExpanded = meaning.state !== 'Neutral'
  const [expanded, setExpanded] = useState(defaultExpanded)
  const color = STATE_COLORS[meaning.state]

  return (
    <section>
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        {/* Toggle header */}
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--muted)]/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm font-medium text-[var(--foreground)]">
              {meaning.state}
            </span>
            {meaning.confidence === 'Low' && (
              <span className="text-xs text-[var(--muted-foreground)]">
                · Low confidence
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200',
              expanded && 'rotate-180'
            )}
          />
        </button>

        {/* Expandable body — animated with grid-template-rows */}
        <div
          className="grid transition-[grid-template-rows] duration-200"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-3 space-y-3">
              {/* Drivers */}
              {meaning.drivers.length > 0 && (
                <ul className="space-y-1">
                  {meaning.drivers.map((driver, i) => (
                    <li
                      key={i}
                      className="text-sm text-[var(--muted-foreground)] pl-5"
                    >
                      {driver}
                    </li>
                  ))}
                </ul>
              )}

              {/* Actions */}
              {meaning.actions.length > 0 && (
                <p className="text-sm text-[var(--foreground)] pl-5">
                  {meaning.actions[0]}
                </p>
              )}

              {/* Link to Health */}
              <Link
                href="/health"
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline pl-5"
              >
                See full picture
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
