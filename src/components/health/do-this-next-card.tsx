'use client'

import { useState } from 'react'
import {
  Lightbulb,
  ChevronRight,
  Check,
  X,
  ThermometerSun,
  Moon,
  Dumbbell,
  Pill,
  Coffee,
  Wine
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Recommendation {
  id: string
  icon: 'temperature' | 'sleep' | 'workout' | 'supplement' | 'caffeine' | 'alcohol' | 'general'
  action: string
  reason: string
  evidence: string
  confidence: 'high' | 'medium' | 'low'
}

interface DoThisNextCardProps {
  recommendation: Recommendation | null
  onComplete?: (id: string) => void
  onDismiss?: (id: string) => void
  onLearnMore?: (rec: Recommendation) => void
  className?: string
}

const ICONS = {
  temperature: ThermometerSun,
  sleep: Moon,
  workout: Dumbbell,
  supplement: Pill,
  caffeine: Coffee,
  alcohol: Wine,
  general: Lightbulb
}

const ICON_COLORS = {
  temperature: 'text-[var(--evidence)] bg-[var(--evidence-muted)]',
  sleep: 'text-[var(--accent)] bg-[var(--accent-muted)]',
  workout: 'text-[var(--accent)] bg-[var(--accent-muted)]',
  supplement: 'text-[var(--success)] bg-[var(--success-muted)]',
  caffeine: 'text-[var(--warning)] bg-[var(--warning-muted)]',
  alcohol: 'text-[var(--error)] bg-[var(--error-muted)]',
  general: 'text-[var(--tier-3)] bg-[rgba(155,125,212,0.12)]'
}

export function DoThisNextCard({
  recommendation,
  onComplete,
  onDismiss,
  onLearnMore,
  className
}: DoThisNextCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!recommendation) {
    return (
      <div className={cn(
        'rounded-xl bg-[var(--card)]/50 border border-[var(--border)] p-5',
        className
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--success-muted)] flex items-center justify-center">
            <Check className="w-5 h-5 text-[var(--success)]" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Do This Next
            </h3>
            <p className="text-[var(--foreground)] font-medium mt-1">
              You're all caught up!
            </p>
          </div>
        </div>
      </div>
    )
  }

  const Icon = ICONS[recommendation.icon]
  const iconColor = ICON_COLORS[recommendation.icon]

  return (
    <div className={cn(
      'rounded-xl overflow-hidden',
      'bg-gradient-to-br from-[var(--card)] to-[var(--card)]/80',
      'border border-[var(--border)]/50',
      className
    )}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
          Do This Next
        </h3>
        <button
          onClick={() => onLearnMore?.(recommendation)}
          className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 flex items-center gap-1"
        >
          Why?
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Main content */}
      <div className="px-5 pb-4">
        <div className="flex gap-4">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            iconColor
          )}>
            <Icon className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-[var(--foreground)] leading-snug">
              {recommendation.action}
            </p>
            <p className="text-sm text-[var(--muted-foreground)] mt-2 leading-relaxed">
              {recommendation.reason}
            </p>
          </div>
        </div>

        {/* Evidence (expandable) */}
        {isExpanded && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--border)]/50 border border-[var(--border)]/50">
            <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Evidence</p>
            <p className="text-sm text-[var(--foreground)]">{recommendation.evidence}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                recommendation.confidence === 'high'
                  ? 'bg-[var(--success-muted)] text-[var(--success)]'
                  : recommendation.confidence === 'medium'
                  ? 'bg-[var(--warning-muted)] text-[var(--warning)]'
                  : 'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]'
              )}>
                {recommendation.confidence} confidence
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-[var(--border)] flex items-center gap-3">
        <button
          onClick={() => onComplete?.(recommendation.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
            'bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-[var(--foreground)] font-medium text-sm',
            'transition-colors'
          )}
        >
          <Check className="w-4 h-4" />
          Mark Done
        </button>
        <button
          onClick={() => onDismiss?.(recommendation.id)}
          className={cn(
            'px-4 py-2.5 rounded-lg',
            'bg-[var(--border)] hover:bg-[var(--border)]/80 text-[var(--foreground)] font-medium text-sm',
            'transition-colors'
          )}
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            'transition-colors'
          )}
        >
          {isExpanded ? 'Less' : 'More'}
        </button>
      </div>
    </div>
  )
}
