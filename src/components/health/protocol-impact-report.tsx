'use client'

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Activity,
  Beaker,
  ChevronDown,
  ChevronUp,
  Filter,
  Plane,
  Wine,
  Dumbbell,
  Moon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Claim } from '@/lib/health-claims'

interface MetricImpact {
  metric: string
  metricType: string
  before: number
  after: number
  change: number
  percentChange: number
  unit: string
  isGood: boolean
  confidence: 'high' | 'medium' | 'low'
}

interface RampEffect {
  period: string
  days: string
  change: number
  description: string
}

interface ContextSplit {
  context: string
  icon: typeof Dumbbell
  change: number
  sampleSize: number
}

interface ProtocolImpactReportProps {
  protocolId: string
  protocolName: string
  protocolType: 'peptide' | 'supplement'
  startDate: string
  daysOfData: number
  metrics: MetricImpact[]
  rampEffect: RampEffect[]
  contextSplits: ContextSplit[]
  confounds: {
    type: string
    count: number
  }[]
  claims: Claim[]
  className?: string
}

export function ProtocolImpactReport({
  protocolName,
  protocolType,
  startDate,
  daysOfData,
  metrics,
  rampEffect,
  contextSplits,
  confounds,
  claims,
  className
}: ProtocolImpactReportProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    excludeTravel: false,
    excludeAlcohol: false,
    trainingOnly: false,
    restOnly: false
  })

  const confidenceLevel = daysOfData >= 21 ? 'high' : daysOfData >= 14 ? 'medium' : 'low'
  const confidenceColors = {
    high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)] border-[var(--muted-foreground)]/30'
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-br from-[var(--card)] via-[var(--card)] to-indigo-950/30 border border-[var(--border)]/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                protocolType === 'peptide'
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              )}>
                {protocolType}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-medium border',
                confidenceColors[confidenceLevel]
              )}>
                {confidenceLevel} confidence
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">
              {protocolName} Impact Report
            </h1>
            <p className="text-[var(--muted-foreground)] flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Started {startDate} • {daysOfData} days of data
            </p>
          </div>
          <Beaker className="w-10 h-10 text-[var(--accent)] opacity-50" />
        </div>
      </div>

      {/* Before vs After */}
      <div className="rounded-xl bg-[var(--card)]/70 border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Before vs After
          </h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {metrics.map((metric) => (
            <div key={metric.metricType} className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    metric.isGood ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                  )}>
                    {metric.change > 0 ? (
                      <TrendingUp className={cn(
                        'w-4 h-4',
                        metric.isGood ? 'text-emerald-400' : 'text-amber-400'
                      )} />
                    ) : (
                      <TrendingDown className={cn(
                        'w-4 h-4',
                        metric.isGood ? 'text-emerald-400' : 'text-amber-400'
                      )} />
                    )}
                  </div>
                  <span className="text-[var(--foreground)] font-medium">{metric.metric}</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-[var(--muted-foreground)] tabular-nums">
                    {metric.before.toFixed(1)}{metric.unit}
                  </span>
                  <span className="text-[var(--muted-foreground)]">→</span>
                  <span className="text-[var(--foreground)] font-medium tabular-nums">
                    {metric.after.toFixed(1)}{metric.unit}
                  </span>
                  <span className={cn(
                    'font-semibold tabular-nums min-w-[60px] text-right',
                    metric.isGood ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {metric.percentChange > 0 ? '+' : ''}{metric.percentChange.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ramp Effect */}
      <div className="rounded-xl bg-[var(--card)]/70 border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Ramp Effect (HRV)
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            How the effect developed over time
          </p>
        </div>
        <div className="p-5">
          {/* Visual ramp chart */}
          <div className="flex items-end gap-2 h-24 mb-4">
            {rampEffect.map((period, i) => (
              <div key={period.period} className="flex-1 flex flex-col items-center">
                <div
                  className={cn(
                    'w-full rounded-t transition-all',
                    period.change > 10 ? 'bg-emerald-500' :
                    period.change > 5 ? 'bg-emerald-600' :
                    period.change > 0 ? 'bg-emerald-700' :
                    'bg-[var(--border)]'
                  )}
                  style={{ height: `${Math.max(10, Math.abs(period.change) * 3)}%` }}
                />
              </div>
            ))}
          </div>
          {/* Labels */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {rampEffect.map((period) => (
              <div key={period.period}>
                <div className="text-xs text-[var(--muted-foreground)]">{period.days}</div>
                <div className="text-sm font-medium text-[var(--foreground)] mt-1">
                  {period.change > 0 ? '+' : ''}{period.change}%
                </div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{period.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Context Splits */}
      <div className="rounded-xl bg-[var(--card)]/70 border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Context Splits
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            How the effect varies by condition
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {contextSplits.map((split) => {
            const Icon = split.icon
            return (
              <div key={split.context} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-[var(--muted-foreground)]" />
                  <span className="text-[var(--foreground)]">{split.context}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'font-semibold tabular-nums',
                    split.change > 0 ? 'text-emerald-400' : 'text-[var(--muted-foreground)]'
                  )}>
                    {split.change > 0 ? '+' : ''}{split.change}%
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    (n={split.sampleSize})
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Confidence & Receipts */}
      <div className="rounded-xl bg-[var(--card)]/70 border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Confidence & Receipts
          </h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent)]/80"
          >
            <Filter className="w-3.5 h-3.5" />
            Adjust
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-[var(--border)]/50">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Sample Size</div>
              <div className="text-lg font-semibold text-[var(--foreground)]">{daysOfData} days</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">
                {confidenceLevel === 'high' ? 'HIGH confidence' :
                 confidenceLevel === 'medium' ? 'MEDIUM confidence' : 'LOW confidence'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--border)]/50">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Confounds Present</div>
              <div className="text-lg font-semibold text-[var(--foreground)]">
                {confounds.reduce((sum, c) => sum + c.count, 0)} days
              </div>
              <div className="flex gap-1 mt-1">
                {confounds.map((c) => (
                  <span key={c.type} className="text-xs text-[var(--muted-foreground)]">
                    {c.count} {c.type}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="p-3 rounded-lg bg-[var(--border)]/30 border border-[var(--border)]/50">
              <div className="text-xs text-[var(--muted-foreground)] mb-3">Filter analysis:</div>
              <div className="flex flex-wrap gap-2">
                <FilterButton
                  label="Exclude travel"
                  icon={Plane}
                  active={filters.excludeTravel}
                  onClick={() => setFilters(f => ({ ...f, excludeTravel: !f.excludeTravel }))}
                />
                <FilterButton
                  label="Exclude alcohol"
                  icon={Wine}
                  active={filters.excludeAlcohol}
                  onClick={() => setFilters(f => ({ ...f, excludeAlcohol: !f.excludeAlcohol }))}
                />
                <FilterButton
                  label="Training only"
                  icon={Dumbbell}
                  active={filters.trainingOnly}
                  onClick={() => setFilters(f => ({ ...f, trainingOnly: !f.trainingOnly }))}
                />
                <FilterButton
                  label="Rest only"
                  icon={Moon}
                  active={filters.restOnly}
                  onClick={() => setFilters(f => ({ ...f, restOnly: !f.restOnly }))}
                />
              </div>
            </div>
          )}

          <button className="w-full p-3 rounded-lg bg-[var(--border)]/50 border border-[var(--border)]/50 hover:bg-[var(--border)] transition-colors text-sm text-[var(--accent)] font-medium">
            View all {daysOfData} days included →
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterButton({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: typeof Filter
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
        active
          ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]/30'
          : 'bg-[var(--border)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--muted-foreground)]'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

// Summary card version for listing protocols
export function ProtocolImpactCard({
  protocolName,
  protocolType,
  topMetric,
  change,
  daysOfData,
  confidence,
  onClick
}: {
  protocolName: string
  protocolType: 'peptide' | 'supplement'
  topMetric: string
  change: number
  daysOfData: number
  confidence: 'high' | 'medium' | 'low'
  onClick?: () => void
}) {
  const isPositive = change > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-4 rounded-xl bg-[var(--card)]/70 border border-[var(--border)]',
        'hover:bg-[var(--border)]/70 transition-colors text-left'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
              protocolType === 'peptide'
                ? 'bg-violet-500/20 text-violet-400'
                : 'bg-emerald-500/20 text-emerald-400'
            )}>
              {protocolType}
            </span>
          </div>
          <h3 className="text-base font-medium text-[var(--foreground)]">{protocolName}</h3>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {topMetric} • {daysOfData} days
          </p>
        </div>
        <div className="text-right">
          <div className={cn(
            'text-xl font-bold tabular-nums',
            isPositive ? 'text-emerald-400' : 'text-amber-400'
          )}>
            {isPositive ? '+' : ''}{change}%
          </div>
          <div className={cn(
            'text-xs mt-1',
            confidence === 'high' ? 'text-emerald-400' :
            confidence === 'medium' ? 'text-amber-400' : 'text-[var(--muted-foreground)]'
          )}>
            {confidence}
          </div>
        </div>
      </div>
    </button>
  )
}
