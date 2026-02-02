'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComplianceRingProps {
  completed: number
  total: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showPercentage?: boolean
  showCheckOnComplete?: boolean
  className?: string
}

export function ComplianceRing({
  completed,
  total,
  size = 'md',
  showPercentage = true,
  showCheckOnComplete = true,
  className,
}: ComplianceRingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0)

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
  const isComplete = completed === total && total > 0

  // Animate the ring on mount and when progress changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(percentage)
    }, 100)
    return () => clearTimeout(timer)
  }, [percentage])

  const sizes = {
    xs: { ring: 24, stroke: 2.5, text: 'text-[8px]', icon: 'w-2.5 h-2.5' },
    sm: { ring: 48, stroke: 4, text: 'text-sm', icon: 'w-4 h-4' },
    md: { ring: 80, stroke: 6, text: 'text-xl', icon: 'w-6 h-6' },
    lg: { ring: 120, stroke: 8, text: 'text-3xl', icon: 'w-10 h-10' },
  }

  const { ring, stroke, text, icon } = sizes[size]
  const radius = (ring - stroke) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={ring}
        height={ring}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {/* Progress circle */}
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? 'var(--success)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
          style={{
            filter: isComplete ? 'drop-shadow(0 0 8px var(--success))' : undefined,
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isComplete && showCheckOnComplete ? (
          size === 'xs' ? (
            <Check className="w-3 h-3 text-[var(--success)]" strokeWidth={3} />
          ) : (
            <div
              className="flex items-center justify-center rounded-full bg-[var(--success)] text-white"
              style={{
                width: ring * 0.5,
                height: ring * 0.5,
                animation: 'checkPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              }}
            >
              <Check className={icon} />
            </div>
          )
        ) : showPercentage ? (
          <div className="flex items-baseline">
            <span className={cn('font-bold tabular-nums text-[var(--foreground)]', text)}>
              {animatedProgress}
            </span>
            <span className={cn('font-bold text-[var(--muted-foreground)]', size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-[6px]')}>
              %
            </span>
          </div>
        ) : (
          <span className={cn('font-bold tabular-nums text-[var(--foreground)]', text)}>
            {completed}/{total}
          </span>
        )}
      </div>
    </div>
  )
}
