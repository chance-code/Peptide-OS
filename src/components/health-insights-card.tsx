'use client'

import { Sparkles, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CorrelationResult } from '@/lib/health-correlation'

interface HealthInsightsCardProps {
  correlations: CorrelationResult[]
  topInsight: string | null
  hasEnoughData: boolean
  isLoading?: boolean
  onRefresh?: () => void
  className?: string
}

export function HealthInsightsCard({
  correlations,
  topInsight,
  hasEnoughData,
  isLoading = false,
  onRefresh,
  className
}: HealthInsightsCardProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
        'border-[var(--accent)]/20',
        className
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)] animate-blur-reveal" />
            <span className="text-sm font-medium text-[var(--accent)]">Health Insights</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-[var(--muted)] rounded animate-blur-reveal" />
          <div className="h-4 w-3/4 bg-[var(--muted)] rounded animate-blur-reveal" />
          <div className="h-4 w-5/6 bg-[var(--muted)] rounded animate-blur-reveal" />
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-4 text-center">
          Analyzing correlations...
        </p>
      </div>
    )
  }

  // Empty state - no data
  if (!hasEnoughData) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
        'border-[var(--accent)]/20',
        className
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--accent)]">Health Insights</span>
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            Connect a health device and track protocols for 2+ weeks to see correlation insights.
          </p>
        </div>
      </div>
    )
  }

  // No correlations found
  if (correlations.length === 0) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
        'border-[var(--accent)]/20',
        className
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--accent)]">Health Insights</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 -m-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-[var(--muted-foreground)]" />
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          No significant correlations found yet. Continue tracking for more insights.
        </p>
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-2xl p-5 border',
      'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
      'border-[var(--accent)]/20',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-medium text-[var(--accent)]">Health Insights</span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 -m-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
        )}
      </div>

      {/* Top insight highlight */}
      {topInsight && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--muted)]/50">
          <p className="text-sm font-medium text-[var(--foreground)]">{topInsight}</p>
        </div>
      )}

      {/* Correlation list */}
      <div className="space-y-3">
        {correlations.map((correlation, i) => (
          <CorrelationItem key={`${correlation.protocolId}-${correlation.metricType}`} correlation={correlation} />
        ))}
      </div>
    </div>
  )
}

function CorrelationItem({ correlation }: { correlation: CorrelationResult }) {
  const isPositive = isPositiveChange(correlation)
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        'p-1.5 rounded-lg',
        isPositive ? 'bg-[var(--success-muted)]' : 'bg-[var(--warning-muted)]'
      )}>
        <Icon className={cn(
          'w-3.5 h-3.5',
          isPositive ? 'text-[var(--success)]' : 'text-[var(--warning)]'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--foreground)] leading-relaxed">
          {correlation.insight}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn(
            'text-xs font-medium',
            isPositive ? 'text-[var(--success)]' : 'text-[var(--warning)]'
          )}>
            {correlation.percentChange > 0 ? '+' : ''}{correlation.percentChange.toFixed(0)}%
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)] px-1.5 py-0.5 rounded bg-[var(--muted)]">
            {correlation.confidence}
          </span>
        </div>
      </div>
    </div>
  )
}

// Determine if a change is positive (considering metric type)
function isPositiveChange(correlation: CorrelationResult): boolean {
  // For RHR, lower is better
  if (correlation.metricType === 'rhr') {
    return correlation.delta < 0
  }
  // For most metrics, higher is better
  return correlation.delta > 0
}
