'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Zap, AlertTriangle, RefreshCw, TrendingUp, Shield, Target, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function getCollapsedKey(userId: string) {
  return `stack-assessment-collapsed-${userId}`
}

function getCacheKey(userId: string) {
  return `stack-assessment-cache-${userId}`
}

// Create a hash of protocols to detect changes
function hashProtocols(protocols: Array<{ id: string; peptideName: string; doseAmount: number; doseUnit: string; status: string }>): string {
  const activeProtocols = protocols
    .filter(p => p.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(p => `${p.peptideName}:${p.doseAmount}${p.doseUnit}`)
    .join('|')
  return btoa(activeProtocols).slice(0, 20)
}

interface StackAssessment {
  summary: string
  synergies: string[]
  considerations: string[]
  overallScore: 'excellent' | 'good' | 'moderate' | 'needs_attention'
}

interface ProtocolSummary {
  id: string
  peptideName: string
  doseAmount: number
  doseUnit: string
  status: string
}

interface CachedAssessment {
  hash: string
  data: StackAssessment
  timestamp: number
}

interface StackAssessmentCardProps {
  userId: string
  protocols: ProtocolSummary[]
  className?: string
}

const scoreConfig = {
  excellent: {
    label: 'Excellent',
    color: 'text-[var(--success)]',
    bg: 'bg-[var(--success-muted)]',
    border: 'border-[var(--success)]/30',
    icon: TrendingUp,
  },
  good: {
    label: 'Good',
    color: 'text-[var(--evidence)]',
    bg: 'bg-[var(--evidence-muted)]',
    border: 'border-[var(--evidence)]/30',
    icon: Shield,
  },
  moderate: {
    label: 'Moderate',
    color: 'text-[var(--warning)]',
    bg: 'bg-[var(--warning-muted)]',
    border: 'border-[var(--warning)]/30',
    icon: Target,
  },
  needs_attention: {
    label: 'Needs Review',
    color: 'text-[var(--error)]',
    bg: 'bg-[var(--error-muted)]',
    border: 'border-[var(--error)]/30',
    icon: AlertTriangle,
  },
}

export function StackAssessmentCard({ userId, protocols, className }: StackAssessmentCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [data, setData] = useState<StackAssessment | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const activeProtocols = useMemo(() => protocols.filter(p => p.status === 'active'), [protocols])
  const currentHash = useMemo(() => hashProtocols(protocols), [protocols])

  // Load collapsed state and cached data from localStorage
  useEffect(() => {
    const collapsed = localStorage.getItem(getCollapsedKey(userId))
    if (collapsed === 'true') setIsCollapsed(true)

    // Check for cached assessment
    const cachedStr = localStorage.getItem(getCacheKey(userId))
    if (cachedStr) {
      try {
        const cached: CachedAssessment = JSON.parse(cachedStr)
        // Use cache if hash matches (protocols haven't changed)
        if (cached.hash === currentHash) {
          setData(cached.data)
          return
        }
      } catch {}
    }

    // No valid cache, fetch fresh data
    if (activeProtocols.length > 0) {
      fetchAssessment()
    }
  }, [userId, currentHash, activeProtocols.length])

  function toggleCollapsed() {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem(getCollapsedKey(userId), String(newState))
  }

  async function fetchAssessment(force = false) {
    if (activeProtocols.length === 0) return

    // Check cache again unless forcing refresh
    if (!force) {
      const cachedStr = localStorage.getItem(getCacheKey(userId))
      if (cachedStr) {
        try {
          const cached: CachedAssessment = JSON.parse(cachedStr)
          if (cached.hash === currentHash) {
            setData(cached.data)
            return
          }
        } catch {}
      }
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/protocols/stack-assessment?userId=${userId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const result: StackAssessment = await res.json()

      // Cache the result with the current hash
      const cacheData: CachedAssessment = {
        hash: currentHash,
        data: result,
        timestamp: Date.now(),
      }
      localStorage.setItem(getCacheKey(userId), JSON.stringify(cacheData))

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true)
    await fetchAssessment(true)
    setIsRefreshing(false)
  }

  // Don't show if no active protocols
  if (activeProtocols.length === 0) return null

  // Loading state
  if (isLoading) {
    return (
      <div className={cn(
        'rounded-2xl p-5 border',
        'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
        'border-[var(--accent)]/20',
        className
      )}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-[var(--accent)] animate-blur-reveal" />
          <span className="font-semibold text-[var(--accent)]">Stack Assessment</span>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-[var(--muted)] rounded animate-blur-reveal" />
          <div className="h-4 w-4/5 bg-[var(--muted)] rounded animate-blur-reveal" />
          <div className="h-4 w-3/4 bg-[var(--muted)] rounded animate-blur-reveal" />
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
        'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
        'border-[var(--accent)]/20',
        className
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            <span className="font-semibold text-[var(--accent)]">Stack Assessment</span>
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
          Tap refresh to analyze your {activeProtocols.length} active protocol{activeProtocols.length > 1 ? 's' : ''}
        </p>
      </div>
    )
  }

  const score = scoreConfig[data.overallScore] || scoreConfig.moderate
  const ScoreIcon = score.icon

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      'bg-gradient-to-br from-[var(--accent-muted)] via-[var(--surface-2)] to-[var(--evidence-muted)]',
      'border-[var(--accent)]/20',
      className
    )}>
      {/* Header - Always visible, clickable to toggle */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-2"
        >
          <Sparkles className="w-5 h-5 text-[var(--accent)]" />
          <span className="font-semibold text-[var(--accent)]">Stack Assessment</span>
          <ChevronDown className={cn(
            'w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200',
            isCollapsed ? '' : 'rotate-180'
          )} />
        </button>
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', score.bg, score.color)}>
            <ScoreIcon className="w-3.5 h-3.5" />
            {score.label}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleRefresh()
            }}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors"
            title="Refresh assessment"
          >
            <RefreshCw className={cn('w-4 h-4 text-[var(--muted-foreground)]', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <div className={cn(
        'transition-all duration-200 ease-in-out',
        isCollapsed ? 'max-h-0 overflow-hidden opacity-0' : 'max-h-[800px] opacity-100'
      )}>
        <div className="px-4 pb-4">
          {/* Summary */}
          <p className="text-sm text-[var(--foreground)] leading-relaxed mb-4">
            {data.summary}
          </p>

          {/* Synergies */}
          {data.synergies.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-[var(--success)]" />
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
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
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
