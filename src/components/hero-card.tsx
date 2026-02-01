'use client'

import { Sparkles, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { ComplianceRing } from './compliance-ring'
import { cn } from '@/lib/utils'

interface HeroCardProps {
  completed: number
  total: number
  pending: number
  nextDose?: {
    name: string
    time?: string
  }
  hasExpiredVials?: boolean
  userName?: string
  className?: string
}

export function HeroCard({
  completed,
  total,
  pending,
  nextDose,
  hasExpiredVials,
  userName,
  className,
}: HeroCardProps) {
  const isAllDone = completed === total && total > 0
  const hasNoDoses = total === 0
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  // Determine the "one big thing" message
  const getMessage = () => {
    if (hasNoDoses) {
      return {
        title: 'No doses today',
        subtitle: 'Enjoy your rest day',
        icon: Sparkles,
        accent: 'var(--muted-foreground)',
      }
    }

    if (isAllDone) {
      return {
        title: 'All done!',
        subtitle: 'Great job completing your protocol',
        icon: CheckCircle2,
        accent: 'var(--success)',
      }
    }

    if (hasExpiredVials) {
      return {
        title: 'Vial expired',
        subtitle: 'Check your inventory',
        icon: AlertTriangle,
        accent: 'var(--warning)',
      }
    }

    if (pending === 1 && nextDose) {
      return {
        title: `1 dose remaining`,
        subtitle: nextDose.name,
        icon: Clock,
        accent: 'var(--accent)',
      }
    }

    return {
      title: `${pending} doses remaining`,
      subtitle: nextDose ? `Next: ${nextDose.name}` : 'Tap to complete',
      icon: Clock,
      accent: 'var(--accent)',
    }
  }

  const message = getMessage()
  const Icon = message.icon

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-6',
        'bg-gradient-to-br from-[var(--card)] to-[var(--muted)]',
        'border border-[var(--border)]',
        className
      )}
    >
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          background: `radial-gradient(circle at 70% 20%, ${message.accent}, transparent 50%)`,
        }}
      />

      <div className="relative flex items-center gap-5">
        {/* Compliance Ring */}
        <ComplianceRing
          completed={completed}
          total={total}
          size="lg"
          showPercentage={!isAllDone}
          showCheckOnComplete={true}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Greeting */}
          {userName && (
            <div className="text-sm text-[var(--muted-foreground)] mb-1">
              {getGreeting()}, {userName.split(' ')[0]}
            </div>
          )}

          {/* Main message */}
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-hero-sm text-[var(--foreground)]">
              {message.title}
            </h2>
          </div>

          {/* Subtitle */}
          <p className="text-sm text-[var(--muted-foreground)] flex items-center gap-1.5">
            <Icon className="w-4 h-4" style={{ color: message.accent }} />
            {message.subtitle}
          </p>

          {/* Progress bar for partial completion */}
          {!isAllDone && !hasNoDoses && (
            <div className="mt-3 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: message.accent,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
