'use client'

import { useState } from 'react'
import { ChevronRight, Info, TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HealthTrajectory, CategoryTrajectory, TrajectoryDirection, TrajectoryConfidence, TimeWindow } from '@/lib/health-trajectory'

// ─── Trajectory Hero (new primary component) ─────────────────────────

interface TrajectoryHeroProps {
  trajectory: HealthTrajectory
  timeWindow: TimeWindow
  onTimeWindowChange: (window: TimeWindow) => void
  onExplain?: () => void
  className?: string
}

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

const WINDOW_HELPER_TEXT: Partial<Record<TimeWindow, string>> = {
  7: 'Shorter windows are more volatile.',
  90: 'Best for evaluating protocol effects.',
}

export function TrajectoryHero({
  trajectory,
  timeWindow,
  onTimeWindowChange,
  onExplain,
  className
}: TrajectoryHeroProps) {
  const directionConfig = {
    improving: {
      icon: ArrowUpRight,
      label: 'IMPROVING',
      color: 'text-emerald-400',
      bgGlow: '#10b981',
    },
    stable: {
      icon: ArrowRight,
      label: 'STABLE',
      color: 'text-[var(--accent)]',
      bgGlow: '#6366f1',
    },
    declining: {
      icon: ArrowDownRight,
      label: 'DECLINING',
      color: 'text-amber-400',
      bgGlow: '#f59e0b',
    },
  }

  const config = directionConfig[trajectory.direction]
  const DirIcon = config.icon

  const confidenceLabel = {
    high: 'High confidence',
    moderate: 'Moderate confidence',
    low: 'Low confidence',
    insufficient: 'Insufficient data',
  }[trajectory.confidence]

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-[var(--card)] via-[var(--card)] to-[var(--accent-muted)]',
        'dark:from-[#1F2937] dark:via-[#1F2937] dark:to-[#312e81]',
        'border border-[var(--border)]',
        'p-6',
        'shadow-[var(--shadow-card)]',
        className
      )}
    >
      {/* Background glow */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-30 dark:opacity-20 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${config.bgGlow}, transparent 70%)`
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Health Trajectory — Last {timeWindow} Days
          </h2>
          {trajectory.confidence !== 'insufficient' && (
            <span className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
              trajectory.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
              trajectory.confidence === 'moderate' ? 'bg-[var(--accent-muted)] text-[var(--accent)]' :
              'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]'
            )}>
              {confidenceLabel}
            </span>
          )}
        </div>

        {/* Time window selector */}
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex rounded-lg bg-[var(--muted)] p-0.5 border border-[var(--border)]">
            {TIME_WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onTimeWindowChange(opt.value)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50',
                  timeWindow === opt.value
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {WINDOW_HELPER_TEXT[timeWindow] && (
            <span className="text-[10px] text-[var(--muted-foreground)] italic">
              {WINDOW_HELPER_TEXT[timeWindow]}
            </span>
          )}
        </div>

        {/* Direction + Label */}
        <div className="flex items-center gap-3 mb-3">
          <DirIcon className={cn('w-8 h-8', config.color)} />
          <div>
            <div className={cn('text-2xl font-bold', config.color)}>
              {config.label}
            </div>
            <div className="text-sm text-[var(--muted-foreground)]">
              Over {trajectory.window} days
              {trajectory.confidence !== 'insufficient' && ` · ${confidenceLabel}`}
            </div>
          </div>
        </div>

        {/* Headline */}
        <p className="text-base text-[var(--foreground)] mb-5 leading-snug">
          {trajectory.headline}
        </p>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <CategoryChip label="Sleep" category={trajectory.sleep} />
          <CategoryChip label="Recovery" category={trajectory.recovery} />
          <CategoryChip label="Activity" category={trajectory.activity} />
          {trajectory.bodyComp && (
            <CategoryChip label="Body Comp" category={trajectory.bodyComp} />
          )}
        </div>

        {/* Explain button */}
        <button
          onClick={onExplain}
          className={cn(
            'flex items-center gap-2 text-sm font-medium',
            'text-[var(--accent)] hover:opacity-80 transition-colors'
          )}
        >
          <Info className="w-4 h-4" />
          How is this calculated?
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function CategoryChip({ label, category }: { label: string; category: CategoryTrajectory }) {
  const dirIcon = category.direction === 'improving'
    ? <TrendingUp className="w-3.5 h-3.5" />
    : category.direction === 'declining'
    ? <TrendingDown className="w-3.5 h-3.5" />
    : <Minus className="w-3.5 h-3.5" />

  const colorClass = category.direction === 'improving'
    ? 'text-emerald-400'
    : category.direction === 'declining'
    ? 'text-amber-400'
    : 'text-[var(--muted-foreground)]'

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
      'bg-[var(--muted)] border border-[var(--border)]',
    )}>
      <span className={colorClass}>{dirIcon}</span>
      <span className="text-[var(--foreground)] font-medium">{label}</span>
    </div>
  )
}

// ─── Compact version (kept for backward compat) ──────────────────────

export function TodayScoreCompact({
  score,
  label,
  className
}: {
  score: number
  label: string
  className?: string
}) {
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const offset = circumference - progress

  const getColor = (s: number) => {
    if (s >= 80) return '#10b981'
    if (s >= 65) return '#6366f1'
    if (s >= 50) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative w-14 h-14">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-[var(--border)]"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={getColor(score)}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-[var(--foreground)]">{score}</span>
        </div>
      </div>
      <span className="text-sm text-[var(--foreground)]">{label}</span>
    </div>
  )
}

// ─── Legacy export alias ─────────────────────────────────────────────
// TodayScoreHero removed — TrajectoryHero is the replacement.
// Keeping TodayScoreCompact as-is since it's used outside the health page.
