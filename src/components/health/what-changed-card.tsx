'use client'

import { TrendingUp, TrendingDown, Minus, HelpCircle, ChevronRight, Zap, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SignalClass, ClassifiedSignal } from '@/lib/health-baselines'

// ─── Types ───────────────────────────────────────────────────────────

export interface DeltaItem {
  id: string
  metric: string
  metricType: string
  delta: string           // "+18%" or "-22min"
  vsBaseline: string      // "vs your baseline" or "best in 2 weeks"
  direction: 'up' | 'down' | 'neutral'
  isGood: boolean
  zScore?: number
  signalClass?: SignalClass
  narrative?: string
}

interface WhatMattersProps {
  items: DeltaItem[]
  topRecommendation?: {
    action: string
    reason: string
    confidence: 'high' | 'medium' | 'low'
  } | null
  onItemClick?: (item: DeltaItem) => void
  onWhyClick?: () => void
  onRecommendationAction?: () => void
  className?: string
}

// ─── What Matters Today (replaces WhatChangedCard) ───────────────────

export function WhatChangedCard({
  items,
  topRecommendation,
  onItemClick,
  onWhyClick,
  onRecommendationAction,
  className
}: WhatMattersProps) {
  // Filter items by signal class
  // Show sustained_trend and short_term_change always
  // Show blip only if fewer than 3 meaningful items
  const meaningfulItems = items.filter(i =>
    i.signalClass === 'sustained_trend' || i.signalClass === 'short_term_change'
  )
  const blipItems = items.filter(i => i.signalClass === 'blip')

  // If no signal classification applied (backward compat), show all
  const hasSignalClass = items.some(i => i.signalClass)
  const displayItems = hasSignalClass
    ? [
        ...meaningfulItems,
        ...(meaningfulItems.length < 3 ? blipItems.slice(0, 3 - meaningfulItems.length) : [])
      ]
    : items

  const isEmpty = displayItems.length === 0 && !topRecommendation

  if (isEmpty) {
    return (
      <div className={cn(
        'rounded-xl bg-[var(--card)] border border-[var(--border)] p-5',
        className
      )}>
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
          What Matters Today
        </h3>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            All clear — your metrics are within normal range today.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
          What Matters Today
        </h3>
      </div>

      {/* Top recommendation (integrated as first item) */}
      {topRecommendation && (
        <div className="mx-5 mb-2 p-3 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent)]/20">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {topRecommendation.action}
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {topRecommendation.reason}
              </p>
            </div>
            {onRecommendationAction && (
              <button
                onClick={onRecommendationAction}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] text-white"
              >
                Do it
              </button>
            )}
          </div>
        </div>
      )}

      {/* Signal list */}
      <div className="divide-y divide-[var(--border)]">
        {displayItems.map((item) => {
          const isDimmed = hasSignalClass && item.signalClass === 'blip'
          return (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item)}
              className={cn(
                'w-full px-5 py-3.5 flex items-center gap-4',
                'hover:bg-[var(--border)]/50 transition-colors text-left',
                isDimmed && 'opacity-50'
              )}
            >
              {/* Direction icon */}
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                item.isGood
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : item.direction === 'neutral'
                  ? 'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]'
                  : 'bg-amber-500/20 text-amber-400'
              )}>
                {item.direction === 'up' ? (
                  <TrendingUp className="w-4 h-4" />
                ) : item.direction === 'down' ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <Minus className="w-4 h-4" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    'text-lg font-semibold tabular-nums',
                    item.isGood ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {item.delta}
                  </span>
                  <span className="text-[var(--foreground)] font-medium">
                    {item.metric}
                  </span>
                  {hasSignalClass && item.signalClass && (
                    <SignalBadge signalClass={item.signalClass} />
                  )}
                </div>
                {/* Show narrative explanation instead of raw delta description */}
                <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
                  {item.narrative || item.vsBaseline}
                </p>
              </div>

              {/* Chevron */}
              <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
            </button>
          )
        })}
      </div>

      {/* Why button */}
      <div className="px-5 py-4 border-t border-[var(--border)]">
        <button
          onClick={onWhyClick}
          className={cn(
            'flex items-center gap-2 text-sm font-medium',
            'text-[var(--accent)] hover:opacity-80 transition-colors'
          )}
        >
          <HelpCircle className="w-4 h-4" />
          Why might this be?
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Signal Badge ────────────────────────────────────────────────────

function SignalBadge({ signalClass }: { signalClass: SignalClass }) {
  const config = {
    noise: { label: 'noise', color: 'text-[var(--muted-foreground)] bg-[var(--muted-foreground)]/10' },
    blip: { label: 'blip', color: 'text-[var(--muted-foreground)] bg-[var(--muted-foreground)]/10' },
    short_term_change: { label: '2-3d', color: 'text-amber-400 bg-amber-500/10' },
    sustained_trend: { label: '7d+', color: 'text-emerald-400 bg-emerald-500/10' },
  }

  const c = config[signalClass]
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', c.color)}>
      {c.label}
    </span>
  )
}

// ─── Compact inline badge (kept for backward compat) ─────────────────

export function DeltaBadge({
  delta,
  direction,
  isGood,
  size = 'sm'
}: {
  delta: string
  direction: 'up' | 'down' | 'neutral'
  isGood: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium tabular-nums',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      isGood
        ? 'bg-emerald-500/20 text-emerald-400'
        : 'bg-amber-500/20 text-amber-400'
    )}>
      {direction === 'up' ? (
        <TrendingUp className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      ) : direction === 'down' ? (
        <TrendingDown className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      ) : null}
      {delta}
    </span>
  )
}
