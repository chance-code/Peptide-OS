'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ChevronUp, Pill, Sparkles, Scale, Heart, Zap, Beaker, BookOpen, FlaskConical, ArrowRight, Clock, AlertTriangle, Target, RefreshCw, Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PEPTIDE_REFERENCE, type PeptideReference, type CycleGuidance } from '@/lib/peptide-reference'
import { SUPPLEMENT_REFERENCE, type SupplementReference } from '@/lib/supplement-reference'
import { calculateReconstitution, mlToUnits } from '@/lib/reconstitution'
import { useAppStore } from '@/store'
import type { DoseUnit, ReconstitutionResult } from '@/types'

// Lightweight type for protocol data from API
interface UserProtocol {
  id: string
  startDate: string
  endDate: string | null
  status: string
  doseAmount: number
  doseUnit: string
  frequency: string
  peptide: {
    id: string
    name: string
    type: string
  }
}

// Health integration response type
interface HealthIntegrationResponse {
  name: string
  displayName: string
  supportedMetrics: string[]
  integration: {
    isConnected: boolean
    lastSyncAt: string | null
    metricSyncState: Record<string, {
      lastSyncAt: string | null
      status: string
      dataPoints?: number
    }>
  } | null
}

// Outcome name → health metric types + display label
const OUTCOME_METRICS: Record<string, { metrics: string[]; label: string }> = {
  'Sleep': { metrics: ['sleep_duration', 'sleep_score'], label: 'Sleep duration & score' },
  'Recovery': { metrics: ['hrv', 'rhr'], label: 'HRV & resting heart rate' },
  'Body composition': { metrics: ['weight', 'body_fat_percentage', 'lean_body_mass'], label: 'Weight & body composition' },
  'Inflammation': { metrics: ['hrv', 'rhr'], label: 'HRV & heart rate trends' },
  'Cognition': { metrics: [], label: 'No automated tracking' },
}

// Cycle phase calculation
interface CyclePhase {
  phase: 'mid-cycle' | 'end-of-cycle' | 'past-end' | 'ongoing'
  daysIn: number
  daysTotal: number | null
  progress: number | null
  message: string
}

