'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Activity,
  ChevronRight,
  Beaker,
  Moon,
  Heart,
  Footprints,
  RefreshCw,
  Settings2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Watch,
  Brain,
  Info,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Scale
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { BottomSheet } from '@/components/ui/bottom-sheet'

// Components
import { TrajectoryHero } from '@/components/health/today-score-hero'
import { WhatChangedCard, type DeltaItem } from '@/components/health/what-changed-card'
import { ClaimWithReceipts, InsightThemeCard } from '@/components/health/claim-with-receipts'
import { ProtocolEvidenceCard } from '@/components/health/protocol-impact-report'

// Data
import {
  SEED_DATA,
  SEED_INTERVENTIONS,
  SEED_CONTEXT_EVENTS,
  type SeedMetric,
  type SeedIntervention
} from '@/lib/demo-data/seed-metrics'
import {
  computeBaseline,
  compareToBaseline,
  classifySignal,
  METRIC_POLARITY,
  type MetricBaseline,
  type SignalClass
} from '@/lib/health-baselines'
import {
  generateClaims,
  groupClaimsIntoThemes,
  type Claim,
  type InsightTheme
} from '@/lib/health-claims'
import {
  computeTrajectory,
  computeBodyCompState,
  type HealthTrajectory,
  type BodyCompState,
  type TimeWindow
} from '@/lib/health-trajectory'
import {
  computeProtocolEvidence,
  type ProtocolEvidence,
  type ObservedSignal,
  type EvidenceVerdict,
  type RampPhase
} from '@/lib/health-protocol-evidence'
import { fetchAppleHealthWithStatus } from '@/lib/health-providers/apple-health'
import { format, subDays, parseISO } from 'date-fns'
import type { WeeklyReview } from '@/lib/health-weekly-review'

// Demo mode flag - set false to use real data when available
const FORCE_DEMO_MODE = false

interface MetricSyncStatus {
  lastSyncAt: string | null
  status: 'ok' | 'permission_denied' | 'error' | 'no_data'
  lastError?: string
  dataPoints?: number
}

interface Integration {
  id: string
  provider: string
  isConnected: boolean
  lastSyncAt: string | null
  syncError: string | null
  metricSyncState?: Record<string, MetricSyncStatus>
}

interface ApiIntegrationResponse {
  name: string
  displayName: string
  integration: {
    id: string
    provider: string
    isConnected: boolean
    lastSyncAt: string | null
    syncError: string | null
    metricSyncState?: Record<string, MetricSyncStatus>
  } | null
}

