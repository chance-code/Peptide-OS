'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Activity,
  Filter,
  Calendar,
  Database,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Claim, EffectSize, ConfidenceLevel } from '@/lib/health-claims'

interface ClaimWithReceiptsProps {
  claim: Claim
  onViewDays?: (dayIds: string[]) => void
  onFilterChange?: (filters: Claim['filters']) => void
  className?: string
  defaultExpanded?: boolean
}

export function ClaimWithReceipts({
  claim,
  onViewDays,
  onFilterChange,
  className,
  defaultExpanded = false
}: ClaimWithReceiptsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [showFilters, setShowFilters] = useState(false)

  const typeConfig = {
    improvement: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    decline: { icon: TrendingDown, color: 'text-rose-400', bg: 'bg-rose-500/20' },
    correlation: { icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    recommendation: { icon: Lightbulb, color: 'text-violet-400', bg: 'bg-violet-500/20' },
    observation: { icon: Activity, color: 'text-[var(--muted-foreground)]', bg: 'bg-[var(--muted-foreground)]/20' }
  }

  const config = typeConfig[claim.type]
  const Icon = config.icon

  return (
    <div className={cn(
      'rounded-xl overflow-hidden',
      'bg-[var(--card)]/70 border border-[var(--border)]',
      className
    )}>
      {/* Main claim */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-[var(--border)]/30 transition-colors"
      >
        {/* Icon */}
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
          config.bg
        )}>
          <Icon className={cn('w-5 h-5', config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-base font-medium text-[var(--foreground)] leading-snug">
              {claim.headline}
            </h3>
            <ConfidenceBadge confidence={claim.confidence} />
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 leading-relaxed">
            {claim.evidence}
          </p>
          {claim.actionable && (
            <p className="text-sm text-[var(--accent)] mt-2 font-medium">
              → {claim.actionable}
            </p>
          )}
        </div>

        {/* Expand indicator */}
        <div className="flex-shrink-0 mt-1">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-[var(--muted-foreground)]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
          )}
        </div>
      </button>

      {/* Receipts (expanded) */}
      {isExpanded && (
        <div className="border-t border-[var(--border)]">
          {/* Effect size visualization */}
          <div className="px-5 py-4 bg-[var(--border)]/30">
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
              <Shield className="w-3.5 h-3.5" />
              Evidence Details
            </div>

            <div className="grid grid-cols-3 gap-4">
              <ReceiptStat
                label="Sample Size"
                value={`${claim.receipt.sampleSize.before} → ${claim.receipt.sampleSize.after}`}
                sublabel="days"
              />
              <ReceiptStat
                label="Effect Size"
                value={claim.receipt.effectSize.cohensD.toFixed(2)}
                sublabel={`d (${claim.receipt.effectSize.magnitude})`}
              />
              <ReceiptStat
                label="Change"
                value={`${claim.receipt.effectSize.percentChange > 0 ? '+' : ''}${claim.receipt.effectSize.percentChange.toFixed(0)}%`}
                sublabel="percent"
              />
            </div>

            {/* Time window */}
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Calendar className="w-4 h-4" />
              {claim.receipt.timeWindow.start} — {claim.receipt.timeWindow.end}
            </div>

            {/* Confounds */}
            {claim.receipt.confoundsPresent.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[var(--muted-foreground)]">Confounds:</span>
                {claim.receipt.confoundsPresent.map((c) => (
                  <span
                    key={c}
                    className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Confidence breakdown */}
            <div className="mt-4 p-3 rounded-lg bg-[var(--card)]/50">
              <div className="text-xs text-[var(--muted-foreground)] mb-2">Confidence factors:</div>
              <ul className="space-y-1">
                {claim.confidence.reasons.map((reason, i) => (
                  <li key={i} className="text-sm text-[var(--foreground)] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Filter toggles */}
          <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--card)]/30">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? 'Hide filters' : 'Adjust analysis'}
            </button>

            {showFilters && (
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterToggle
                  label="Exclude travel"
                  active={claim.filters.excludeTravel}
                  onChange={() => {
                    onFilterChange?.({
                      ...claim.filters,
                      excludeTravel: !claim.filters.excludeTravel
                    })
                  }}
                />
                <FilterToggle
                  label="Exclude alcohol"
                  active={claim.filters.excludeAlcohol}
                  onChange={() => {
                    onFilterChange?.({
                      ...claim.filters,
                      excludeAlcohol: !claim.filters.excludeAlcohol
                    })
                  }}
                />
                <FilterToggle
                  label="Training days only"
                  active={claim.filters.trainingDaysOnly}
                  onChange={() => {
                    onFilterChange?.({
                      ...claim.filters,
                      trainingDaysOnly: !claim.filters.trainingDaysOnly
                    })
                  }}
                />
                <FilterToggle
                  label="Rest days only"
                  active={claim.filters.restDaysOnly}
                  onChange={() => {
                    onFilterChange?.({
                      ...claim.filters,
                      restDaysOnly: !claim.filters.restDaysOnly
                    })
                  }}
                />
              </div>
            )}
          </div>

          {/* View included days */}
          <div className="px-5 py-3 border-t border-[var(--border)]">
            <button
              onClick={() => onViewDays?.(claim.receipt.dataPointIds)}
              className="flex items-center gap-2 text-sm text-[var(--accent)] hover:text-[var(--accent)]/80"
            >
              <Database className="w-4 h-4" />
              View {claim.receipt.dataPointIds.length} days included
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  const colors = {
    high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)] border-[var(--muted-foreground)]/30'
  }

  return (
    <span className={cn(
      'px-2 py-0.5 rounded text-xs font-medium border',
      colors[confidence.level]
    )}>
      {confidence.level}
    </span>
  )
}

// Receipt stat component
function ReceiptStat({
  label,
  value,
  sublabel
}: {
  label: string
  value: string
  sublabel?: string
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-[var(--muted-foreground)] mb-1">{label}</div>
      <div className="text-lg font-semibold text-[var(--foreground)] tabular-nums">{value}</div>
      {sublabel && <div className="text-xs text-[var(--muted-foreground)]">{sublabel}</div>}
    </div>
  )
}

// Filter toggle component
function FilterToggle({
  label,
  active,
  onChange
}: {
  label: string
  active: boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
        active
          ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]/30'
          : 'bg-[var(--border)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--muted-foreground)]'
      )}
    >
      {label}
    </button>
  )
}

// Compact claim list for summaries
export function ClaimList({
  claims,
  maxItems = 5,
  onClaimClick
}: {
  claims: Claim[]
  maxItems?: number
  onClaimClick?: (claim: Claim) => void
}) {
  return (
    <div className="space-y-2">
      {claims.slice(0, maxItems).map((claim) => (
        <button
          key={claim.id}
          onClick={() => onClaimClick?.(claim)}
          className={cn(
            'w-full p-3 rounded-lg bg-[var(--border)]/50 border border-[var(--border)]/50',
            'hover:bg-[var(--border)] transition-colors text-left'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--foreground)] font-medium truncate">
              {claim.headline}
            </span>
            <ConfidenceBadge confidence={claim.confidence} />
          </div>
        </button>
      ))}
    </div>
  )
}
