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
import type { Claim, EffectSize, ConfidenceLevel, InsightTheme, InsightThemeType } from '@/lib/health-claims'

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
    improvement: { icon: TrendingUp, color: 'text-[var(--success)]', bg: 'bg-[var(--success-muted)]' },
    decline: { icon: TrendingDown, color: 'text-[var(--error)]', bg: 'bg-[var(--error-muted)]' },
    correlation: { icon: Activity, color: 'text-[var(--evidence)]', bg: 'bg-[var(--evidence-muted)]' },
    warning: { icon: AlertTriangle, color: 'text-[var(--warning)]', bg: 'bg-[var(--warning-muted)]' },
    recommendation: { icon: Lightbulb, color: 'text-[var(--tier-3)]', bg: 'bg-[rgba(155,125,212,0.12)]' },
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
                    className="text-xs px-2 py-0.5 rounded-full bg-[var(--warning-muted)] text-[var(--warning)]"
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
    high: 'bg-[var(--success-muted)] text-[var(--success)] border-[var(--success)]/30',
    medium: 'bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning)]/30',
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
        'px-4 py-2 rounded-lg text-xs font-medium border transition-colors',
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

// ─── Insight Theme Card ──────────────────────────────────────────────

const THEME_ICONS: Record<InsightThemeType, typeof AlertTriangle> = {
  recovery_state: Activity,
  sleep_architecture: Activity,
  body_composition: Activity,
  training_response: Activity,
  protocol_evidence: Activity,
  lifestyle_impact: Lightbulb,
  risk_alert: AlertTriangle,
}

const THEME_COLORS: Record<InsightThemeType, { icon: string; border: string }> = {
  recovery_state: { icon: 'text-[var(--evidence)] bg-[var(--evidence-muted)]', border: 'border-[var(--evidence)]/30' },
  sleep_architecture: { icon: 'text-[var(--evidence)] bg-[var(--evidence-muted)]', border: 'border-[var(--evidence)]/30' },
  body_composition: { icon: 'text-[var(--warning)] bg-[var(--warning-muted)]', border: 'border-[var(--warning)]/30' },
  training_response: { icon: 'text-[var(--accent)] bg-[var(--accent-muted)]', border: 'border-[var(--accent)]/30' },
  protocol_evidence: { icon: 'text-[var(--tier-3)] bg-[rgba(155,125,212,0.12)]', border: 'border-[var(--tier-3)]/30' },
  lifestyle_impact: { icon: 'text-[var(--success)] bg-[var(--success-muted)]', border: 'border-[var(--success)]/30' },
  risk_alert: { icon: 'text-[var(--error)] bg-[var(--error-muted)]', border: 'border-[var(--error)]/30' },
}

interface InsightThemeCardProps {
  theme: InsightTheme
  onClaimClick?: (claim: Claim) => void
  className?: string
}

export function InsightThemeCard({ theme, onClaimClick, className }: InsightThemeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = THEME_ICONS[theme.type]
  const colors = THEME_COLORS[theme.type]

  const priorityColors = {
    high: 'border-l-[var(--error)]',
    medium: 'border-l-[var(--warning)]',
    low: 'border-l-[var(--border)]',
  }

  return (
    <div className={cn(
      'rounded-xl overflow-hidden border-l-4',
      'bg-[var(--card)]/70 border border-[var(--border)]',
      priorityColors[theme.priority],
      className
    )}>
      {/* Header */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
            colors.icon
          )}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-title text-base text-[var(--foreground)] truncate">
                {theme.title}
              </h3>
              <span className="text-xs text-[var(--muted-foreground)]">
                ({theme.timespan})
              </span>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] mt-1 leading-relaxed">
              {theme.summary}
            </p>
            {theme.actionable && (
              <p className="text-sm text-[var(--accent)] font-medium mt-2">
                → {theme.actionable}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Expandable claims */}
      {theme.claims.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-5 py-2.5 flex items-center justify-between text-left hover:bg-[var(--border)]/30 transition-colors"
          >
            <span className="text-xs text-[var(--muted-foreground)]">
              {theme.claims.length} related insight{theme.claims.length > 1 ? 's' : ''}
            </span>
            <ChevronDown className={cn(
              'w-4 h-4 text-[var(--muted-foreground)] transition-transform',
              isExpanded && 'rotate-180'
            )} />
          </button>

          {isExpanded && (
            <div className="px-5 pb-4 space-y-2">
              {theme.claims.slice(0, 3).map((claim) => (
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
              {theme.claims.length > 3 && (
                <div className="text-xs text-[var(--muted-foreground)] text-center pt-1">
                  +{theme.claims.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