export default function HealthDashboardNew() {
  const { currentUserId } = useAppStore()
  const queryClient = useQueryClient()
  const [selectedSection, setSelectedSection] = useState<'overview' | 'evidence' | 'discover' | 'weekly'>('overview')
  const [showIntegrations, setShowIntegrations] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)
  const [showExplainModal, setShowExplainModal] = useState(false)
  const [showWhyModal, setShowWhyModal] = useState(false)
  const [selectedDelta, setSelectedDelta] = useState<DeltaItem | null>(null)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(() => {
    if (typeof window === 'undefined') return 30
    const stored = localStorage.getItem('arc-trajectory-window')
    if (stored === '7' || stored === '90') return Number(stored) as TimeWindow
    return 30
  })

  const handleTimeWindowChange = useCallback((w: TimeWindow) => {
    setTimeWindow(w)
    localStorage.setItem('arc-trajectory-window', String(w))
  }, [])

  // Check connected integrations
  const { data: integrations, refetch: refetchIntegrations } = useQuery({
    queryKey: ['health-integrations', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return []
      const res = await fetch(`/api/health/integrations?userId=${currentUserId}`)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Integrations ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json() as ApiIntegrationResponse[]
      return data.map(item => ({
        id: item.integration?.id || item.name,
        provider: item.name,
        isConnected: item.integration?.isConnected || false,
        lastSyncAt: item.integration?.lastSyncAt || null,
        syncError: item.integration?.syncError || null,
        metricSyncState: item.integration?.metricSyncState || undefined
      })) as Integration[]
    },
    enabled: !!currentUserId
  })

  // Sync mutation (for OAuth providers: Oura)
  const syncMutation = useMutation({
    mutationFn: async (provider: string) => {
      setSyncingProvider(provider)
      const res = await fetch(`/api/health/sync/${provider}`, { method: 'POST' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Sync failed')
      }
      return res.json()
    },
    onSuccess: () => {
      refetchIntegrations()
      queryClient.invalidateQueries({ queryKey: ['health-metrics-raw'] })
    },
    onSettled: () => {
      setSyncingProvider(null)
    }
  })

  // Apple Health sync — runs client-side via Capacitor plugin, then POSTs to ingest API
  const syncAppleHealth = useCallback(async () => {
    if (syncingProvider === 'apple_health') return
    setSyncingProvider('apple_health')
    try {
      const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
      const result = await fetchAppleHealthWithStatus('', since)

      const res = await fetch('/api/health/ingest/apple-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: result.metrics.map(m => ({
            ...m,
            recordedAt: m.recordedAt instanceof Date ? m.recordedAt.toISOString() : m.recordedAt
          })),
          permissions: result.permissions,
          metricCounts: result.metricCounts,
          errors: result.errors
        })
      })
      if (!res.ok) {
        const error = await res.json()
        console.error('Ingest failed:', error)
      }

      refetchIntegrations()
      queryClient.invalidateQueries({ queryKey: ['health-metrics-raw'] })
    } catch (error) {
      console.error('Apple Health sync failed:', error)
    } finally {
      setSyncingProvider(null)
    }
  }, [syncingProvider, refetchIntegrations, queryClient])

  // Connect Apple Health
  const connectAppleHealth = async () => {
    try {
      const res = await fetch('/api/health/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'apple_health' })
      })
      if (res.ok) {
        refetchIntegrations()
        syncAppleHealth()
      }
    } catch (error) {
      console.error('Failed to connect Apple Health:', error)
    }
  }

  // Connect Oura (OAuth flow)
  const connectOura = async () => {
    try {
      const res = await fetch('/api/health/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'oura' })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.authUrl) {
          window.location.href = data.authUrl
        }
      }
    } catch (error) {
      console.error('Failed to connect Oura:', error)
    }
  }

  // Fetch real health metrics (180 days, flat format — no context, no grouping)
  const { data: realMetrics = [], isLoading: isLoadingMetrics } = useQuery<SeedMetric[]>({
    queryKey: ['health-metrics-raw'],
    queryFn: async () => {
      const endDate = new Date().toISOString()
      const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
      const res = await fetch(
        `/api/health/metrics?startDate=${startDate}&endDate=${endDate}&format=flat`
      )
      if (!res.ok) {
        const errText = await res.text().catch(() => 'unknown')
        throw new Error(`Metrics API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      return data.metrics as SeedMetric[]
    },
    enabled: !FORCE_DEMO_MODE,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  // Fetch user's active protocols
  const { data: realProtocols } = useQuery({
    queryKey: ['protocols'],
    queryFn: async () => {
      const res = await fetch('/api/protocols')
      if (!res.ok) throw new Error(`Failed to load protocols (${res.status})`)
      return res.json()
    },
    enabled: !FORCE_DEMO_MODE,
    staleTime: 5 * 60 * 1000
  })

  // Fetch weekly review (only when tab is selected)
  const { data: weeklyData, isLoading: weeklyLoading, error: weeklyError } = useQuery<{ review: WeeklyReview; isEmpty: boolean }>({
    queryKey: ['weekly-review', currentUserId],
    queryFn: async () => {
      const res = await fetch('/api/health/weekly-review')
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Weekly review ${res.status}: ${errText.slice(0, 200)}`)
      }
      return res.json()
    },
    enabled: !!currentUserId && selectedSection === 'weekly',
    staleTime: 5 * 60 * 1000,
  })

  // Fetch premium evidence from API (only when Evidence tab selected)
  const { data: evidenceData, isLoading: evidenceLoading, error: evidenceError } = useQuery<{
    evidence: Array<{
      protocolId: string
      protocolName: string
      protocolType: 'peptide' | 'supplement'
      daysOnProtocol: number
      verdict: EvidenceVerdict
      verdictExplanation: string
      rampPhase: string
      rampExplanation: string
      effects: {
        primary: { metricType: string; metricName: string; change: { percent: number }; effect: { cohensD: number; magnitude: 'large' | 'medium' | 'small' | 'negligible' }; interpretation: { isImprovement: boolean } } | null
        supporting: Array<{ metricType: string; metricName: string; change: { percent: number }; effect: { cohensD: number; magnitude: 'large' | 'medium' | 'small' | 'negligible' }; interpretation: { isImprovement: boolean } }>
        adverse: Array<{ metricType: string; metricName: string; change: { percent: number }; effect: { cohensD: number; magnitude: 'large' | 'medium' | 'small' | 'negligible' }; interpretation: { isImprovement: boolean } }>
      }
      confidence: { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] }
      confounds: { totalDays: number }
    }>
    isEmpty: boolean
    summary: { overallStatus: string; highlights: string[]; concerns: string[]; recommendations: string[] }
  }>({
    queryKey: ['health-evidence', currentUserId],
    queryFn: async () => {
      const res = await fetch('/api/health/evidence')
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Evidence ${res.status}: ${errText.slice(0, 200)}`)
      }
      return res.json()
    },
    enabled: !!currentUserId && selectedSection === 'evidence',
    staleTime: 5 * 60 * 1000,
  })

  // Map premium evidence to ProtocolEvidence shape for the card component
  const mappedEvidence: ProtocolEvidence[] = useMemo(() => {
    if (!evidenceData?.evidence) return []
    return evidenceData.evidence.map(e => {
      const signals: ObservedSignal[] = []
      const mapSignal = (s: { metricType: string; metricName: string; change: { percent: number }; effect: { cohensD: number; magnitude: 'large' | 'medium' | 'small' | 'negligible' }; interpretation: { isImprovement: boolean } }): ObservedSignal => ({
        metricType: s.metricType,
        metricName: s.metricName,
        percentChange: s.change.percent,
        effectSize: s.effect.cohensD,
        magnitude: s.effect.magnitude,
        direction: s.interpretation.isImprovement ? 'positive' : 'negative',
        isGood: s.interpretation.isImprovement,
      })
      if (e.effects.primary) signals.push(mapSignal(e.effects.primary))
      for (const s of e.effects.supporting) signals.push(mapSignal(s))
      for (const s of e.effects.adverse) signals.push(mapSignal(s))
      return {
        protocolId: e.protocolId,
        protocolName: e.protocolName,
        protocolType: e.protocolType,
        daysOnProtocol: e.daysOnProtocol,
        verdict: e.verdict,
        verdictExplanation: e.verdictExplanation,
        observedSignals: signals,
        confidence: e.confidence,
        rampPhase: e.rampPhase as RampPhase,
        rampExplanation: e.rampExplanation,
        confoundDays: e.confounds.totalDays,
        totalDays: e.daysOnProtocol,
      }
    })
  }, [evidenceData])

  // Fetch discovery feed (only when Discover tab selected)
  const { data: discoverData, isLoading: discoverLoading, error: discoverError } = useQuery<{
    insights: Array<{
      id: string
      type: string
      title: string
      body: string
      domain: string | null
      priority: number
      seen: boolean
    }>
    isEmpty: boolean
    generatedAt: string
  }>({
    queryKey: ['discovery-feed', currentUserId],
    queryFn: async () => {
      const res = await fetch('/api/health/discovery-feed')
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Discovery feed ${res.status}: ${errText.slice(0, 200)}`)
      }
      return res.json()
    },
    enabled: !!currentUserId && selectedSection === 'discover',
    staleTime: 5 * 60 * 1000,
  })

  // Determine if we have enough real data or should use demo
  const hasConnectedIntegrations = integrations?.some((i: { isConnected: boolean }) => i.isConnected)
  const hasEnoughData = realMetrics && realMetrics.length >= 14
  const useDemoData = FORCE_DEMO_MODE || (!hasConnectedIntegrations && !hasEnoughData)

  // Handle explain trajectory
  const handleExplainScore = useCallback(() => {
    setShowExplainModal(true)
  }, [])

  const handleWhyClick = useCallback(() => {
    setShowWhyModal(true)
  }, [])

  const handleDeltaClick = useCallback((item: DeltaItem) => {
    setSelectedDelta(item)
    setShowWhyModal(true)
  }, [])

  // ── Metrics source (stable — only recomputes when metric data changes) ──
  const metricsSource = useMemo(() => {
    let metrics: SeedMetric[]
    if (useDemoData) {
      metrics = SEED_DATA.metrics
    } else if (realMetrics.length > 0) {
      metrics = realMetrics
    } else {
      return null
    }
    const metricsByType = new Map<string, SeedMetric[]>()
    for (const m of metrics) {
      if (!metricsByType.has(m.metricType)) metricsByType.set(m.metricType, [])
      metricsByType.get(m.metricType)!.push(m)
    }
    return { metrics, metricsByType, availableMetrics: new Set(metricsByType.keys()) }
  }, [useDemoData, realMetrics])

  // ── Interventions (only recomputes when protocols change) ──
  const interventions = useMemo(() => {
    if (useDemoData) return SEED_INTERVENTIONS
    return (realProtocols || []).map((p: { id: string; peptide?: { name: string; type?: string }; startDate: string; doseAmount?: number; doseUnit?: string; frequency: string; timing?: string }) => ({
      id: p.id,
      name: p.peptide?.name || 'Unknown',
      type: (p.peptide?.type === 'supplement' ? 'supplement' : 'peptide') as 'peptide' | 'supplement',
      startDate: format(new Date(p.startDate), 'yyyy-MM-dd'),
      dose: `${p.doseAmount || ''}${p.doseUnit || ''}`,
      frequency: p.frequency,
      timing: p.timing || ''
    }))
  }, [useDemoData, realProtocols])

  // ── Context events (stable) ──
  const contextEvents = useMemo(() => {
    return useDemoData ? SEED_CONTEXT_EVENTS : []
  }, [useDemoData])

  // ── Baselines ──
  const baselines = useMemo(() => {
    if (!metricsSource) return null
    const map = new Map<string, MetricBaseline>()
    for (const [metricType, values] of metricsSource.metricsByType) {
      const baseline = computeBaseline(
        values.map(v => ({ date: v.date, value: v.value })),
        28
      )
      if (baseline) {
        baseline.metricType = metricType
        map.set(metricType, baseline)
      }
    }
    return map
  }, [metricsSource])

  // ── Trajectory + body composition ──
  const trajectory = useMemo(() => {
    if (!metricsSource || !baselines) return null
    return computeTrajectory(metricsSource.metrics, baselines, timeWindow)
  }, [metricsSource, baselines, timeWindow])

  const bodyCompState = useMemo(() => {
    if (!metricsSource) return null
    return computeBodyCompState(metricsSource.metrics)
  }, [metricsSource])

  // ── Today's deltas (signal classification) ──
  const todayDeltas = useMemo(() => {
    if (!metricsSource || !baselines) return []

    const today = format(new Date(), 'yyyy-MM-dd')
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

    const keyMetrics = [
      'hrv', 'deep_sleep', 'sleep_efficiency', 'rhr', 'waso', 'sleep_score',
      'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
      'vo2_max', 'steps', 'active_calories', 'exercise_minutes',
      'respiratory_rate', 'blood_oxygen',
    ]

    const deltas: DeltaItem[] = []

    for (const metricType of keyMetrics) {
      const baseline = baselines.get(metricType)
      if (!baseline) continue

      const todayValue = metricsSource.metrics.find(m => m.date === today && m.metricType === metricType)
      const yesterdayValue = metricsSource.metrics.find(m => m.date === yesterday && m.metricType === metricType)
      const currentValue = todayValue || yesterdayValue
      if (!currentValue) continue

      const polarity = METRIC_POLARITY[metricType] || 'higher_better'
      const delta = compareToBaseline(currentValue.value, baseline, polarity)

      if (delta.significance === 'none') continue

      const recentValues = metricsSource.metrics
        .filter(m => m.metricType === metricType)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 7)
        .map(m => ({ date: m.date, value: m.value }))

      const signal = classifySignal(metricType, recentValues, baseline, polarity)

      const isGood = (polarity === 'higher_better' && delta.direction === 'above') ||
                     (polarity === 'lower_better' && delta.direction === 'below')

      deltas.push({
        id: metricType,
        metric: getMetricDisplayName(metricType),
        metricType,
        delta: formatDelta(delta.absoluteDelta, metricType),
        vsBaseline: delta.description,
        direction: delta.direction === 'above' ? 'up' : 'down',
        isGood,
        zScore: delta.zScore,
        signalClass: signal?.signalClass,
        narrative: signal?.narrative,
      })
    }

    deltas.sort((a, b) => Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0))
    return deltas
  }, [metricsSource, baselines])

  // ── Claims, themes, recommendation ──
  const claimsData = useMemo(() => {
    if (!metricsSource || !baselines) return null

    const allClaims = generateClaims({
      metrics: metricsSource.metrics,
      interventions,
      contextEvents,
      baselines
    })

    const claims = allClaims.filter(c => {
      if (!c.metricType) return true
      if (c.id.startsWith('availability_')) return true
      return metricsSource.availableMetrics.has(c.metricType)
    })

    const availabilityClaims = claims.filter(c => c.id.startsWith('availability_'))
    const insightClaims = claims.filter(c => !c.id.startsWith('availability_'))
    const themes = groupClaimsIntoThemes(insightClaims)

    const actionableClaim = insightClaims
      .filter(c => c.type === 'warning' || c.priority === 'high')
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
      })[0]

    const recommendation = actionableClaim
      ? {
          action: actionableClaim.actionable || actionableClaim.headline,
          reason: actionableClaim.evidence || 'Based on your recent health data trends.',
          confidence: actionableClaim.confidence?.level || 'medium' as const,
        }
      : null

    return { insightClaims, availabilityClaims, themes, recommendation }
  }, [metricsSource, baselines, interventions, contextEvents])

  // ── Protocol evidence ──
  const protocolEvidence = useMemo(() => {
    if (!metricsSource || !baselines) return []
    return computeProtocolEvidence(interventions, metricsSource.metrics, contextEvents, baselines)
  }, [metricsSource, baselines, interventions, contextEvents])

  // ── Data status ──
  const dataStatus = useMemo(() => {
    if (!metricsSource) return null
    const status = {
      sleep: { tracked: 0, total: 3, metrics: ['sleep_duration', 'rem_sleep', 'hrv'] },
      body: { tracked: 0, total: 5, metrics: ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi'] },
      activity: { tracked: 0, total: 4, metrics: ['steps', 'active_calories', 'exercise_minutes', 'walking_running_distance'] },
      vitals: { tracked: 0, total: 3, metrics: ['rhr', 'respiratory_rate', 'blood_oxygen'] },
      fitness: { tracked: 0, total: 1, metrics: ['vo2_max'] },
    }
    for (const [, info] of Object.entries(status)) {
      info.tracked = info.metrics.filter(m => metricsSource.availableMetrics.has(m)).length
    }
    return status
  }, [metricsSource])

  // ── Assembled processedData ──
  const processedData = useMemo(() => {
    if (!metricsSource || !baselines || !trajectory || !bodyCompState || !dataStatus) return null
    return {
      trajectory,
      bodyCompState,
      deltas: todayDeltas,
      claims: claimsData?.insightClaims ?? [],
      availabilityClaims: claimsData?.availabilityClaims ?? [],
      themes: claimsData?.themes ?? [],
      protocolEvidence,
      dataStatus,
      recommendation: claimsData?.recommendation ?? null,
      baselines,
      interventions,
    }
  }, [metricsSource, baselines, trajectory, bodyCompState, todayDeltas, claimsData, protocolEvidence, dataStatus, interventions])

  // Determine page state — used for single-return rendering
  const isLoading = !processedData && isLoadingMetrics && hasConnectedIntegrations
  const isNoData = !processedData && !isLoading

  return (
    <div className="bg-[var(--background)] pb-4">
      {/* Header — scrolls with content, same as all other tabs */}
      <div>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-display text-[var(--foreground)]">Health</h1>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
            ) : (<>
            {(() => {
              if (useDemoData) {
                return (
                  <button
                    onClick={() => setShowIntegrations(!showIntegrations)}
                    className="px-2 py-0.5 bg-[rgba(155,125,212,0.12)] text-[var(--tier-3)] text-xs rounded-full"
                  >
                    Demo Data
                  </button>
                )
              }
              const lastSync = integrations
                ?.filter((i: Integration) => i.isConnected && i.lastSyncAt)
                ?.map((i: Integration) => new Date(i.lastSyncAt!).getTime())
                ?.sort((a: number, b: number) => b - a)?.[0]
              if (lastSync) {
                const hoursAgo = Math.round((Date.now() - lastSync) / (1000 * 60 * 60))
                const isStale = hoursAgo > 24
                const connectedWithState = integrations?.find((i: Integration) => i.isConnected && i.metricSyncState)
                const syncState = connectedWithState?.metricSyncState
                const totalMetrics = syncState ? Object.keys(syncState).length : 0
                const freshCount = syncState
                  ? Object.values(syncState).filter(s => s.status === 'ok').length
                  : 0
                const hasDenied = syncState
                  ? Object.values(syncState).some(s => s.status === 'permission_denied')
                  : false

                return (
                  <button
                    onClick={() => setShowIntegrations(!showIntegrations)}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      hasDenied
                        ? "bg-[var(--warning-muted)] text-[var(--warning)]"
                        : isStale
                        ? "bg-[var(--warning-muted)] text-[var(--warning)]"
                        : "bg-[var(--success-muted)] text-[var(--success)]"
                    )}
                  >
                    <span className="truncate max-w-[120px] inline-block align-middle">
                      {syncState
                        ? `${freshCount}/${totalMetrics} fresh`
                        : hoursAgo < 1 ? 'Just synced' : isStale ? `Stale (${hoursAgo}h)` : `Synced ${hoursAgo}h ago`
                      }
                    </span>
                  </button>
                )
              }
              return (
                <button
                  onClick={() => setShowIntegrations(!showIntegrations)}
                  className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  <Settings2 className="w-5 h-5" />
                </button>
              )
            })()}
            <button
              onClick={() => {
                const connected = integrations?.filter((i: Integration) => i.isConnected) || []
                for (const integration of connected) {
                  if (integration.provider === 'apple_health') {
                    syncAppleHealth()
                  } else {
                    syncMutation.mutate(integration.provider)
                  }
                }
              }}
              disabled={syncMutation.isPending || syncingProvider === 'apple_health'}
              className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              <RefreshCw className={cn("w-5 h-5", (syncMutation.isPending || syncingProvider === 'apple_health') && "animate-spin")} />
            </button>
            </>)}
          </div>
        </div>

        {/* Section tabs — renamed */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-1">
          {[
            { id: 'overview', label: 'Today' },
            { id: 'weekly', label: 'Weekly' },
            { id: 'evidence', label: 'Evidence' },
            { id: 'discover', label: 'Discover' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedSection(tab.id as typeof selectedSection)
                document.querySelector('main')?.scrollTo(0, 0)
              }}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50',
                'active:scale-95',
                selectedSection === tab.id
                  ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Integrations panel (collapsible, height-constrained) */}
        {showIntegrations && (
          <div className="max-w-lg mx-auto px-4 pb-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Data Sources</div>
            <div className="space-y-3">
              {/* Apple Health */}
              {(() => {
                const appleHealth = integrations?.find((i: Integration) => i.provider === 'apple_health')
                const isConnected = appleHealth?.isConnected
                const hasError = appleHealth?.syncError
                return (
                  <div className={cn(
                    "p-3 rounded-xl border",
                    isConnected
                      ? hasError
                        ? "bg-[var(--warning-muted)] border-[var(--warning)]/30"
                        : "bg-[var(--success-muted)] border-[var(--success)]/30"
                      : "bg-[var(--muted)] border-[var(--border)]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          isConnected ? "bg-[var(--error-muted)]" : "bg-[var(--border)]"
                        )}>
                          <Heart className={cn("w-5 h-5", isConnected ? "text-[var(--error)]" : "text-[var(--muted-foreground)]")} />
                        </div>
                        <div>
                          <div className="font-medium text-[var(--foreground)]">Apple Health</div>
                          {isConnected ? (
                            <div className="text-xs text-[var(--success)] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Connected
                              {appleHealth?.lastSyncAt && (
                                <span className="text-[var(--muted-foreground)] ml-1">
                                  · {format(new Date(appleHealth.lastSyncAt), 'MMM d, h:mm a')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-[var(--muted-foreground)]">Not connected</div>
                          )}
                          {hasError && (
                            <div className="text-xs text-[var(--warning)] mt-1">{appleHealth.syncError}</div>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          onClick={() => syncAppleHealth()}
                          disabled={syncingProvider === 'apple_health'}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            "bg-[var(--accent)] hover:opacity-90 text-[var(--accent-foreground)]",
                            "disabled:opacity-50"
                          )}
                        >
                          {syncingProvider === 'apple_health' ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Syncing
                            </span>
                          ) : 'Sync Now'}
                        </button>
                      ) : (
                        <button
                          onClick={connectAppleHealth}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--success)] hover:bg-[var(--success)]/90 text-[var(--background)]"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Oura */}
              {(() => {
                const oura = integrations?.find((i: Integration) => i.provider === 'oura')
                const isConnected = oura?.isConnected
                const hasError = oura?.syncError
                return (
                  <div className={cn(
                    "p-3 rounded-xl border",
                    isConnected
                      ? hasError
                        ? "bg-[var(--warning-muted)] border-[var(--warning)]/30"
                        : "bg-[var(--success-muted)] border-[var(--success)]/30"
                      : "bg-[var(--muted)] border-[var(--border)]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          isConnected ? "bg-[rgba(155,125,212,0.12)]" : "bg-[var(--border)]"
                        )}>
                          <Watch className={cn("w-5 h-5", isConnected ? "text-[var(--tier-3)]" : "text-[var(--muted-foreground)]")} />
                        </div>
                        <div>
                          <div className="font-medium text-[var(--foreground)]">
                            Oura Ring
                            {!isConnected && <span className="ml-1.5 text-[10px] font-normal text-[var(--muted-foreground)]">Optional</span>}
                          </div>
                          {isConnected ? (
                            <div className="text-xs text-[var(--success)] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Connected
                              {oura?.lastSyncAt && (
                                <span className="text-[var(--muted-foreground)] ml-1">
                                  · {format(new Date(oura.lastSyncAt), 'MMM d, h:mm a')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-[var(--muted-foreground)]">Adds sleep scores, readiness, and detailed sleep stages</div>
                          )}
                          {hasError && (
                            <div className="text-xs text-[var(--warning)] mt-1">{oura.syncError}</div>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          onClick={() => syncMutation.mutate('oura')}
                          disabled={syncingProvider === 'oura'}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            "bg-[var(--accent)] hover:opacity-90 text-[var(--accent-foreground)]",
                            "disabled:opacity-50"
                          )}
                        >
                          {syncingProvider === 'oura' ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Syncing
                            </span>
                          ) : 'Sync Now'}
                        </button>
                      ) : (
                        <button
                          onClick={connectOura}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--success)] hover:bg-[var(--success)]/90 text-[var(--background)]"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>
        )}
      </div>

      {/* Permission-denied banner — stable container, always in DOM */}
      <div className="max-w-lg mx-auto px-4">
        {(() => {
          if (useDemoData || !processedData) return null
          const connectedWithState = integrations?.find((i: Integration) => i.isConnected && i.metricSyncState)
          const syncState = connectedWithState?.metricSyncState
          const deniedList = syncState
            ? Object.entries(syncState).filter(([, s]) => s.status === 'permission_denied')
            : []
          if (deniedList.length === 0) return null
          return (
            <div className="pt-4">
              <div className="p-3 rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--warning)] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)]">
                    {deniedList.length} metric{deniedList.length > 1 ? 's' : ''} need{deniedList.length === 1 ? 's' : ''} permission
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    Open Settings &gt; Privacy &gt; Health &gt; Arc Protocol to enable: {deniedList.map(([mt]) => getMetricDisplayName(mt)).join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-3 pb-6 space-y-6">
        {/* ═══════════════ LOADING STATE ═══════════════ */}
        {isLoading && (
          <>
            {/* Trajectory skeleton */}
            <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
              <div className="h-4 w-40 bg-[var(--muted)] rounded animate-blur-reveal" />
              <div className="h-8 w-32 bg-[var(--muted)] rounded animate-blur-reveal" />
              <div className="h-4 w-64 bg-[var(--muted)] rounded animate-blur-reveal" />
              <div className="flex gap-3 mt-4">
                <div className="h-10 flex-1 bg-[var(--muted)] rounded-lg animate-blur-reveal" />
                <div className="h-10 flex-1 bg-[var(--muted)] rounded-lg animate-blur-reveal" />
                <div className="h-10 flex-1 bg-[var(--muted)] rounded-lg animate-blur-reveal" />
              </div>
            </div>
            {/* Category cards skeleton */}
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 space-y-2">
                  <div className="h-3 w-12 bg-[var(--muted)] rounded animate-blur-reveal" />
                  <div className="h-5 w-16 bg-[var(--muted)] rounded animate-blur-reveal" />
                </div>
              ))}
            </div>
            {/* What matters skeleton */}
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-3">
              <div className="h-3 w-32 bg-[var(--muted)] rounded animate-blur-reveal" />
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <div className="w-8 h-8 bg-[var(--muted)] rounded-full animate-blur-reveal" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-[var(--muted)] rounded animate-blur-reveal" />
                    <div className="h-3 w-48 bg-[var(--muted)] rounded animate-blur-reveal" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══════════════ NO DATA STATE ═══════════════ */}
        {isNoData && (() => {
          const appleHealthIntegration = integrations?.find((i: Integration) => i.provider === 'apple_health')
          return (
            <div className="pt-6">
              <div className="text-center mb-8">
                <Activity className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Connect Apple Health</h2>
                <p className="text-[var(--muted-foreground)]">
                  Apple Health provides everything you need — sleep, HRV, activity, body composition, and more. Connect it to get started.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--error-muted)] flex items-center justify-center">
                        <Heart className="w-5 h-5 text-[var(--error)]" />
                      </div>
                      <div>
                        <div className="font-medium text-[var(--foreground)]">Apple Health</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {appleHealthIntegration?.isConnected
                            ? appleHealthIntegration.lastSyncAt
                              ? `Last sync: ${format(new Date(appleHealthIntegration.lastSyncAt), 'MMM d, h:mm a')}`
                              : 'Connected'
                            : 'Not connected'}
                        </div>
                      </div>
                    </div>
                    {appleHealthIntegration?.isConnected ? (
                      <button
                        onClick={() => syncAppleHealth()}
                        disabled={syncingProvider === 'apple_health'}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium',
                          'bg-[var(--accent)] hover:opacity-90 text-[var(--accent-foreground)]',
                          'disabled:opacity-50'
                        )}
                      >
                        {syncingProvider === 'apple_health' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : 'Sync'}
                      </button>
                    ) : (
                      <button
                        onClick={connectAppleHealth}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--success)] hover:bg-[var(--success)]/90 text-[var(--background)]"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                  {appleHealthIntegration?.syncError && (
                    <div className="mt-2 text-xs text-[var(--error)]">
                      Error: {appleHealthIntegration.syncError}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )
        })()}

        {/* ═══════════════ TODAY TAB ═══════════════ */}
        {processedData && selectedSection === 'overview' && (
          <>
            {/* 1. Trajectory Hero */}
            <TrajectoryHero
              trajectory={processedData.trajectory}
              timeWindow={timeWindow}
              onTimeWindowChange={handleTimeWindowChange}
              onExplain={handleExplainScore}
            />

            {/* 2. Category Cards */}
            <div className="grid grid-cols-3 gap-3">
              <CategoryCard
                icon={Moon}
                label="Sleep"
                direction={processedData.trajectory.sleep.direction}
                topMetric={processedData.trajectory.sleep.topMetric}
                topMetricChange={processedData.trajectory.sleep.topMetricChange}
                color="indigo"
              />
              <CategoryCard
                icon={Heart}
                label="Recovery"
                direction={processedData.trajectory.recovery.direction}
                topMetric={processedData.trajectory.recovery.topMetric}
                topMetricChange={processedData.trajectory.recovery.topMetricChange}
                color="emerald"
              />
              <CategoryCard
                icon={Footprints}
                label="Activity"
                direction={processedData.trajectory.activity.direction}
                topMetric={processedData.trajectory.activity.topMetric}
                topMetricChange={processedData.trajectory.activity.topMetricChange}
                color="amber"
              />
            </div>

            {/* 3. Body Composition Card — always rendered for layout stability */}
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
              {processedData.bodyCompState.recompStatus !== 'insufficient_data' ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Scale className="w-4 h-4 text-[var(--muted-foreground)]" />
                    <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                      Body Composition
                    </h3>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      processedData.bodyCompState.confidence === 'high' ? 'bg-[var(--success-muted)] text-[var(--success)]' :
                      processedData.bodyCompState.confidence === 'medium' ? 'bg-[var(--warning-muted)] text-[var(--warning)]' :
                      'bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]'
                    )}>
                      {processedData.bodyCompState.confidence}
                    </span>
                  </div>
                  <p className="text-base font-medium text-[var(--foreground)] mb-1">
                    {processedData.bodyCompState.headline}
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)] mb-3">
                    {processedData.bodyCompState.detail}
                  </p>
                  <div className="flex gap-3">
                    {processedData.bodyCompState.weight && (
                      <TrendPill
                        label="Weight"
                        direction={processedData.bodyCompState.trend.weightDir}
                      />
                    )}
                    {processedData.bodyCompState.bodyFatPct && (
                      <TrendPill
                        label="Body Fat"
                        direction={processedData.bodyCompState.trend.fatDir}
                      />
                    )}
                    {(processedData.bodyCompState.muscleMass || processedData.bodyCompState.leanMass) && (
                      <TrendPill
                        label={processedData.bodyCompState.muscleMass ? 'Muscle' : 'Lean Mass'}
                        direction={processedData.bodyCompState.trend.massDir}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[var(--muted-foreground)]" />
                  <span className="text-sm text-[var(--muted-foreground)]">
                    Body composition data accumulating...
                  </span>
                </div>
              )}
            </div>

            {/* 4. What Matters Today (signal-classified + top recommendation integrated) */}
            <WhatChangedCard
              items={processedData.deltas.slice(0, 6)}
              topRecommendation={processedData.recommendation}
              onItemClick={handleDeltaClick}
              onWhyClick={handleWhyClick}
            />

            {/* 5. Quick Protocol Status — always rendered for layout stability */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                  Protocol Status
                </h2>
                {processedData.protocolEvidence.length > 0 && (
                  <button
                    onClick={() => setSelectedSection('evidence')}
                    className="text-xs text-[var(--accent)] hover:opacity-80 flex items-center gap-1"
                  >
                    View All <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {processedData.protocolEvidence.length > 0 ? (
                processedData.protocolEvidence.slice(0, 2).map((evidence) => (
                  <QuickVerdictBadge
                    key={evidence.protocolId}
                    protocolName={evidence.protocolName}
                    verdict={evidence.verdict}
                    daysOnProtocol={evidence.daysOnProtocol}
                    onClick={() => setSelectedSection('evidence')}
                  />
                ))
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No active protocols to evaluate yet
                </p>
              )}
            </div>

            {/* Data Status (collapsible) */}
            {(() => {
              const ds = processedData.dataStatus
              const categories = [
                { key: 'sleep', label: 'Sleep' },
                { key: 'body', label: 'Body' },
                { key: 'activity', label: 'Activity' },
                { key: 'vitals', label: 'Vitals' },
                { key: 'fitness', label: 'Fitness' },
              ] as const
              const totalTracked = Object.values(ds).reduce((s, c) => s + c.tracked, 0)
              const totalAvailable = Object.values(ds).reduce((s, c) => s + c.total, 0)
              const growingClaims = processedData.availabilityClaims.filter(c => c.id.startsWith('availability_growing_'))
              const providerClaims = processedData.availabilityClaims.filter(c => !c.id.startsWith('availability_growing_'))

              const appleHealth = integrations?.find((i: Integration) => i.provider === 'apple_health')
              const syncState = appleHealth?.metricSyncState
              const deniedMetrics = syncState
                ? Object.entries(syncState).filter(([, s]) => s.status === 'permission_denied')
                : []
              const freshMetrics = syncState
                ? Object.entries(syncState).filter(([, s]) => s.status === 'ok' && s.lastSyncAt)
                : []

              if (totalTracked === 0 && growingClaims.length === 0 && providerClaims.length === 0 && !syncState) return null

              return (
                <details className="rounded-xl bg-[var(--card)] border border-[var(--border)] group">
                  <summary className="p-4 cursor-pointer flex items-center justify-between list-none">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-[var(--muted-foreground)]" />
                      <span className="text-sm font-medium text-[var(--foreground)]">Data Status</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {syncState
                          ? `${freshMetrics.length}/${Object.keys(syncState).length} metrics fresh`
                          : `${totalTracked}/${totalAvailable} metrics`
                        }
                      </span>
                      {deniedMetrics.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-[var(--warning-muted)] text-[var(--warning)] text-[10px] rounded-full">
                          {deniedMetrics.length} denied
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    {deniedMetrics.length > 0 && (
                      <div className="p-3 rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-[var(--warning)] mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-[var(--foreground)]">
                              {deniedMetrics.length} permission{deniedMetrics.length > 1 ? 's' : ''} denied
                            </div>
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                              Open Settings &gt; Privacy &amp; Security &gt; Health &gt; Arc Protocol to enable: {deniedMetrics.map(([mt]) => getMetricDisplayName(mt)).join(', ')}
                            </p>
                            <button
                              onClick={() => syncAppleHealth()}
                              disabled={syncingProvider === 'apple_health'}
                              className="mt-2 text-xs text-[var(--warning)] font-medium hover:opacity-80"
                            >
                              Re-request Permissions
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      {categories.map(cat => {
                        const info = ds[cat.key]
                        const isReady = info.tracked >= Math.ceil(info.total * 0.5)
                        return (
                          <div key={cat.key} className="text-center p-2 rounded-lg bg-[var(--muted)]/50">
                            <div className="text-xs text-[var(--muted-foreground)]">{cat.label}</div>
                            <div className={cn(
                              "text-sm font-medium tabular-nums",
                              info.tracked === 0 ? "text-[var(--muted-foreground)]" :
                              isReady ? "text-[var(--success)]" : "text-[var(--warning)]"
                            )}>
                              {info.tracked}/{info.total}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {syncState && Object.keys(syncState).length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Metric Freshness</div>
                        {Object.entries(syncState)
                          .sort(([, a], [, b]) => {
                            const order = { ok: 0, no_data: 1, error: 2, permission_denied: 3 }
                            return (order[a.status] || 0) - (order[b.status] || 0)
                          })
                          .map(([metricType, state]) => (
                          <div key={metricType} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-[var(--foreground)]">
                              {getMetricDisplayName(metricType)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {state.status === 'ok' && (
                                <span className="text-[var(--success)]">
                                  {state.dataPoints || 0} pts
                                </span>
                              )}
                              {state.status === 'no_data' && (
                                <span className="text-[var(--muted-foreground)]">No data</span>
                              )}
                              {state.status === 'permission_denied' && (
                                <span className="text-[var(--warning)] flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Denied
                                </span>
                              )}
                              {state.status === 'error' && (
                                <span className="text-[var(--error)]">Error</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {growingClaims.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Accumulating Data</div>
                        {growingClaims.slice(0, 3).map(c => (
                          <div key={c.id} className="text-xs text-[var(--muted-foreground)]">
                            {c.headline} — {c.evidence}
                          </div>
                        ))}
                      </div>
                    )}

                    {providerClaims.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Requires Additional Provider</div>
                        {providerClaims.slice(0, 3).map(c => (
                          <div key={c.id} className="text-xs text-[var(--muted-foreground)]">
                            {c.headline}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )
            })()}
          </>
        )}

        {/* ═══════════════ WEEKLY TAB ═══════════════ */}
        {selectedSection === 'weekly' && (
          <div className="space-y-4">
            {weeklyLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                <span className="ml-2 text-sm text-[var(--muted-foreground)]">Generating weekly review...</span>
              </div>
            )}

            {weeklyError && (
              <div className="text-center py-12">
                <AlertTriangle className="w-10 h-10 text-[var(--warning)] mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium mb-1">Failed to load weekly review</p>
                <p className="text-sm text-[var(--muted-foreground)]">{weeklyError.message}</p>
              </div>
            )}

            {weeklyData?.isEmpty && !weeklyLoading && !weeklyError && (
              <div className="text-center py-12">
                <Activity className="w-10 h-10 text-[var(--muted-foreground)] mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium mb-1">No weekly report yet</p>
                <p className="text-sm text-[var(--muted-foreground)]">Connect a wearable or log some doses to generate your first weekly review.</p>
              </div>
            )}

            {weeklyData && !weeklyData.isEmpty && !weeklyLoading && !weeklyError && (() => {
              const r = weeklyData.review
              return (
                <>
                  {/* Headline */}
                  <div>
                    <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                      Week of {r.week.start} — {r.week.end}
                    </div>
                    <h2 className="text-lg font-bold text-[var(--foreground)]">{r.headline}</h2>
                    <p className="text-sm text-[var(--muted-foreground)] mt-0.5">{r.subheadline}</p>
                  </div>

                  {/* Overall direction */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                    {r.overall.direction === 'improving' ? <TrendingUp className="w-5 h-5 text-[var(--success)]" /> :
                     r.overall.direction === 'declining' ? <TrendingDown className="w-5 h-5 text-[var(--warning)]" /> :
                     <Minus className="w-5 h-5 text-[var(--muted-foreground)]" />}
                    <div>
                      <span className={cn(
                        "text-sm font-semibold capitalize",
                        r.overall.direction === 'improving' ? 'text-[var(--success)]' :
                        r.overall.direction === 'declining' ? 'text-[var(--warning)]' :
                        'text-[var(--muted-foreground)]'
                      )}>
                        {r.overall.direction}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)] ml-2">
                        {r.overall.metricsImproving} up · {r.overall.metricsDeclining} down · {r.overall.metricsStable} stable
                      </span>
                    </div>
                  </div>

                  {/* Safety alerts */}
                  {r.safetyAlerts.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--warning)] uppercase tracking-wider font-medium">Safety Alerts</div>
                      {r.safetyAlerts.map((alert, i) => (
                        <div key={i} className="p-3 rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/20">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-[var(--warning)] mt-0.5 shrink-0" />
                            <div>
                              <span className="text-sm font-medium text-[var(--foreground)]">{alert.protocolName}: {alert.explanation}</span>
                              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{alert.recommendation}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top wins */}
                  {r.topWins.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--success)] uppercase tracking-wider font-medium">Wins</div>
                      {r.topWins.map((win, i) => (
                        <div key={i} className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
                            <span className="text-sm text-[var(--foreground)]">{win.narrative}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Needs attention */}
                  {r.needsAttention.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--warning)] uppercase tracking-wider font-medium">Needs Attention</div>
                      {r.needsAttention.map((item, i) => (
                        <div key={i} className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0" />
                            <span className="text-sm text-[var(--foreground)]">{item.narrative}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Protocol status */}
                  {r.protocols.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider font-medium">Protocols</div>
                      {r.protocols.map((p) => (
                        <div key={p.protocolId} className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-[var(--foreground)]">{p.protocolName}</span>
                            <span className="text-xs text-[var(--muted-foreground)]">Day {p.daysSinceStart}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                            <span>{p.dosesCompleted}/{p.dosesExpected} doses ({p.adherencePercent}%)</span>
                            <span className="capitalize">{p.evidencePhase} phase</span>
                          </div>
                          {p.topSignal && (
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">{p.topSignal}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top actions */}
                  {r.topActions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--accent)] uppercase tracking-wider font-medium">Top Actions</div>
                      {r.topActions.map((action) => (
                        <div key={action.rank} className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-start gap-3">
                          <span className="text-sm font-bold text-[var(--accent)] tabular-nums">{action.rank}.</span>
                          <span className="text-sm text-[var(--foreground)]">{action.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Look ahead */}
                  {r.lookAhead.nextWeekFocus && (
                    <div className="p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
                      <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider font-medium mb-1">Next Week</div>
                      <p className="text-sm text-[var(--foreground)]">{r.lookAhead.nextWeekFocus}</p>
                      {r.lookAhead.upcomingMilestones.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {r.lookAhead.upcomingMilestones.map((m, i) => (
                            <p key={i} className="text-xs text-[var(--muted-foreground)]">{m}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ═══════════════ EVIDENCE TAB ═══════════════ */}
        {selectedSection === 'evidence' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
              <Beaker className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Protocol Evidence</span>
            </div>

            {evidenceLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                <span className="ml-2 text-sm text-[var(--muted-foreground)]">Analyzing protocol evidence...</span>
              </div>
            )}

            {evidenceError && (
              <div className="text-center py-12">
                <AlertTriangle className="w-10 h-10 text-[var(--warning)] mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium mb-1">Failed to load evidence</p>
                <p className="text-sm text-[var(--muted-foreground)]">{evidenceError.message}</p>
              </div>
            )}

            {evidenceData?.isEmpty && !evidenceLoading && !evidenceError && (
              <div className="text-center py-12">
                <Beaker className="w-10 h-10 text-[var(--muted-foreground)] mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium mb-1">No active protocols to evaluate</p>
                <p className="text-sm text-[var(--muted-foreground)]">Add a protocol to start tracking evidence.</p>
              </div>
            )}

            {!evidenceLoading && !evidenceError && !evidenceData?.isEmpty && evidenceData?.summary && (
              <div className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                <p className="text-sm font-medium text-[var(--foreground)]">{evidenceData.summary.overallStatus}</p>
                {evidenceData.summary.highlights.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {evidenceData.summary.highlights.map((h, i) => (
                      <p key={i} className="text-xs text-[var(--success)]">{h}</p>
                    ))}
                  </div>
                )}
                {evidenceData.summary.concerns.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {evidenceData.summary.concerns.map((c, i) => (
                      <p key={i} className="text-xs text-[var(--warning)]">{c}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mappedEvidence.map((evidence) => (
              <ProtocolEvidenceCard
                key={evidence.protocolId}
                evidence={evidence}
              />
            ))}
          </div>
        )}

        {/* ═══════════════ DISCOVER TAB ═══════════════ */}
        {selectedSection === 'discover' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Daily Discoveries</span>
            </div>

            {discoverLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                <span className="ml-2 text-sm text-[var(--muted-foreground)]">Finding insights...</span>
              </div>
            )}

            {discoverError && (
              <div className="text-center py-12">
                <AlertTriangle className="w-10 h-10 text-[var(--warning)] mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium mb-1">Failed to load discoveries</p>
                <p className="text-sm text-[var(--muted-foreground)]">{discoverError.message}</p>
              </div>
            )}

            {discoverData?.isEmpty && !discoverLoading && !discoverError && (
              <div className="text-center py-12">
                <Sparkles className="w-10 h-10 text-[var(--muted-foreground)] mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium mb-1">No discoveries yet</p>
                <p className="text-sm text-[var(--muted-foreground)]">Connect a wearable or upload labs to generate personalized insights.</p>
              </div>
            )}

            {!discoverLoading && !discoverError && !discoverData?.isEmpty && discoverData?.insights && (
              <>
                {discoverData.insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'p-1.5 rounded-lg shrink-0 mt-0.5',
                        insight.type === 'achievement' ? 'bg-[var(--success-muted)]' :
                        insight.type === 'surprise' ? 'bg-[var(--accent-muted)]' :
                        insight.type === 'predictive' || insight.type === 'retest' ? 'bg-[var(--warning-muted)]' :
                        'bg-[var(--evidence-muted)]'
                      )}>
                        {insight.type === 'achievement' ? <CheckCircle2 className="w-4 h-4 text-[var(--success)]" /> :
                         insight.type === 'surprise' ? <Sparkles className="w-4 h-4 text-[var(--accent)]" /> :
                         insight.type === 'predictive' ? <TrendingUp className="w-4 h-4 text-[var(--warning)]" /> :
                         insight.type === 'retest' ? <AlertTriangle className="w-4 h-4 text-[var(--warning)]" /> :
                         insight.type === 'milestone' ? <Activity className="w-4 h-4 text-[var(--evidence)]" /> :
                         <Brain className="w-4 h-4 text-[var(--evidence)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[var(--foreground)]">{insight.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] capitalize shrink-0">
                            {insight.type.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{insight.body}</p>
                      </div>
                    </div>
                  </div>
                ))}

                <p className="text-xs text-center text-[var(--muted-foreground)]">
                  New discoveries generated daily
                </p>
              </>
            )}

            {/* Themed insights (secondary, from client-side claims if available) */}
            {processedData && processedData.themes.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 text-xs text-[var(--muted-foreground)] uppercase tracking-wider py-2">
                  <span>Themed Insights ({processedData.themes.length})</span>
                  <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 pt-2">
                  {processedData.themes.map((theme) => (
                    <InsightThemeCard key={theme.id} theme={theme} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Trajectory Explanation Modal */}
      <BottomSheet
        isOpen={showExplainModal}
        onClose={() => setShowExplainModal(false)}
        title="How Trajectory Works"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--accent-muted)]">
            <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-[var(--foreground)]">
                {processedData?.trajectory.direction.charAt(0).toUpperCase()}{processedData?.trajectory.direction.slice(1)}
              </div>
              <div className="text-sm text-[var(--muted-foreground)]">
                {processedData?.trajectory.window}-day window · {processedData?.trajectory.confidence} confidence
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-[var(--foreground)]">What goes into your trajectory:</h4>
            <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <div className="flex items-start gap-2">
                <Scale className="w-4 h-4 mt-0.5 text-[var(--evidence)]" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Body Comp ({timeWindow === 7 ? '40' : timeWindow === 30 ? '55' : '70'}%)</span>
                  <p>Weight, body fat, and lean mass trends when available. Primary signal.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Moon className="w-4 h-4 mt-0.5 text-[var(--evidence)]" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Sleep ({timeWindow === 7 ? '17.5' : timeWindow === 30 ? '15' : '10'}%)</span>
                  <p>Duration, deep sleep, efficiency, and sleep score trends.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Heart className="w-4 h-4 mt-0.5 text-[var(--success)]" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Recovery ({timeWindow === 7 ? '17.5' : timeWindow === 30 ? '15' : '10'}%)</span>
                  <p>HRV, resting heart rate, and readiness trends.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Footprints className="w-4 h-4 mt-0.5 text-[var(--warning)]" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Activity ({timeWindow === 7 ? '25' : timeWindow === 30 ? '15' : '10'}%)</span>
                  <p>Steps, exercise, and activity consistency.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
            <h4 className="font-medium text-[var(--foreground)] mb-2">Why no score number?</h4>
            <p className="text-sm text-[var(--muted-foreground)]">
              A single 0-100 number causes overreaction to normal biological variation.
              Direction labels (improving/stable/declining) are more honest — they tell you
              where you're headed, not how to feel about today.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
            <h4 className="font-medium text-[var(--foreground)] mb-2">Data: {processedData?.trajectory.daysOfData} days</h4>
            <p className="text-sm text-[var(--muted-foreground)]">
              Using a {processedData?.trajectory.window}-day analysis window.
              {processedData?.trajectory.dataState === 'rich' ? ' Plenty of data for high confidence.' :
               processedData?.trajectory.dataState === 'adequate' ? ' Adequate data — confidence improves with more days.' :
               processedData?.trajectory.dataState === 'sparse' ? ' Limited data — results are directional, not definitive.' :
               ' Need more data before trajectory is meaningful.'}
            </p>
          </div>
        </div>
      </BottomSheet>

      {/* Why Modal */}
      <BottomSheet
        isOpen={showWhyModal}
        onClose={() => {
          setShowWhyModal(false)
          setSelectedDelta(null)
        }}
        title={selectedDelta ? `Why ${selectedDelta.metric} changed` : "Why did this change?"}
      >
        <div className="space-y-4">
          {selectedDelta && (
            <div className={cn(
              "p-4 rounded-xl",
              selectedDelta.isGood ? "bg-[var(--success-muted)]" : "bg-[var(--warning-muted)]"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  selectedDelta.isGood ? "text-[var(--success)]" : "text-[var(--warning)]"
                )}>
                  {selectedDelta.delta}
                </div>
                <div>
                  <div className="font-medium text-[var(--foreground)]">{selectedDelta.metric}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">{selectedDelta.narrative || selectedDelta.vsBaseline}</div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-medium text-[var(--foreground)]">Possible explanations:</h4>
            <div className="space-y-2">
              {processedData?.interventions.slice(0, 3).map((intervention: SeedIntervention) => (
                <div
                  key={intervention.id}
                  className="p-3 rounded-lg bg-[var(--muted)] border border-[var(--border)]"
                >
                  <div className="flex items-center gap-2">
                    <Beaker className="w-4 h-4 text-[var(--accent)]" />
                    <span className="font-medium text-[var(--foreground)]">{intervention.name}</span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Started {intervention.startDate} · {intervention.frequency}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-[var(--info-muted)] border border-[var(--border)]">
              <p className="text-sm text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">Note:</span> Correlation doesn't imply causation.
                Changes may be due to multiple factors including sleep timing, stress, diet, and exercise.
              </p>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

// ─── Helper Components ───────────────────────────────────────────────

function CategoryCard({
  icon: Icon,
  label,
  direction,
  topMetric,
  topMetricChange,
  color
}: {
  icon: typeof Moon
  label: string
  direction: 'improving' | 'stable' | 'declining'
  topMetric: string
  topMetricChange: number
  color: 'indigo' | 'emerald' | 'amber'
}) {
  const colors = {
    indigo: 'bg-[var(--evidence-muted)] text-[var(--evidence)]',
    emerald: 'bg-[var(--success-muted)] text-[var(--success)]',
    amber: 'bg-[var(--warning-muted)] text-[var(--warning)]'
  }

  const DirIcon = direction === 'improving' ? TrendingUp :
                  direction === 'declining' ? TrendingDown : Minus
  const dirColor = direction === 'improving' ? 'text-[var(--success)]' :
                   direction === 'declining' ? 'text-[var(--warning)]' : 'text-[var(--muted-foreground)]'

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', colors[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex items-center gap-1 mb-0.5">
        <DirIcon className={cn('w-4 h-4', dirColor)} />
        <span className={cn('text-sm font-semibold', dirColor)}>
          {direction === 'improving' ? 'Up' : direction === 'declining' ? 'Down' : 'Steady'}
        </span>
      </div>
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      {topMetric && topMetricChange !== 0 && (
        <div className="text-[10px] text-[var(--muted-foreground)] mt-1 truncate">
          {getMetricDisplayName(topMetric)} {topMetricChange > 0 ? '+' : ''}{topMetricChange.toFixed(0)}%
        </div>
      )}
    </div>
  )
}

function TrendPill({ label, direction }: { label: string; direction: 'up' | 'down' | 'stable' }) {
  const icon = direction === 'up'
    ? <TrendingUp className="w-3 h-3" />
    : direction === 'down'
    ? <TrendingDown className="w-3 h-3" />
    : <Minus className="w-3 h-3" />

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
      'bg-[var(--muted)] border border-[var(--border)]',
      direction === 'up' ? 'text-[var(--success)]' :
      direction === 'down' ? 'text-[var(--warning)]' : 'text-[var(--muted-foreground)]'
    )}>
      {icon}
      {label}
    </span>
  )
}

function QuickVerdictBadge({
  protocolName,
  verdict,
  daysOnProtocol,
  onClick
}: {
  protocolName: string
  verdict: string
  daysOnProtocol: number
  onClick: () => void
}) {
  const verdictColors: Record<string, string> = {
    too_early: 'text-[var(--muted-foreground)]',
    accumulating: 'text-[var(--warning)]',
    weak_positive: 'text-[var(--warning)]',
    likely_positive: 'text-[var(--success)]',
    strong_positive: 'text-[var(--success)]',
    no_detectable_effect: 'text-[var(--muted-foreground)]',
    possible_negative: 'text-[var(--error)]',
    confounded: 'text-[var(--muted-foreground)]',
  }

  const verdictLabels: Record<string, string> = {
    too_early: 'Too early',
    accumulating: 'Accumulating',
    weak_positive: 'Weak +',
    likely_positive: 'Likely +',
    strong_positive: 'Strong +',
    no_detectable_effect: 'No effect',
    possible_negative: 'Possible -',
    confounded: 'Confounded',
  }

  return (
    <button
      onClick={onClick}
      className="w-full p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--border)]/50 transition-colors text-left flex items-center justify-between"
    >
      <div>
        <span className="text-sm font-medium text-[var(--foreground)]">{protocolName}</span>
        <span className="text-xs text-[var(--muted-foreground)] ml-2">Day {daysOnProtocol}</span>
      </div>
      <span className={cn('text-sm font-semibold', verdictColors[verdict] || 'text-[var(--muted-foreground)]')}>
        {verdictLabels[verdict] || verdict}
      </span>
    </button>
  )
}

// ─── Helper functions ────────────────────────────────────────────────

function getMetricDisplayName(metricType: string): string {
  const names: Record<string, string> = {
    hrv: 'HRV',
    rhr: 'Resting HR',
    deep_sleep: 'Deep Sleep',
    rem_sleep: 'REM Sleep',
    sleep_duration: 'Sleep Duration',
    sleep_efficiency: 'Sleep Efficiency',
    sleep_score: 'Sleep Score',
    readiness_score: 'Readiness',
    waso: 'Wake Time',
    sleep_latency: 'Sleep Latency',
    temp_deviation: 'Temp Deviation',
    steps: 'Steps',
    active_calories: 'Active Calories',
    basal_calories: 'Basal Calories',
    exercise_minutes: 'Exercise',
    stand_hours: 'Stand Hours',
    walking_running_distance: 'Distance',
    weight: 'Weight',
    body_fat_percentage: 'Body Fat',
    lean_body_mass: 'Lean Mass',
    muscle_mass: 'Muscle Mass',
    bmi: 'BMI',
    bone_mass: 'Bone Mass',
    body_water: 'Body Water',
    vo2_max: 'VO2 Max',
    respiratory_rate: 'Resp. Rate',
    blood_oxygen: 'Blood O2',
    body_temperature: 'Body Temp',
  }
  return names[metricType] || metricType
}

function formatDelta(value: number, metricType: string): string {
  const sign = value > 0 ? '+' : ''

  if (metricType === 'hrv') return `${sign}${Math.round(value)}ms`
  if (metricType === 'rhr') return `${sign}${Math.round(value)}bpm`
  if (metricType.includes('sleep') && metricType !== 'sleep_score') return `${sign}${Math.round(value)}min`
  if (metricType === 'waso' || metricType === 'sleep_latency') return `${sign}${Math.round(value)}min`
  if (metricType === 'temp_deviation') return `${sign}${value.toFixed(1)}°`
  if (metricType.includes('score')) return `${sign}${Math.round(value)}`

  if (['weight', 'lean_body_mass', 'muscle_mass', 'bone_mass'].includes(metricType))
    return `${sign}${value.toFixed(1)}kg`
  if (metricType === 'body_fat_percentage') return `${sign}${value.toFixed(1)}%`
  if (metricType === 'bmi') return `${sign}${value.toFixed(1)}`

  if (metricType === 'vo2_max') return `${sign}${value.toFixed(1)}`
  if (metricType === 'blood_oxygen') return `${sign}${value.toFixed(1)}%`
  if (metricType === 'respiratory_rate') return `${sign}${value.toFixed(1)}`
  if (metricType === 'body_temperature') return `${sign}${value.toFixed(1)}°`

  if (metricType === 'steps') return `${sign}${Math.round(value).toLocaleString()}`
  if (metricType === 'active_calories' || metricType === 'basal_calories')
    return `${sign}${Math.round(value)}kcal`
  if (metricType === 'exercise_minutes') return `${sign}${Math.round(value)}min`
  if (metricType === 'walking_running_distance') return `${sign}${value.toFixed(1)}km`
  if (metricType === 'stand_hours') return `${sign}${Math.round(value)}h`

  return `${sign}${value.toFixed(1)}`
}
