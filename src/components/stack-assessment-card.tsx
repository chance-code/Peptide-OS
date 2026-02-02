'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Zap, AlertTriangle, RefreshCw, TrendingUp, Shield, Target, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function getStorageKey(userId: string) {
  return `stack-assessment-collapsed-${userId}`
}

interface StackAssessment {
  summary: string
  synergies: string[]
  considerations: string[]
  overallScore: 'excellent' | 'good' | 'moderate' | 'needs_attention'
}

interface StackAssessmentCardProps {
  userId: string
  activeProtocolCount: number
  className?: string
}

const scoreConfig = {
  excellent: {
    label: 'Excellent',
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: TrendingUp,
  },
  good: {
    label: 'Good',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: Shield,
  },
  moderate: {
    label: 'Moderate',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: Target,
  },
  needs_attention: {
    label: 'Needs Review',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: AlertTriangle,
  },
}

export function StackAssessmentCard({ userId, activeProtocolCount, className }: StackAssessmentCardProps) {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(getStorageKey(userId))
    if (stored === 'true') setIsCollapsed(true)
  }, [userId])

  function toggleCollapsed() {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem(getStorageKey(userId), String(newState))
  }

  const { data, isLoading, error, refetch } = useQuery<StackAssessment>({
    queryKey: ['stack-assessment', userId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols/stack-assessment?userId=${userId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!userId && activeProtocolCount > 0,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
  })

  async function handleRefresh() {
    setIsRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['stack-assessment', userId] })
    await refetch()
    setIsRefreshing(false)
  }

  // Don't show if no active protocols
  if (activeProtocolCount === 0) return null

  // Loading state
  if (isLoading) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-blue-500/10',
        'border-emerald-500/20',
        className
      )}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
          <span className="font-semibold text-emerald-400">Stack Assessment</span>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-[var(--muted)] rounded animate-pulse" />
          <div className="h-4 w-4/5 bg-[var(--muted)] rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-[var(--muted)] rounded animate-pulse" />
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-4 text-center">
          Analyzing your stack...
        </p>
      </div>
    )
  }

  // Error or no data state
  if (error || !data) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-blue-500/10',
        'border-emerald-500/20',
        className
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <span className="font-semibold text-emerald-400">Stack Assessment</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4 text-[var(--muted-foreground)]', isRefreshing && 'animate-spin')} />
          </button>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mt-3">
          Tap refresh to analyze your {activeProtocolCount} active protocol{activeProtocolCount > 1 ? 's' : ''}
        </p>
      </div>
    )
  }

  const score = scoreConfig[data.overallScore] || scoreConfig.moderate
  const ScoreIcon = score.icon

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      'bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-blue-500/10',
      'border-emerald-500/20',
      className
    )}>
      {/* Header - Always visible, clickable to toggle */}
      <button
        onClick={toggleCollapsed}
        className="w-full p-5 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-emerald-400">Stack Assessment</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', score.bg, score.color)}>
            <ScoreIcon className="w-3.5 h-3.5" />
            {score.label}
          </div>
          <ChevronDown className={cn(
            'w-5 h-5 text-[var(--muted-foreground)] transition-transform duration-200',
            isCollapsed ? '' : 'rotate-180'
          )} />
        </div>
      </button>

      {/* Collapsible content */}
      <div className={cn(
        'transition-all duration-200 ease-in-out overflow-hidden',
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
      )}>
        <div className="px-5 pb-5">
          {/* Refresh button */}
          <div className="flex justify-end mb-3">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRefresh()
              }}
              disabled={isRefreshing}
              className="p-2 -m-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
              title="Refresh assessment"
            >
              <RefreshCw className={cn('w-4 h-4 text-[var(--muted-foreground)]', isRefreshing && 'animate-spin')} />
            </button>
          </div>

          {/* Summary */}
          <p className="text-sm text-[var(--foreground)] leading-relaxed mb-4">
            {data.summary}
          </p>

          {/* Synergies */}
          {data.synergies.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Synergies
                </span>
              </div>
              <div className="space-y-1.5">
                {data.synergies.map((synergy, i) => (
                  <p key={i} className="text-sm text-[var(--foreground)] pl-5">
                    • {synergy}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Considerations */}
          {data.considerations.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Consider
                </span>
              </div>
              <div className="space-y-1.5">
                {data.considerations.map((item, i) => (
                  <p key={i} className="text-sm text-[var(--foreground)] pl-5">
                    • {item}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
