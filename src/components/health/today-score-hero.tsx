'use client'

import { useState } from 'react'
import { ChevronRight, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScoreDriver {
  label: string
  value: string
  delta: string
  direction: 'up' | 'down' | 'neutral'
  isGood: boolean
}

interface TodayScoreHeroProps {
  score: number
  previousScore?: number
  headline: string
  drivers: ScoreDriver[]
  onExplain?: () => void
  className?: string
}

export function TodayScoreHero({
  score,
  previousScore,
  headline,
  drivers,
  onExplain,
  className
}: TodayScoreHeroProps) {
  const [expanded, setExpanded] = useState(false)

  // Calculate score change
  const scoreChange = previousScore ? score - previousScore : 0
  const scoreDirection = scoreChange > 0 ? 'up' : scoreChange < 0 ? 'down' : 'neutral'

  // Score ring calculations
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const offset = circumference - progress

  // Score color gradient based on value
  const getScoreColor = (s: number) => {
    if (s >= 80) return { from: '#10b981', to: '#22d3ee' }  // Excellent
    if (s >= 65) return { from: '#6366f1', to: '#8b5cf6' }  // Good
    if (s >= 50) return { from: '#f59e0b', to: '#fbbf24' }  // Moderate
    return { from: '#ef4444', to: '#f87171' }               // Poor
  }

  const colors = getScoreColor(score)

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
          background: `radial-gradient(circle, ${colors.from}, transparent 70%)`
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Today's Recovery
          </h2>
          {scoreChange !== 0 && (
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
              scoreDirection === 'up' ? 'bg-[var(--success-muted)] text-[var(--success)]' :
              scoreDirection === 'down' ? 'bg-[var(--error-muted)] text-[var(--error)]' :
              'bg-[var(--muted)] text-[var(--muted-foreground)]'
            )}>
              {scoreDirection === 'up' ? <TrendingUp className="w-3 h-3" /> :
               scoreDirection === 'down' ? <TrendingDown className="w-3 h-3" /> :
               <Minus className="w-3 h-3" />}
              {scoreChange > 0 ? '+' : ''}{scoreChange}
            </div>
          )}
        </div>

        {/* Score Ring */}
        <div className="flex items-center gap-8">
          <div className="relative w-40 h-40 flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              {/* Background ring */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-[var(--border)]"
              />
              {/* Progress ring */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={`url(#scoreGradient-${score})`}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id={`scoreGradient-${score}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={colors.from} />
                  <stop offset="100%" stopColor={colors.to} />
                </linearGradient>
              </defs>
            </svg>
            {/* Score number */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-bold text-[var(--foreground)] tabular-nums">
                {score}
              </span>
              <span className="text-xs text-[var(--muted-foreground)] mt-1">out of 100</span>
            </div>
          </div>

          {/* Headline and drivers */}
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-[var(--foreground)] mb-4 leading-snug">
              {headline}
            </p>

            {/* Top drivers */}
            <div className="flex flex-wrap gap-2">
              {drivers.slice(0, expanded ? drivers.length : 3).map((driver, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                    'bg-[var(--muted)] border border-[var(--border)]',
                    'transition-all duration-200'
                  )}
                >
                  <span className={cn(
                    'font-medium tabular-nums',
                    driver.isGood ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                  )}>
                    {driver.delta}
                  </span>
                  <span className="text-[var(--foreground)]">{driver.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Explain button */}
        <button
          onClick={onExplain}
          className={cn(
            'mt-6 flex items-center gap-2 text-sm font-medium',
            'text-[var(--accent)] hover:opacity-80 transition-colors'
          )}
        >
          <Info className="w-4 h-4" />
          Explain Score
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Compact version for secondary display
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