function getCyclePhase(startDate: string, endDate: string | null): CyclePhase {
  const start = new Date(startDate)
  const today = new Date()
  const daysIn = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

  if (!endDate) {
    const weeks = Math.floor(daysIn / 7)
    return {
      phase: 'ongoing',
      daysIn,
      daysTotal: null,
      progress: null,
      message: weeks > 0
        ? `Running for ${weeks} week${weeks !== 1 ? 's' : ''} — reassess periodically`
        : 'Just started — stay consistent',
    }
  }

  const end = new Date(endDate)
  const daysTotal = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const progress = Math.min(daysIn / daysTotal, 1)

  if (daysIn > daysTotal) {
    const pastDays = daysIn - daysTotal
    return {
      phase: 'past-end',
      daysIn,
      daysTotal,
      progress: 1,
      message: `${pastDays} day${pastDays !== 1 ? 's' : ''} past planned end — time to reassess`,
    }
  }

  if (progress >= 0.7) {
    const daysLeft = daysTotal - daysIn
    return {
      phase: 'end-of-cycle',
      daysIn,
      daysTotal,
      progress,
      message: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining — begin reassessment planning`,
    }
  }

  return {
    phase: 'mid-cycle',
    daysIn,
    daysTotal,
    progress,
    message: 'Monitor and stay consistent',
  }
}

// Parse the starting week number from a phase string like "Week 3–5" or "Day 1"
function parseWeekFromPhase(phase: string): number {
  const weekMatch = phase.match(/Week\s+(\d+)/i)
  if (weekMatch) return parseInt(weekMatch[1])
  const dayMatch = phase.match(/Day\s+(\d+)/i)
  if (dayMatch) return 0
  return 0
}

// Find which time-to-effect phase the user is currently in based on days elapsed
function getCurrentEffectPhaseIndex(
  timeToEffect: { phase: string; description: string }[],
  daysIn: number,
): number {
  const weeksIn = daysIn / 7
  let currentIndex = -1
  for (let i = 0; i < timeToEffect.length; i++) {
    const startWeek = parseWeekFromPhase(timeToEffect[i].phase)
    if (weeksIn >= startWeek) {
      currentIndex = i
    }
  }
  return currentIndex
}

const CATEGORY_INFO: Record<string, { label: string; icon: typeof Pill; color: string }> = {
  healing: { label: 'Healing', icon: Heart, color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  'growth-hormone': { label: 'Growth Hormone', icon: Zap, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  'weight-loss': { label: 'Weight Loss', icon: Scale, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  cosmetic: { label: 'Cosmetic', icon: Sparkles, color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300' },
  other: { label: 'Other', icon: Pill, color: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300' },
  supplements: { label: 'Supplements', icon: Pill, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' },
}

function formatCycleSummary(g: CycleGuidance): string {
  const parts: string[] = []

  if (g.cycleType === 'continuous') {
    parts.push('Continuous')
  } else if (g.cycleType === 'pulse') {
    parts.push('As needed')
  } else if (g.cycleLengthWeeks) {
    parts.push(`${g.cycleLengthWeeks.min}–${g.cycleLengthWeeks.max} wk cycle`)
  }

  if (g.offCycleLengthWeeks) {
    if (g.offCycleLengthWeeks.min === g.offCycleLengthWeeks.max) {
      parts.push(`${g.offCycleLengthWeeks.min} wk off`)
    } else {
      parts.push(`${g.offCycleLengthWeeks.min}–${g.offCycleLengthWeeks.max} wk off`)
    }
  }

  if (g.reassessmentNote) {
    parts.push(`Reassess: ${g.reassessmentNote}`)
  } else if (g.reassessment === 'end_of_cycle') {
    parts.push('Reassess: End of cycle')
  } else if (g.reassessment === 'periodic') {
    parts.push('Reassess: Periodic')
  } else {
    parts.push('Reassess: Symptom-driven')
  }

  return parts.join(' · ')
}

function ProtocolContext({ protocol, cyclePhase, guidance, availableMetrics, effectPhaseIndex }: {
  protocol: UserProtocol
  cyclePhase: CyclePhase
  guidance?: CycleGuidance
  availableMetrics: Set<string>
  effectPhaseIndex?: number
}) {
  const phaseColors: Record<CyclePhase['phase'], string> = {
    'mid-cycle': 'text-blue-400',
    'end-of-cycle': 'text-amber-400',
    'past-end': 'text-red-400',
    'ongoing': 'text-emerald-400',
  }

  const phaseLabels: Record<CyclePhase['phase'], string> = {
    'mid-cycle': 'Mid-cycle',
    'end-of-cycle': 'End of cycle',
    'past-end': 'Past end date',
    'ongoing': 'Ongoing',
  }

  const barColor = cyclePhase.phase === 'past-end' ? 'bg-red-400'
    : cyclePhase.phase === 'end-of-cycle' ? 'bg-amber-400'
    : 'bg-[var(--accent)]'

  const hasTimeToEffect = guidance?.timeToEffect && guidance.timeToEffect.length > 0
  const hasOutcomes = guidance?.primaryOutcomes && guidance.primaryOutcomes.length > 0

  return (
    <div className="mt-2 mb-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
      <div className="flex items-center gap-1.5 mb-2">
        <Activity className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wide">Your Protocol</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-[var(--foreground)]">
          Day {cyclePhase.daysIn}{cyclePhase.daysTotal ? ` of ${cyclePhase.daysTotal}` : ''}
        </span>
        <span className={cn('text-xs font-medium', phaseColors[cyclePhase.phase])}>
          {phaseLabels[cyclePhase.phase]}
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">
          {protocol.doseAmount} {protocol.doseUnit} · {protocol.frequency}
        </span>
      </div>
      {cyclePhase.progress !== null && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${Math.min(Math.round(cyclePhase.progress * 100), 100)}%` }}
          />
        </div>
      )}
      <p className="text-xs text-[var(--muted-foreground)] mt-2">{cyclePhase.message}</p>

      {/* In your data so far */}
      {hasTimeToEffect && (
        <div className="mt-3 pt-3 border-t border-blue-500/10">
          <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-1.5">In your data so far</div>
          {effectPhaseIndex == null || effectPhaseIndex < 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Too early to tell — effects typically begin around {guidance!.timeToEffect[0].phase.toLowerCase()}
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground)]">
              <span className="font-medium text-[var(--accent)]">{guidance!.timeToEffect[effectPhaseIndex].phase}</span>
              {' — '}{guidance!.timeToEffect[effectPhaseIndex].description}
            </p>
          )}
        </div>
      )}

      {/* Metrics to watch */}
      {hasOutcomes && (
        <div className="mt-3 pt-3 border-t border-blue-500/10">
          <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-1.5">Metrics to watch</div>
          <div className="space-y-1">
            {guidance!.primaryOutcomes.map(o => {
              const metricInfo = OUTCOME_METRICS[o.outcome]
              if (!metricInfo) return (
                <div key={o.outcome} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">{o.outcome}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">—</span>
                </div>
              )
              const hasTrackableMetrics = metricInfo.metrics.length > 0
              const isConnected = hasTrackableMetrics && metricInfo.metrics.some(m => availableMetrics.has(m))
              return (
                <div key={o.outcome} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-[var(--muted-foreground)] truncate">{o.outcome} <span className="text-xs">({metricInfo.label})</span></span>
                  {!hasTrackableMetrics ? (
                    <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">—</span>
                  ) : isConnected ? (
                    <span className="text-xs text-emerald-400 whitespace-nowrap">&#10003; Connected</span>
                  ) : (
                    <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">— Not connected</span>
                  )}
                </div>
              )
            })}
          </div>
          {availableMetrics.size === 0 && (
            <p className="text-xs text-[var(--muted-foreground)] mt-2 opacity-75">Connect Apple Health or Oura to track automatically</p>
          )}
        </div>
      )}
    </div>
  )
}

