'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Target, Check, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InsightsData {
  benefit: string
  assessment: {
    summary: string
    strengths: string[]
    suggestions: string[]
  }
}

interface AIInsightsCardProps {
  protocolId: string
  peptideName: string
  className?: string
}

export function AIInsightsCard({ protocolId, peptideName, className }: AIInsightsCardProps) {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, isLoading, error, refetch } = useQuery<InsightsData>({
    queryKey: ['protocol-insights', protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols/${protocolId}/insights`)
      if (!res.ok) throw new Error('Failed to fetch insights')
      return res.json()
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  })

  async function handleRefresh() {
    setIsRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['protocol-insights', protocolId] })
    await refetch()
    setIsRefreshing(false)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-blue-500/10',
        'border-violet-500/20',
        className
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
            <span className="text-sm font-medium text-violet-400">AI Insights</span>
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-[var(--muted)] rounded animate-pulse" />
            <div className="h-4 w-full bg-[var(--muted)] rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-[var(--muted)] rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-24 bg-[var(--muted)] rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-[var(--muted)] rounded animate-pulse" />
            <div className="h-4 w-4/5 bg-[var(--muted)] rounded animate-pulse" />
          </div>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-4 text-center">
          Analyzing latest research...
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-red-500/10 via-red-500/5 to-orange-500/10',
        'border-red-500/20',
        className
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Unable to load insights</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4 text-[var(--muted-foreground)]', isRefreshing && 'animate-spin')} />
          </button>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          Tap refresh to try again
        </p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className={cn(
      'rounded-2xl p-5 border',
      'bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-blue-500/10',
      'border-violet-500/20',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-violet-400">AI Insights</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 -m-2 rounded-lg hover:bg-[var(--muted)] transition-colors"
          title="Refresh insights"
        >
          <RefreshCw className={cn(
            'w-4 h-4 text-[var(--muted-foreground)]',
            isRefreshing && 'animate-spin'
          )} />
        </button>
      </div>

      {/* Benefit Section */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Target className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Benefit
          </span>
        </div>
        <p className="text-sm text-[var(--foreground)] leading-relaxed">
          {data.benefit}
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-[var(--border)] my-4" />

      {/* Assessment Section */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Protocol Assessment
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm font-medium text-[var(--foreground)] mb-3">
          {data.assessment.summary}
        </p>

        {/* Strengths */}
        <div className="space-y-2 mb-3">
          {data.assessment.strengths.map((strength, i) => (
            <div key={i} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[var(--foreground)]">{strength}</span>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        {data.assessment.suggestions.length > 0 &&
         !data.assessment.suggestions[0].toLowerCase().includes('well-optimized') && (
          <div className="space-y-2">
            {data.assessment.suggestions.map((suggestion, i) => (
              <div key={i} className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-[var(--foreground)]">{suggestion}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
