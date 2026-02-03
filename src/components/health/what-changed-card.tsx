'use client'

import { TrendingUp, TrendingDown, Minus, HelpCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DeltaItem {
  id: string
  metric: string
  metricType: string
  delta: string           // "+18%" or "-22min"
  vsBaseline: string      // "vs your baseline" or "best in 2 weeks"
  direction: 'up' | 'down' | 'neutral'
  isGood: boolean
  zScore?: number
}

interface WhatChangedCardProps {
  items: DeltaItem[]
  onItemClick?: (item: DeltaItem) => void
  onWhyClick?: () => void
  className?: string
}

export function WhatChangedCard({
  items,
  onItemClick,
  onWhyClick,
  className
}: WhatChangedCardProps) {
  if (items.length === 0) {
    return (
      <div className={cn(
        'rounded-xl bg-[var(--card)] border border-[var(--border)] p-5',
        className
      )}>
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
          What Changed
        </h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          No significant changes detected today
        </p>
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
          What Changed
        </h3>
      </div>

      {/* Delta list */}
      <div className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick?.(item)}
            className={cn(
              'w-full px-5 py-3.5 flex items-center gap-4',
              'hover:bg-[var(--border)]/50 transition-colors text-left'
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
              </div>
              <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
                {item.vsBaseline}
              </p>
            </div>

            {/* Chevron */}
            <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0" />
          </button>
        ))}
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

// Compact inline version for use in other contexts
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
