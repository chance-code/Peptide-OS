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
  type SeedMetric
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
  type BodyCompState
} from '@/lib/health-trajectory'
import {
  computeProtocolEvidence,
  type ProtocolEvidence
} from '@/lib/health-protocol-evidence'
import { fetchAppleHealthWithStatus } from '@/lib/health-providers/apple-health'
import { format, subDays, parseISO } from 'date-fns'

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
  const [selectedSection, setSelectedSection] = useState<'overview' | 'evidence' | 'insights'>('overview')
  const [showIntegrations, setShowIntegrations] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)
  const [showExplainModal, setShowExplainModal] = useState(false)
  const [showWhyModal, setShowWhyModal] = useState(false)
  const [selectedDelta, setSelectedDelta] = useState<DeltaItem | null>(null)

  // Check connected integrations
  const { data: integrations, refetch: refetchIntegrations } = useQuery({
    queryKey: ['health-integrations', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return []
      const res = await fetch(`/api/health/integrations?userId=${currentUserId}`)
      if (!res.ok) return []
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

  // Sync mutation (for OAuth providers: Oura, Eight Sleep)
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
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
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

  // Connect Eight Sleep (credentials flow)
  const connectEightSleep = async () => {
    try {
      const res = await fetch('/api/health/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'eight_sleep' })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.requiresCredentials && data.loginEndpoint) {
          window.location.href = '/settings?connectEightSleep=true'
        }
      }
    } catch (error) {
      console.error('Failed to connect Eight Sleep:', error)
    }
  }

  // Fetch real health metrics (60 days)
  const { data: realMetricsData, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['health-metrics-raw', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null
      const endDate = new Date().toISOString()
      const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const res = await fetch(`/api/health/metrics?startDate=${startDate}&endDate=${endDate}`)
      if (!res.ok) return null
      const data = await res.json()
      const flatMetrics: SeedMetric[] = []
      if (data.metrics) {
        for (const [metricType, values] of Object.entries(data.metrics)) {
          for (const v of values as Array<{ recordedAt: string; value: number; unit: string; provider: string }>) {
            flatMetrics.push({
              date: format(new Date(v.recordedAt), 'yyyy-MM-dd'),
              metricType,
              value: v.value,
              unit: v.unit,
              source: v.provider
            })
          }
        }
      }
      return { metrics: flatMetrics, stats: data.stats }
    },
    enabled: !!currentUserId && !FORCE_DEMO_MODE,
    staleTime: 5 * 60 * 1000
  })

  const realMetrics = realMetricsData?.metrics || []

  // Fetch user's active protocols
  const { data: realProtocols } = useQuery({
    queryKey: ['protocols', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return []
      const res = await fetch(`/api/protocols?userId=${currentUserId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!currentUserId && !FORCE_DEMO_MODE,
    staleTime: 5 * 60 * 1000
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

  // ── Data source selection ──
  const dataSource = useMemo(() => {
    let metrics: SeedMetric[]
    let interventions: typeof SEED_INTERVENTIONS
    let contextEvents: typeof SEED_CONTEXT_EVENTS

    if (useDemoData) {
      metrics = SEED_DATA.metrics
      interventions = SEED_INTERVENTIONS
      contextEvents = SEED_CONTEXT_EVENTS
    } else if (realMetrics && realMetrics.length > 0) {
      metrics = realMetrics
      interventions = (realProtocols || []).map((p: { id: string; peptide?: { name: string; type?: string }; startDate: string; doseAmount?: number; doseUnit?: string; frequency: string; timing?: string }) => ({
        id: p.id,
        name: p.peptide?.name || 'Unknown',
        type: (p.peptide?.type === 'supplement' ? 'supplement' : 'peptide') as 'peptide' | 'supplement',
        startDate: format(new Date(p.startDate), 'yyyy-MM-dd'),
        dose: `${p.doseAmount || ''}${p.doseUnit || ''}`,
        frequency: p.frequency,
        timing: p.timing || ''
      }))
      contextEvents = []
    } else {
      return null
    }

    const metricsByType = new Map<string, SeedMetric[]>()
    for (const m of metrics) {
      if (!metricsByType.has(m.metricType)) {
        metricsByType.set(m.metricType, [])
      }
      metricsByType.get(m.metricType)!.push(m)
    }

    const availableMetrics = new Set(metricsByType.keys())

    return { metrics, interventions, contextEvents, metricsByType, availableMetrics }
  }, [useDemoData, realMetrics, realProtocols])

  // ── Baselines ──
  const baselines = useMemo(() => {
    if (!dataSource) return null
    const map = new Map<string, MetricBaseline>()
    for (const [metricType, values] of dataSource.metricsByType) {
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
  }, [dataSource])

  // ── Trajectory + body composition ──
  const trajectory = useMemo(() => {
    if (!dataSource || !baselines) return null
    return computeTrajectory(dataSource.metrics, baselines)
  }, [dataSource, baselines])

  const bodyCompState = useMemo(() => {
    if (!dataSource) return null
    return computeBodyCompState(dataSource.metrics)
  }, [dataSource])

  // ── Today's deltas (signal classification) ──
  const todayDeltas = useMemo(() => {
    if (!dataSource || !baselines) return []

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

      const todayValue = dataSource.metrics.find(m => m.date === today && m.metricType === metricType)
      const yesterdayValue = dataSource.metrics.find(m => m.date === yesterday && m.metricType === metricType)
      const currentValue = todayValue || yesterdayValue
      if (!currentValue) continue

      const polarity = METRIC_POLARITY[metricType] || 'higher_better'
      const delta = compareToBaseline(currentValue.value, baseline, polarity)

      if (delta.significance === 'none') continue

      const recentValues = dataSource.metrics
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
  }, [dataSource, baselines])

  // ── Claims, themes, recommendation ──
  const claimsData = useMemo(() => {
    if (!dataSource || !baselines) return null

    const allClaims = generateClaims({
      metrics: dataSource.metrics,
      interventions: dataSource.interventions,
      contextEvents: dataSource.contextEvents,
      baselines
    })

    const claims = allClaims.filter(c => {
      if (!c.metricType) return true
      if (c.id.startsWith('availability_')) return true
      return dataSource.availableMetrics.has(c.metricType)
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
  }, [dataSource, baselines])

  // ── Protocol evidence ──
  const protocolEvidence = useMemo(() => {
    if (!dataSource || !baselines) return []
    return computeProtocolEvidence(dataSource.interventions, dataSource.metrics, dataSource.contextEvents, baselines)
  }, [dataSource, baselines])

  // ── Data status ──
  const dataStatus = useMemo(() => {
    if (!dataSource) return null
    const status = {
      sleep: { tracked: 0, total: 3, metrics: ['sleep_duration', 'rem_sleep', 'hrv'] },
      body: { tracked: 0, total: 5, metrics: ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi'] },
      activity: { tracked: 0, total: 4, metrics: ['steps', 'active_calories', 'exercise_minutes', 'walking_running_distance'] },
      vitals: { tracked: 0, total: 3, metrics: ['rhr', 'respiratory_rate', 'blood_oxygen'] },
      fitness: { tracked: 0, total: 1, metrics: ['vo2_max'] },
    }
    for (const [, info] of Object.entries(status)) {
      info.tracked = info.metrics.filter(m => dataSource.availableMetrics.has(m)).length
    }
    return status
  }, [dataSource])

  // ── Assembled processedData ──
  const processedData = useMemo(() => {
    if (!dataSource || !baselines || !trajectory || !bodyCompState || !dataStatus) return null
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
      interventions: dataSource.interventions,
    }
  }, [dataSource, baselines, trajectory, bodyCompState, todayDeltas, claimsData, protocolEvidence, dataStatus])

  // Loading state: queries still in flight and user has connected integrations
  if (!processedData && isLoadingMetrics && hasConnectedIntegrations) {
    return (
      <div className="min-h-screen bg-[var(--background)] pb-24">
        <div className="sticky top-0 z-10 glass border-b border-[var(--border)] pt-[env(safe-area-inset-top)]">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold text-[var(--foreground)]">Health</h1>
            <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Trajectory skeleton */}
          <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
            <div className="h-4 w-40 bg-[var(--muted)] rounded animate-pulse" />
            <div className="h-8 w-32 bg-[var(--muted)] rounded animate-pulse" />
            <div className="h-4 w-64 bg-[var(--muted)] rounded animate-pulse" />
            <div className="flex gap-3 mt-4">
              <div className="h-10 flex-1 bg-[var(--muted)] rounded-lg animate-pulse" />
              <div className="h-10 flex-1 bg-[var(--muted)] rounded-lg animate-pulse" />
              <div className="h-10 flex-1 bg-[var(--muted)] rounded-lg animate-pulse" />
            </div>
          </div>
          {/* Category cards skeleton */}
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 space-y-2">
                <div className="h-3 w-12 bg-[var(--muted)] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[var(--muted)] rounded animate-pulse" />
              </div>
            ))}
          </div>
          {/* What matters skeleton */}
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-3">
            <div className="h-3 w-32 bg-[var(--muted)] rounded animate-pulse" />
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="w-8 h-8 bg-[var(--muted)] rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-[var(--muted)] rounded animate-pulse" />
                  <div className="h-3 w-48 bg-[var(--muted)] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // No data state: queries resolved but no connected integrations or insufficient data
  if (!processedData) {
    const appleHealthIntegration = integrations?.find((i: Integration) => i.provider === 'apple_health')

    return (
      <div className="min-h-full bg-[var(--background)] p-4">
        <div className="max-w-lg mx-auto pt-8">
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
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-red-400" />
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
                      'bg-indigo-600 hover:bg-indigo-500 text-white',
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
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Connect
                  </button>
                )}
              </div>
              {appleHealthIntegration?.syncError && (
                <div className="mt-2 text-xs text-red-400">
                  Error: {appleHealthIntegration.syncError}
                </div>
              )}
            </div>
          </div>

          <div className="text-xs text-[var(--muted-foreground)] p-3 bg-[var(--muted)] rounded-lg">
            <div>User ID: {currentUserId || 'Not logged in'}</div>
            <div>Integrations: {integrations?.length || 0}</div>
            <div>Connected: {hasConnectedIntegrations ? 'Yes' : 'No'}</div>
            <div>Metrics: {realMetrics?.length || 0}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[var(--background)] pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 glass border-b border-[var(--border)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Health</h1>
          <div className="flex items-center gap-2">
            {(() => {
              if (useDemoData) {
                return (
                  <button
                    onClick={() => setShowIntegrations(!showIntegrations)}
                    className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-xs rounded-full"
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
                        ? "bg-amber-500/20 text-amber-400"
                        : isStale
                        ? "bg-amber-500/20 text-amber-400"
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
          </div>
        </div>

        {/* Section tabs — renamed */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-1">
          {[
            { id: 'overview', label: 'Today' },
            { id: 'evidence', label: 'Evidence' },
            { id: 'insights', label: 'Insights' }
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
          <div className="max-w-lg mx-auto px-4 pb-4 border-t border-[var(--border)] pt-4 max-h-[50vh] overflow-y-auto">
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
                          isConnected ? "bg-red-500/20" : "bg-[var(--border)]"
                        )}>
                          <Heart className={cn("w-5 h-5", isConnected ? "text-red-400" : "text-[var(--muted-foreground)]")} />
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
                            "bg-indigo-600 hover:bg-indigo-500 text-white",
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
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
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
                        ? "bg-amber-950/30 border-amber-800/50"
                        : "bg-emerald-950/30 border-emerald-800/50"
                      : "bg-[var(--muted)] border-[var(--border)]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          isConnected ? "bg-violet-500/20" : "bg-[var(--border)]"
                        )}>
                          <Watch className={cn("w-5 h-5", isConnected ? "text-violet-400" : "text-[var(--muted-foreground)]")} />
                        </div>
                        <div>
                          <div className="font-medium text-[var(--foreground)]">
                            Oura Ring
                            {!isConnected && <span className="ml-1.5 text-[10px] font-normal text-[var(--muted-foreground)]">Optional</span>}
                          </div>
                          {isConnected ? (
                            <div className="text-xs text-emerald-400 flex items-center gap-1">
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
                            <div className="text-xs text-amber-400 mt-1">{oura.syncError}</div>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          onClick={() => syncMutation.mutate('oura')}
                          disabled={syncingProvider === 'oura'}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            "bg-indigo-600 hover:bg-indigo-500 text-white",
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
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Eight Sleep */}
              {(() => {
                const eightSleep = integrations?.find((i: Integration) => i.provider === 'eight_sleep')
                const isConnected = eightSleep?.isConnected
                const hasError = eightSleep?.syncError
                return (
                  <div className={cn(
                    "p-3 rounded-xl border",
                    isConnected
                      ? hasError
                        ? "bg-amber-950/30 border-amber-800/50"
                        : "bg-emerald-950/30 border-emerald-800/50"
                      : "bg-[var(--muted)] border-[var(--border)]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          isConnected ? "bg-cyan-500/20" : "bg-[var(--border)]"
                        )}>
                          <Moon className={cn("w-5 h-5", isConnected ? "text-cyan-400" : "text-[var(--muted-foreground)]")} />
                        </div>
                        <div>
                          <div className="font-medium text-[var(--foreground)]">
                            Eight Sleep
                            {!isConnected && <span className="ml-1.5 text-[10px] font-normal text-[var(--muted-foreground)]">Optional</span>}
                          </div>
                          {isConnected ? (
                            <div className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Connected
                              {eightSleep?.lastSyncAt && (
                                <span className="text-[var(--muted-foreground)] ml-1">
                                  · {format(new Date(eightSleep.lastSyncAt), 'MMM d, h:mm a')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-[var(--muted-foreground)]">Adds mattress-based sleep tracking and temperature data</div>
                          )}
                          {hasError && (
                            <div className="text-xs text-amber-400 mt-1">{eightSleep.syncError}</div>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          onClick={() => syncMutation.mutate('eight_sleep')}
                          disabled={syncingProvider === 'eight_sleep'}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            "bg-indigo-600 hover:bg-indigo-500 text-white",
                            "disabled:opacity-50"
                          )}
                        >
                          {syncingProvider === 'eight_sleep' ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Syncing
                            </span>
                          ) : 'Sync Now'}
                        </button>
                      ) : (
                        <button
                          onClick={connectEightSleep}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
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

      {/* Permission-denied banner — shown above fold */}
      {(() => {
        if (useDemoData) return null
        const connectedWithState = integrations?.find((i: Integration) => i.isConnected && i.metricSyncState)
        const syncState = connectedWithState?.metricSyncState
        const deniedList = syncState
          ? Object.entries(syncState).filter(([, s]) => s.status === 'permission_denied')
          : []
        if (deniedList.length === 0) return null
        return (
          <div className="max-w-lg mx-auto px-4 pt-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
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

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* ═══════════════ TODAY TAB ═══════════════ */}
        {selectedSection === 'overview' && (
          <>
            {/* 1. Trajectory Hero */}
            <TrajectoryHero
              trajectory={processedData.trajectory}
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

            {/* 3. Body Composition Card */}
            {processedData.bodyCompState.recompStatus !== 'insufficient_data' && (
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Scale className="w-4 h-4 text-[var(--muted-foreground)]" />
                  <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    Body Composition
                  </h3>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    processedData.bodyCompState.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                    processedData.bodyCompState.confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' :
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
              </div>
            )}

            {/* 4. What Matters Today (signal-classified + top recommendation integrated) */}
            <WhatChangedCard
              items={processedData.deltas.slice(0, 6)}
              topRecommendation={processedData.recommendation}
              onItemClick={handleDeltaClick}
              onWhyClick={handleWhyClick}
            />

            {/* 5. Quick Protocol Status */}
            {processedData.protocolEvidence.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    Protocol Status
                  </h2>
                  <button
                    onClick={() => setSelectedSection('evidence')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    View All <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {processedData.protocolEvidence.slice(0, 2).map((evidence) => (
                  <QuickVerdictBadge
                    key={evidence.protocolId}
                    protocolName={evidence.protocolName}
                    verdict={evidence.verdict}
                    daysOnProtocol={evidence.daysOnProtocol}
                    onClick={() => setSelectedSection('evidence')}
                  />
                ))}
              </div>
            )}

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
                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full">
                          {deniedMetrics.length} denied
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    {deniedMetrics.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
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
                              className="mt-2 text-xs text-amber-400 font-medium hover:text-amber-300"
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
                                <span className="text-amber-400 flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Denied
                                </span>
                              )}
                              {state.status === 'error' && (
                                <span className="text-red-400">Error</span>
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

        {/* ═══════════════ EVIDENCE TAB ═══════════════ */}
        {selectedSection === 'evidence' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
              <Beaker className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Protocol Evidence</span>
            </div>

            {processedData.protocolEvidence.length === 0 && (
              <div className="text-center py-12">
                <Beaker className="w-10 h-10 text-[var(--muted-foreground)] mx-auto mb-3" />
                <p className="text-[var(--muted-foreground)]">No active protocols to evaluate</p>
              </div>
            )}

            {processedData.protocolEvidence.map((evidence) => (
              <ProtocolEvidenceCard
                key={evidence.protocolId}
                evidence={evidence}
              />
            ))}
          </div>
        )}

        {/* ═══════════════ INSIGHTS TAB ═══════════════ */}
        {selectedSection === 'insights' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Themed Insights</span>
            </div>

            {processedData.themes.length === 0 && (
              <div className="text-center py-12">
                <Sparkles className="w-10 h-10 text-[var(--muted-foreground)] mx-auto mb-3" />
                <p className="text-[var(--muted-foreground)]">Not enough data for themed insights yet</p>
              </div>
            )}

            {processedData.themes.map((theme) => (
              <InsightThemeCard
                key={theme.id}
                theme={theme}
              />
            ))}

            {/* Remaining claims not in themes */}
            {processedData.claims.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 text-xs text-[var(--muted-foreground)] uppercase tracking-wider py-2">
                  <span>All Claims ({processedData.claims.length})</span>
                  <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 pt-2">
                  {processedData.claims.slice(0, 8).map((claim) => (
                    <ClaimWithReceipts
                      key={claim.id}
                      claim={claim}
                      onViewDays={() => {}}
                    />
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
                {processedData.trajectory.direction.charAt(0).toUpperCase() + processedData.trajectory.direction.slice(1)}
              </div>
              <div className="text-sm text-[var(--muted-foreground)]">
                {processedData.trajectory.window}-day window · {processedData.trajectory.confidence} confidence
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-[var(--foreground)]">What goes into your trajectory:</h4>
            <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <div className="flex items-start gap-2">
                <Moon className="w-4 h-4 mt-0.5 text-indigo-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Sleep (35%)</span>
                  <p>Duration, deep sleep, efficiency, and sleep score trends.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Heart className="w-4 h-4 mt-0.5 text-emerald-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Recovery (30%)</span>
                  <p>HRV, resting heart rate, and readiness trends.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Footprints className="w-4 h-4 mt-0.5 text-amber-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Activity (20%)</span>
                  <p>Steps, exercise, and activity consistency.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Scale className="w-4 h-4 mt-0.5 text-cyan-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Body Comp (15%)</span>
                  <p>Weight, body fat, and lean mass trends when available.</p>
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
            <h4 className="font-medium text-[var(--foreground)] mb-2">Data: {processedData.trajectory.daysOfData} days</h4>
            <p className="text-sm text-[var(--muted-foreground)]">
              Using a {processedData.trajectory.window}-day analysis window.
              {processedData.trajectory.dataState === 'rich' ? ' Plenty of data for high confidence.' :
               processedData.trajectory.dataState === 'adequate' ? ' Adequate data — confidence improves with more days.' :
               processedData.trajectory.dataState === 'sparse' ? ' Limited data — results are directional, not definitive.' :
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
              selectedDelta.isGood ? "bg-emerald-500/10" : "bg-amber-500/10"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  selectedDelta.isGood ? "text-emerald-400" : "text-amber-400"
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
              {processedData.interventions.slice(0, 3).map((intervention) => (
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
    indigo: 'bg-indigo-500/20 text-indigo-400',
    emerald: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400'
  }

  const DirIcon = direction === 'improving' ? TrendingUp :
                  direction === 'declining' ? TrendingDown : Minus
  const dirColor = direction === 'improving' ? 'text-emerald-400' :
                   direction === 'declining' ? 'text-amber-400' : 'text-[var(--muted-foreground)]'

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
      direction === 'up' ? 'text-emerald-400' :
      direction === 'down' ? 'text-amber-400' : 'text-[var(--muted-foreground)]'
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
    accumulating: 'text-amber-400',
    weak_positive: 'text-amber-400',
    likely_positive: 'text-emerald-400',
    strong_positive: 'text-emerald-400',
    no_detectable_effect: 'text-[var(--muted-foreground)]',
    possible_negative: 'text-rose-400',
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