function GuidanceContent({ guidance, activePhaseIndex }: { guidance: CycleGuidance; activePhaseIndex?: number }) {
  return (
    <>
      {/* Cycle Guidance Block */}
      <div className="mt-2 mb-3 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
        <div className="flex items-center gap-1.5 mb-2">
          <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wide">Cycle Guidance</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-[var(--muted-foreground)]">Cycle: </span>
            <span className="font-medium text-[var(--foreground)]">
              {guidance.cycleType === 'continuous' ? 'Continuous'
                : guidance.cycleType === 'pulse' ? 'As needed'
                : guidance.cycleLengthWeeks
                  ? `${guidance.cycleLengthWeeks.min}–${guidance.cycleLengthWeeks.max} weeks`
                  : 'Varies'}
            </span>
          </div>
          {guidance.offCycleLengthWeeks && (
            <div>
              <span className="text-[var(--muted-foreground)]">Off: </span>
              <span className="font-medium text-[var(--foreground)]">
                {guidance.offCycleLengthWeeks.min === guidance.offCycleLengthWeeks.max
                  ? `${guidance.offCycleLengthWeeks.min} weeks`
                  : `${guidance.offCycleLengthWeeks.min}–${guidance.offCycleLengthWeeks.max} weeks`}
              </span>
            </div>
          )}
          <div>
            <span className="text-[var(--muted-foreground)]">Reassess: </span>
            <span className="font-medium text-[var(--foreground)]">
              {guidance.reassessmentNote
                || (guidance.reassessment === 'end_of_cycle' ? 'End of cycle'
                  : guidance.reassessment === 'periodic' ? 'Periodic'
                  : 'Symptom-driven')}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Outcomes */}
      {guidance.primaryOutcomes && guidance.primaryOutcomes.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Target className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Expected Outcomes</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {guidance.primaryOutcomes.map(o => (
              <span
                key={o.outcome}
                className={cn(
                  'px-2 py-0.5 rounded-md text-xs font-medium border',
                  o.confidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : o.confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)]'
                )}
              >
                {o.outcome} ({o.confidence})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Time to Effect */}
      {guidance.timeToEffect && guidance.timeToEffect.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Time to Effect</span>
          </div>
          <div className="space-y-1">
            {guidance.timeToEffect.map((t, i) => {
              const isActive = activePhaseIndex != null && activePhaseIndex === i
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-baseline gap-2 text-sm rounded-lg px-2 py-0.5 -mx-2',
                    isActive && 'bg-[var(--accent)]/10 border-l-2 border-[var(--accent)] pl-2',
                  )}
                >
                  <span className={cn(
                    'text-xs font-medium whitespace-nowrap min-w-[70px]',
                    isActive ? 'text-[var(--foreground)]' : 'text-[var(--accent)]',
                  )}>{t.phase}</span>
                  <span className={cn(
                    isActive ? 'text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)]',
                  )}>{t.description}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stop Signals */}
      {guidance.stopSignals && guidance.stopSignals.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Reassess if</span>
          </div>
          <ul className="space-y-0.5">
            {guidance.stopSignals.map((s, i) => (
              <li key={i} className="text-sm text-[var(--muted-foreground)] flex items-start gap-1.5">
                <span className="text-[var(--border)] mt-1.5">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function PeptideCard({ peptide, protocol, availableMetrics }: {
  peptide: PeptideReference
  protocol?: UserProtocol
  availableMetrics: Set<string>
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const categoryInfo = CATEGORY_INFO[peptide.category] || CATEGORY_INFO.other
  const CategoryIcon = categoryInfo.icon

  const cyclePhase = protocol ? getCyclePhase(protocol.startDate, protocol.endDate) : null
  const effectPhaseIndex = cyclePhase && peptide.guidance?.timeToEffect
    ? getCurrentEffectPhaseIndex(peptide.guidance.timeToEffect, cyclePhase.daysIn)
    : undefined

  return (
    <Card className="overflow-hidden" interactive>
      <button
        type="button"
        className="w-full text-left cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-[var(--foreground)]">{peptide.name}</span>
                <Badge className={cn('text-xs', categoryInfo.color)}>
                  <CategoryIcon className="w-3 h-3 mr-1" />
                  {categoryInfo.label}
                </Badge>
                {protocol && (
                  <Badge className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Activity className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
              {peptide.description && !isExpanded && (
                <p className="text-sm text-[var(--muted-foreground)] line-clamp-1">{peptide.description}</p>
              )}
              {!isExpanded && peptide.guidance && (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {formatCycleSummary(peptide.guidance)}
                </p>
              )}
            </div>
            <div className="ml-2 text-[var(--muted-foreground)]">
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--border)] bg-[var(--muted)]/50">
          {/* Full description */}
          {peptide.description && (
            <p className="text-sm text-[var(--muted-foreground)] pt-3 pb-2">
              {peptide.description}
            </p>
          )}

          {/* User protocol context — shown first when running */}
          {protocol && cyclePhase && (
            <ProtocolContext
              protocol={protocol}
              cyclePhase={cyclePhase}
              guidance={peptide.guidance}
              availableMetrics={availableMetrics}
              effectPhaseIndex={effectPhaseIndex}
            />
          )}

          {/* Guidance sections (cycle, outcomes, timeline, stop signals) */}
          {peptide.guidance && (
            <GuidanceContent
              guidance={peptide.guidance}
              activePhaseIndex={protocol ? effectPhaseIndex : undefined}
            />
          )}

          {/* Dosing details */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Typical Dose</div>
              <div className="font-medium text-[var(--foreground)]">
                {peptide.typicalDose.min === peptide.typicalDose.max
                  ? `${peptide.typicalDose.min} ${peptide.typicalDose.unit}`
                  : `${peptide.typicalDose.min}-${peptide.typicalDose.max} ${peptide.typicalDose.unit}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Vial Sizes</div>
              <div className="font-medium text-[var(--foreground)]">
                {peptide.typicalVialSizes.map(v => `${v.amount}${v.unit}`).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">BAC Water</div>
              <div className="font-medium text-[var(--foreground)]">{peptide.recommendedDiluentMl} mL</div>
            </div>
            {peptide.aliases && peptide.aliases.length > 0 && (
              <div>
                <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Also Known As</div>
                <div className="font-medium text-[var(--foreground)] text-sm">
                  {peptide.aliases.slice(0, 2).join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function SupplementCard({ supplement, protocol, availableMetrics }: {
  supplement: SupplementReference
  protocol?: UserProtocol
  availableMetrics: Set<string>
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasGuidance = !!supplement.guidance
  const isExpandable = hasGuidance || !!protocol

  const cyclePhase = protocol ? getCyclePhase(protocol.startDate, protocol.endDate) : null
  const effectPhaseIndex = cyclePhase && supplement.guidance?.timeToEffect
    ? getCurrentEffectPhaseIndex(supplement.guidance.timeToEffect, cyclePhase.daysIn)
    : undefined

  return (
    <Card className="overflow-hidden" interactive={isExpandable}>
      <button
        type="button"
        className={cn('w-full text-left', isExpandable ? 'cursor-pointer' : 'cursor-default')}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-[var(--foreground)]">{supplement.name}</span>
                <Badge className="text-xs bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                  <Pill className="w-3 h-3 mr-1" />
                  {supplement.benefit}
                </Badge>
                {protocol && (
                  <Badge className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Activity className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
              {!isExpanded && supplement.guidance && (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {formatCycleSummary(supplement.guidance)}
                </p>
              )}
            </div>
            {isExpandable && (
              <div className="ml-2 text-[var(--muted-foreground)]">
                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            )}
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--border)] bg-[var(--muted)]/50">
          <div className="pt-3">
            {/* User protocol context */}
            {protocol && cyclePhase && (
              <ProtocolContext
                protocol={protocol}
                cyclePhase={cyclePhase}
                guidance={supplement.guidance}
                availableMetrics={availableMetrics}
                effectPhaseIndex={effectPhaseIndex}
              />
            )}

            {/* Guidance sections */}
            {supplement.guidance && (
              <GuidanceContent
                guidance={supplement.guidance}
                activePhaseIndex={protocol ? effectPhaseIndex : undefined}
              />
            )}
          </div>
          {supplement.aliases && supplement.aliases.length > 0 && (
            <div className="pt-1">
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Also Known As</div>
              <div className="font-medium text-[var(--foreground)] text-sm">
                {supplement.aliases.slice(0, 3).join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

const UNIT_OPTIONS: DoseUnit[] = ['mcg', 'mg', 'IU']

function ReconstitutionCalculator() {
  const [vialAmount, setVialAmount] = useState('')
  const [vialUnit, setVialUnit] = useState<DoseUnit>('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [targetDose, setTargetDose] = useState('')
  const [targetUnit, setTargetUnit] = useState<DoseUnit>('mcg')
  const [result, setResult] = useState<ReconstitutionResult | null>(null)

  const [selectedPeptide, setSelectedPeptide] = useState<string>('')

  function handlePeptideSelect(name: string) {
    const peptide = PEPTIDE_REFERENCE.find(p => p.name === name)
    if (!peptide) {
      setSelectedPeptide('')
      return
    }
    setSelectedPeptide(name)
    const vial = peptide.typicalVialSizes[0]
    setVialAmount(String(vial.amount))
    setVialUnit(vial.unit as DoseUnit)
    setDiluentVolume(String(peptide.recommendedDiluentMl))
    setTargetDose(String(peptide.typicalDose.min))
    setTargetUnit(peptide.typicalDose.unit as DoseUnit)
    setResult(null)
  }

  function handleCalculate() {
    const va = parseFloat(vialAmount)
    const dv = parseFloat(diluentVolume)
    const td = targetDose ? parseFloat(targetDose) : undefined
    if (!va || !dv || va <= 0 || dv <= 0) return

    const res = calculateReconstitution({
      vialAmount: va,
      vialUnit,
      diluentVolume: dv,
      targetDose: td && td > 0 ? td : undefined,
      targetUnit: td && td > 0 ? targetUnit : undefined,
    })
    setResult(res)
  }

  const canCalculate = parseFloat(vialAmount) > 0 && parseFloat(diluentVolume) > 0

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <label className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-2 block">
            Quick-fill from peptide
          </label>
          <select
            value={selectedPeptide}
            onChange={(e) => handlePeptideSelect(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          >
            <option value="">Select a peptide...</option>
            {PEPTIDE_REFERENCE.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
            Vial Details
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Peptide Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 5"
                value={vialAmount}
                onChange={(e) => { setVialAmount(e.target.value); setResult(null) }}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Unit</label>
              <select
                value={vialUnit}
                onChange={(e) => { setVialUnit(e.target.value as DoseUnit); setResult(null) }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              >
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--muted-foreground)] block mb-1">BAC Water (mL)</label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 2"
              value={diluentVolume}
              onChange={(e) => { setDiluentVolume(e.target.value); setResult(null) }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Beaker className="w-4 h-4 text-[var(--accent)]" />
            Target Dose (optional)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Dose Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 250"
                value={targetDose}
                onChange={(e) => { setTargetDose(e.target.value); setResult(null) }}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Unit</label>
              <select
                value={targetUnit}
                onChange={(e) => { setTargetUnit(e.target.value as DoseUnit); setResult(null) }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              >
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <button
        onClick={handleCalculate}
        disabled={!canCalculate}
        className={cn(
          'w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2',
          canCalculate
            ? 'bg-[var(--accent)] text-[var(--accent-foreground)] active:scale-[0.98]'
            : 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed'
        )}
      >
        Calculate
        <ArrowRight className="w-4 h-4" />
      </button>

      {result && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-sm font-semibold text-[var(--foreground)]">Results</div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                <div className="text-xs text-[var(--muted-foreground)] mb-1">Concentration</div>
                <div className="text-lg font-bold text-[var(--foreground)]">
                  {result.concentration >= 1
                    ? result.concentration.toFixed(2)
                    : result.concentration.toFixed(4)}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">{result.concentrationUnit}</div>
              </div>

              {result.volumePerDose != null && (
                <div className="p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <div className="text-xs text-[var(--muted-foreground)] mb-1">Draw per Dose</div>
                  <div className="text-lg font-bold text-[var(--foreground)]">
                    {mlToUnits(result.volumePerDose).toFixed(1)}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    units ({result.volumePerDose.toFixed(3)} mL)
                  </div>
                </div>
              )}

              {result.totalDoses != null && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="text-xs text-[var(--muted-foreground)] mb-1">Doses per Vial</div>
                  <div className="text-lg font-bold text-green-400">
                    {result.totalDoses}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">approximately</div>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
                Step-by-step
              </div>
              <div className="space-y-2">
                {result.steps.map((step, i) => (
                  <div key={i} className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                    <div className="text-xs text-[var(--muted-foreground)] mb-1">
                      Step {i + 1}: {step.description}
                    </div>
                    <div className="text-sm font-mono text-[var(--foreground)]">
                      {step.formula}
                    </div>
                    <div className="text-sm font-semibold text-[var(--accent)] mt-1">
                      = {step.result}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-[var(--muted-foreground)] pb-4">
        Always verify calculations before injection. 1 mL = 100 insulin syringe units.
      </div>
    </div>
  )
}

type LibraryTab = 'reference' | 'calculator'

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('reference')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const { currentUserId } = useAppStore()

  // Fetch user's active protocols
  const { data: userProtocols = [] } = useQuery<UserProtocol[]>({
    queryKey: ['protocols', currentUserId, 'active'],
    queryFn: async () => {
      const res = await fetch(`/api/protocols?userId=${currentUserId}&status=active`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5,
  })

  // Fetch health integration status to know which metrics are connected
  const { data: healthIntegrations = [] } = useQuery<HealthIntegrationResponse[]>({
    queryKey: ['health-integrations', currentUserId],
    queryFn: async () => {
      const res = await fetch(`/api/health/integrations?userId=${currentUserId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5,
  })

  // Build lookup: compound name (lowercase) → active protocol
  const protocolsByName = useMemo(() => {
    const map = new Map<string, UserProtocol>()
    for (const p of userProtocols) {
      map.set(p.peptide.name.toLowerCase(), p)
    }
    return map
  }, [userProtocols])

  // Derive which health metrics have data from any connected provider
  const availableMetrics = useMemo(() => {
    const metrics = new Set<string>()
    for (const provider of healthIntegrations) {
      if (provider.integration?.isConnected && provider.integration.metricSyncState) {
        for (const [metric, state] of Object.entries(provider.integration.metricSyncState)) {
          if (state.status === 'ok' && (state.dataPoints ?? 0) > 0) {
            metrics.add(metric)
          }
        }
      }
    }
    return metrics
  }, [healthIntegrations])

  const isSupplementsView = selectedCategory === 'supplements'

  const filteredPeptides = useMemo(() => {
    if (isSupplementsView) return []

    let peptides = PEPTIDE_REFERENCE

    if (selectedCategory) {
      peptides = peptides.filter(p => p.category === selectedCategory)
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      peptides = peptides.filter(p => {
        if (p.name.toLowerCase().includes(searchLower)) return true
        if (p.description?.toLowerCase().includes(searchLower)) return true
        if (p.aliases?.some(a => a.toLowerCase().includes(searchLower))) return true
        return false
      })
    }

    return peptides
  }, [search, selectedCategory, isSupplementsView])

  const filteredSupplements = useMemo(() => {
    if (!isSupplementsView) return []

    let supplements = [...SUPPLEMENT_REFERENCE]

    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      supplements = supplements.filter(s => {
        if (s.name.toLowerCase().includes(searchLower)) return true
        if (s.benefit.toLowerCase().includes(searchLower)) return true
        if (s.aliases?.some(a => a.toLowerCase().includes(searchLower))) return true
        return false
      })
    }

    supplements.sort((a, b) => {
      if (a.guidance && !b.guidance) return -1
      if (!a.guidance && b.guidance) return 1
      return a.name.localeCompare(b.name)
    })

    return supplements
  }, [search, isSupplementsView])

  const categories = Object.entries(CATEGORY_INFO)

  const tabs: { key: LibraryTab; label: string; icon: typeof BookOpen }[] = [
    { key: 'reference', label: 'Reference', icon: BookOpen },
    { key: 'calculator', label: 'Calculator', icon: Beaker },
  ]

  const itemCount = isSupplementsView ? filteredSupplements.length : filteredPeptides.length
  const itemLabel = isSupplementsView ? 'supplement' : 'peptide'

  return (
    <div className="p-4 pb-4">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">Library</h2>

      <div className="flex gap-1 p-1 rounded-xl bg-[var(--muted)] mb-4">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)]'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'reference' ? (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <Input
              placeholder={isSupplementsView ? 'Search supplements...' : 'Search peptides...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                selectedCategory === null
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
              )}
            >
              All
            </button>
            {categories.map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  selectedCategory === key
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="text-sm text-[var(--muted-foreground)] mb-3">
            {itemCount} {itemLabel}{itemCount !== 1 ? 's' : ''}
          </div>

          <div className="space-y-3">
            {isSupplementsView ? (
              filteredSupplements.map((supplement, index) => (
                <div key={supplement.name} className={cn('animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                  <SupplementCard
                    supplement={supplement}
                    protocol={protocolsByName.get(supplement.name.toLowerCase())}
                    availableMetrics={availableMetrics}
                  />
                </div>
              ))
            ) : (
              filteredPeptides.map((peptide, index) => (
                <div key={peptide.name} className={cn('animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                  <PeptideCard
                    peptide={peptide}
                    protocol={protocolsByName.get(peptide.name.toLowerCase())}
                    availableMetrics={availableMetrics}
                  />
                </div>
              ))
            )}

            {itemCount === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-[var(--muted-foreground)]">No {itemLabel}s found</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">Try a different search term</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
            {isSupplementsView
              ? 'Tap a supplement for cycle guidance'
              : 'Tap a peptide for dosing details'}
          </div>
        </>
      ) : (
        <ReconstitutionCalculator />
      )}
    </div>
  )
}
