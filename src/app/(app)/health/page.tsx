'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
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
  X,
  Info,
  ChevronDown,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { BottomSheet } from '@/components/ui/bottom-sheet'

// Components
import { TodayScoreHero, TodayScoreCompact } from '@/components/health/today-score-hero'
import { WhatChangedCard, type DeltaItem } from '@/components/health/what-changed-card'
import { DoThisNextCard, type Recommendation } from '@/components/health/do-this-next-card'
import { ClaimWithReceipts, ClaimList } from '@/components/health/claim-with-receipts'
import { ProtocolImpactCard } from '@/components/health/protocol-impact-report'

// Data
import {
  SEED_DATA,
  SEED_INTERVENTIONS,
  SEED_CONTEXT_EVENTS,
  shouldUseDemoData,
  type SeedMetric
} from '@/lib/demo-data/seed-metrics'
import {
  computeBaseline,
  compareToBaseline,
  METRIC_POLARITY,
  type MetricBaseline
} from '@/lib/health-baselines'
import {
  generateClaims,
  getTodaysClaims,
  getTopRecommendation,
  type Claim
} from '@/lib/health-claims'
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
  const [selectedSection, setSelectedSection] = useState<'overview' | 'protocols' | 'insights'>('overview')
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
      // Transform API response to expected format
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
    if (syncingProvider === 'apple_health') return // Already syncing
    setSyncingProvider('apple_health')
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const result = await fetchAppleHealthWithStatus('', since)

      // POST fetched data to server for storage
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
        // Trigger client-side sync after connecting
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
          // Redirect to Oura OAuth
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
          // Redirect to Eight Sleep login page
          window.location.href = '/settings?connectEightSleep=true'
        }
      }
    } catch (error) {
      console.error('Failed to connect Eight Sleep:', error)
    }
  }

  // Fetch real health metrics (60 days)
  const { data: realMetricsData } = useQuery({
    queryKey: ['health-metrics-raw', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null
      // Calculate date range for last 60 days
      const endDate = new Date().toISOString()
      const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const res = await fetch(`/api/health/metrics?startDate=${startDate}&endDate=${endDate}`)
      if (!res.ok) return null
      const data = await res.json()
      // Flatten the grouped metrics into an array
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
    staleTime: 5 * 60 * 1000 // 5 minutes
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
  // Only use demo data if forced OR if no integration is connected and data is insufficient.
  // When an integration IS connected, always use real data (even if sparse) — never mask with demo.
  const useDemoData = FORCE_DEMO_MODE || (!hasConnectedIntegrations && !hasEnoughData)

  // Handle explain score
  const handleExplainScore = useCallback(() => {
    setShowExplainModal(true)
  }, [])

  // Handle "why might this be?" for delta items
  const handleWhyClick = useCallback(() => {
    setShowWhyModal(true)
  }, [])

  // Handle delta item click
  const handleDeltaClick = useCallback((item: DeltaItem) => {
    setSelectedDelta(item)
    setShowWhyModal(true)
  }, [])

  // Process health data (real or demo)
  const processedData = useMemo(() => {
    // Choose data source
    let metrics: SeedMetric[]
    let interventions: typeof SEED_INTERVENTIONS
    let contextEvents: typeof SEED_CONTEXT_EVENTS

    if (useDemoData) {
      // Use demo data
      metrics = SEED_DATA.metrics
      interventions = SEED_INTERVENTIONS
      contextEvents = SEED_CONTEXT_EVENTS
    } else if (realMetrics && realMetrics.length > 0) {
      // Use real data - already in correct format from query
      metrics = realMetrics
      // Transform real protocols to intervention format
      interventions = (realProtocols || []).map((p: { id: string; peptide?: { name: string; type?: string }; startDate: string; doseAmount?: number; doseUnit?: string; frequency: string; timing?: string }) => ({
        id: p.id,
        name: p.peptide?.name || 'Unknown',
        type: (p.peptide?.type === 'supplement' ? 'supplement' : 'peptide') as 'peptide' | 'supplement',
        startDate: format(new Date(p.startDate), 'yyyy-MM-dd'),
        dose: `${p.doseAmount || ''}${p.doseUnit || ''}`,
        frequency: p.frequency,
        timing: p.timing || ''
      }))
      contextEvents = [] // TODO: Add context events tracking
    } else {
      return null
    }

    const today = format(new Date(), 'yyyy-MM-dd')
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

    // Group metrics by type
    const metricsByType = new Map<string, SeedMetric[]>()
    for (const m of metrics) {
      if (!metricsByType.has(m.metricType)) {
        metricsByType.set(m.metricType, [])
      }
      metricsByType.get(m.metricType)!.push(m)
    }

    // Compute baselines
    const baselines = new Map<string, MetricBaseline>()
    for (const [metricType, values] of metricsByType) {
      const baseline = computeBaseline(
        values.map(v => ({ date: v.date, value: v.value })),
        28
      )
      if (baseline) {
        baseline.metricType = metricType
        baselines.set(metricType, baseline)
      }
    }

    // Get today's values and compare to baseline
    const todayDeltas: DeltaItem[] = []
    const keyMetrics = [
      'hrv', 'deep_sleep', 'sleep_efficiency', 'rhr', 'waso', 'sleep_score',
      'weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass',
      'vo2_max', 'steps', 'active_calories', 'exercise_minutes',
      'respiratory_rate', 'blood_oxygen',
    ]

    for (const metricType of keyMetrics) {
      const baseline = baselines.get(metricType)
      if (!baseline) continue

      // Get most recent value (use yesterday if today not available)
      const todayValue = metrics.find(m => m.date === today && m.metricType === metricType)
      const yesterdayValue = metrics.find(m => m.date === yesterday && m.metricType === metricType)
      const currentValue = todayValue || yesterdayValue
      if (!currentValue) continue

      const polarity = METRIC_POLARITY[metricType] || 'higher_better'
      const delta = compareToBaseline(currentValue.value, baseline, polarity)

      if (delta.significance !== 'none') {
        const isGood = (polarity === 'higher_better' && delta.direction === 'above') ||
                       (polarity === 'lower_better' && delta.direction === 'below')

        todayDeltas.push({
          id: metricType,
          metric: getMetricDisplayName(metricType),
          metricType,
          delta: formatDelta(delta.absoluteDelta, metricType),
          vsBaseline: delta.description,
          direction: delta.direction === 'above' ? 'up' : 'down',
          isGood,
          zScore: delta.zScore
        })
      }
    }

    // Sort by significance
    todayDeltas.sort((a, b) => Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0))

    // Calculate overall score (weighted)
    const sleepScore = metrics.find(m => m.date === yesterday && m.metricType === 'sleep_score')?.value || 75
    const hrvValue = metrics.find(m => m.date === yesterday && m.metricType === 'hrv')?.value || 50
    const hrvBaseline = baselines.get('hrv')
    const hrvScore = hrvBaseline
      ? Math.min(100, Math.max(0, 50 + ((hrvValue - hrvBaseline.mean) / hrvBaseline.stdDev) * 15))
      : 70

    // Compute activity score from steps and active calories
    const stepsBaseline = baselines.get('steps')
    const stepsValue = metrics.find(m => m.date === yesterday && m.metricType === 'steps')?.value
    const activeCalBaseline = baselines.get('active_calories')
    const activeCalValue = metrics.find(m => m.date === yesterday && m.metricType === 'active_calories')?.value

    let activityScore = 70 // default fallback
    if (stepsBaseline && stepsValue) {
      const stepsNorm = Math.min(100, Math.max(0, 50 + ((stepsValue - stepsBaseline.mean) / stepsBaseline.stdDev) * 15))
      if (activeCalBaseline && activeCalValue) {
        const calNorm = Math.min(100, Math.max(0, 50 + ((activeCalValue - activeCalBaseline.mean) / activeCalBaseline.stdDev) * 15))
        activityScore = stepsNorm * 0.5 + calNorm * 0.5
      } else {
        activityScore = stepsNorm
      }
    }

    const overallScore = Math.round(sleepScore * 0.5 + hrvScore * 0.3 + activityScore * 0.2)

    // Generate headline
    const topDrivers = todayDeltas.filter(d => d.isGood).slice(0, 2)
    const headline = topDrivers.length > 0
      ? `${topDrivers.map(d => d.metric).join(' + ')} drove recovery`
      : 'Recovery metrics within normal range'

    // Generate claims
    const allClaims = generateClaims({
      metrics,
      interventions,
      contextEvents,
      baselines
    })

    // Filter out claims for metrics with zero data (keep availability observations)
    const availableMetrics = new Set(metricsByType.keys())
    const claims = allClaims.filter(c => {
      if (!c.metricType) return true
      if (c.id.startsWith('availability_')) return true
      return availableMetrics.has(c.metricType)
    })

    // Separate availability observations for the Data Status section
    const availabilityClaims = claims.filter(c => c.id.startsWith('availability_'))
    const insightClaims = claims.filter(c => !c.id.startsWith('availability_'))

    // Data status: count metrics per category
    const dataStatus = {
      sleep: { tracked: 0, total: 3, metrics: ['sleep_duration', 'rem_sleep', 'hrv'] },
      body: { tracked: 0, total: 5, metrics: ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi'] },
      activity: { tracked: 0, total: 4, metrics: ['steps', 'active_calories', 'exercise_minutes', 'walking_running_distance'] },
      vitals: { tracked: 0, total: 3, metrics: ['rhr', 'respiratory_rate', 'blood_oxygen'] },
      fitness: { tracked: 0, total: 1, metrics: ['vo2_max'] },
    }

    for (const [category, info] of Object.entries(dataStatus)) {
      info.tracked = info.metrics.filter(m => availableMetrics.has(m)).length
    }

    // Derive recommendation from claims (use highest-priority actionable claim)
    const actionableClaim = claims
      .filter(c => c.type === 'warning' || c.priority === 'high')
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
      })[0]

    const topRecommendation: Recommendation | null = actionableClaim
      ? {
          id: `rec_${actionableClaim.id}`,
          icon: actionableClaim.type === 'warning' ? 'general' : 'supplement',
          action: actionableClaim.actionable || actionableClaim.headline,
          reason: actionableClaim.evidence || 'Based on your recent health data trends.',
          evidence: actionableClaim.evidence || '',
          confidence: actionableClaim.confidence?.level || 'medium'
        }
      : null

    // Sub-scores
    const sleepSubScore = Math.round(sleepScore * 0.95)
    const recoverySubScore = Math.round(hrvScore)
    const activitySubScore = Math.round(activityScore)

    return {
      overallScore,
      sleepSubScore,
      recoverySubScore,
      activitySubScore,
      headline,
      drivers: todayDeltas.slice(0, 3).map(d => ({
        label: d.metric,
        value: d.delta,
        delta: d.delta,
        direction: d.direction,
        isGood: d.isGood
      })),
      deltas: todayDeltas,
      claims: insightClaims,
      availabilityClaims,
      dataStatus,
      recommendation: topRecommendation,
      baselines,
      interventions
    }
  }, [useDemoData, realMetrics, realProtocols])

  if (!processedData) {
    const appleHealthIntegration = integrations?.find((i: Integration) => i.provider === 'apple_health')

    return (
      <div className="min-h-screen bg-[var(--background)] p-4">
        <div className="max-w-lg mx-auto pt-8">
          <div className="text-center mb-8">
            <Activity className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Connect Health Data</h2>
            <p className="text-[var(--muted-foreground)]">
              Connect your health sources to see personalized insights.
            </p>
          </div>

          {/* Integration cards */}
          <div className="space-y-3 mb-6">
            {/* Apple Health */}
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
                    ) : (
                      'Sync'
                    )}
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

          {/* Debug info */}
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
    <div className="min-h-screen bg-[var(--background)] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass border-b border-[var(--border)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Health</h1>
          <div className="flex items-center gap-2">
            {/* Data freshness / source status */}
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
                // Check for per-metric freshness from sync state
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
                    {syncState
                      ? `${freshCount}/${totalMetrics} fresh`
                      : hoursAgo < 1 ? 'Just synced' : isStale ? `Stale (${hoursAgo}h)` : `Synced ${hoursAgo}h ago`
                    }
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
                // Sync all connected integrations
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

        {/* Section tabs */}
        <div className="max-w-lg mx-auto px-4 pb-2 flex gap-1">
          {[
            { id: 'overview', label: 'Today' },
            { id: 'protocols', label: 'Protocols' },
            { id: 'insights', label: 'Insights' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedSection(tab.id as typeof selectedSection)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                selectedSection === tab.id
                  ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Integrations panel (collapsible) */}
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
                          <div className="font-medium text-[var(--foreground)]">Oura Ring</div>
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
                            <div className="text-xs text-[var(--muted-foreground)]">Not connected</div>
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
                          <div className="font-medium text-[var(--foreground)]">Eight Sleep</div>
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
                            <div className="text-xs text-[var(--muted-foreground)]">Not connected</div>
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

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {selectedSection === 'overview' && (
          <>
            {/* Top Insight — hero position */}
            {processedData.claims.length > 0 && (
              <div className="rounded-xl overflow-hidden bg-gradient-to-br from-[var(--card)] to-[var(--accent-muted)] border border-[var(--border)] p-5">
                <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                  Top Insight
                </div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] leading-snug mb-2">
                  {processedData.claims[0].headline}
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-3">
                  {processedData.claims[0].evidence}
                </p>
                {processedData.claims[0].actionable && (
                  <p className="text-sm text-[var(--accent)] font-medium">
                    → {processedData.claims[0].actionable}
                  </p>
                )}
                <button
                  onClick={() => setSelectedSection('insights')}
                  className="mt-3 text-sm text-[var(--accent)] hover:opacity-80 flex items-center gap-1"
                >
                  See all insights <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Today's Score Hero */}
            <TodayScoreHero
              score={processedData.overallScore}
              previousScore={processedData.overallScore - 3}
              headline={processedData.headline}
              drivers={processedData.drivers}
              onExplain={handleExplainScore}
            />

            {/* Sub-scores */}
            <div className="grid grid-cols-3 gap-3">
              <SubScoreCard
                icon={Moon}
                label="Sleep"
                score={processedData.sleepSubScore}
                color="indigo"
              />
              <SubScoreCard
                icon={Heart}
                label="Recovery"
                score={processedData.recoverySubScore}
                color="emerald"
              />
              <SubScoreCard
                icon={Footprints}
                label="Activity"
                score={processedData.activitySubScore}
                color="amber"
              />
            </div>

            {/* Body Composition (only if data exists) */}
            {(() => {
              const bodyMetrics = processedData.deltas.filter(d =>
                ['weight', 'body_fat_percentage', 'lean_body_mass', 'muscle_mass', 'bmi'].includes(d.metricType || d.id)
              )
              if (bodyMetrics.length === 0) return null
              return (
                <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
                  <h3 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
                    Body Composition
                  </h3>
                  <div className="space-y-2">
                    {bodyMetrics.slice(0, 3).map(metric => (
                      <div
                        key={metric.id}
                        className="flex items-center justify-between py-1"
                        onClick={() => handleDeltaClick(metric)}
                      >
                        <span className="text-sm text-[var(--foreground)]">{metric.metric}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-medium tabular-nums",
                            metric.isGood ? "text-[var(--success)]" : "text-[var(--warning)]"
                          )}>
                            {metric.delta}
                          </span>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {metric.vsBaseline}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Data Status — what's being tracked and what needs more data */}
            {(() => {
              const ds = processedData.dataStatus
              const categories = [
                { key: 'sleep', label: 'Sleep', icon: '🌙' },
                { key: 'body', label: 'Body', icon: '⚖️' },
                { key: 'activity', label: 'Activity', icon: '🏃' },
                { key: 'vitals', label: 'Vitals', icon: '❤️' },
                { key: 'fitness', label: 'Fitness', icon: '💪' },
              ] as const
              const totalTracked = Object.values(ds).reduce((s, c) => s + c.tracked, 0)
              const totalAvailable = Object.values(ds).reduce((s, c) => s + c.total, 0)
              const growingClaims = processedData.availabilityClaims.filter(c => c.id.startsWith('availability_growing_'))
              const providerClaims = processedData.availabilityClaims.filter(c => !c.id.startsWith('availability_growing_'))

              // Get per-metric sync state from connected Apple Health integration
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
                    {/* Permission denied warning */}
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

                    {/* Category grid */}
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

                    {/* Per-metric freshness (from sync state) */}
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

                    {/* Growing metrics — need more data */}
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

                    {/* Provider-exclusive metrics */}
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

            {/* What Changed */}
            <WhatChangedCard
              items={processedData.deltas.slice(0, 4)}
              onItemClick={handleDeltaClick}
              onWhyClick={handleWhyClick}
            />

            {/* Do This Next */}
            <DoThisNextCard
              recommendation={processedData.recommendation}
              onComplete={() => {}}
              onDismiss={() => {}}
            />

            {/* Quick Protocol Impact */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                  Protocol Impact
                </h2>
                <Link
                  href="/health/protocols"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  View All <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {processedData.interventions
                .filter(i => i.type === 'peptide')
                .slice(0, 2)
                .map((intervention) => {
                  const impactClaim = processedData.claims.find(
                    c => c.interventionId === intervention.id && (c.type === 'improvement' || c.type === 'decline')
                  )
                  const daysSinceStart = intervention.startDate
                    ? Math.max(0, Math.round((Date.now() - new Date(intervention.startDate).getTime()) / (1000 * 60 * 60 * 24)))
                    : 0
                  return (
                    <ProtocolImpactCard
                      key={intervention.id}
                      protocolName={intervention.name}
                      protocolType={intervention.type}
                      topMetric={impactClaim?.metricType ? getMetricDisplayName(impactClaim.metricType) : 'Tracking...'}
                      change={impactClaim ? Math.round(impactClaim.receipt.effectSize.percentChange) : 0}
                      daysOfData={daysSinceStart}
                      confidence={impactClaim?.confidence?.level || 'low'}
                      onClick={() => {}}
                    />
                  )
                })}
            </div>
          </>
        )}

        {selectedSection === 'protocols' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
              <Beaker className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Active Protocols</span>
            </div>

            {processedData.interventions.map((intervention) => {
              const impactClaim = processedData.claims.find(
                c => c.interventionId === intervention.id && (c.type === 'improvement' || c.type === 'decline')
              )
              const daysSinceStart = intervention.startDate
                ? Math.max(0, Math.round((Date.now() - new Date(intervention.startDate).getTime()) / (1000 * 60 * 60 * 24)))
                : 0
              return (
                <ProtocolImpactCard
                  key={intervention.id}
                  protocolName={intervention.name}
                  protocolType={intervention.type}
                  topMetric={impactClaim?.metricType ? getMetricDisplayName(impactClaim.metricType) : 'Tracking...'}
                  change={impactClaim ? Math.round(impactClaim.receipt.effectSize.percentChange) : 0}
                  daysOfData={daysSinceStart}
                  confidence={impactClaim?.confidence?.level || 'low'}
                  onClick={() => {}}
                />
              )
            })}
          </div>
        )}

        {selectedSection === 'insights' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">Claims with Receipts</span>
            </div>

            {processedData.claims.slice(0, 6).map((claim) => (
              <ClaimWithReceipts
                key={claim.id}
                claim={claim}
                onViewDays={() => {}}
              />
            ))}
          </div>
        )}
      </div>

      {/* Score Explanation Modal */}
      <BottomSheet
        isOpen={showExplainModal}
        onClose={() => setShowExplainModal(false)}
        title="Understanding Your Score"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--accent-muted)]">
            <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-3xl font-bold text-[var(--foreground)]">{processedData.overallScore}</div>
              <div className="text-sm text-[var(--muted-foreground)]">Today's Recovery Score</div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-[var(--foreground)]">How your score is calculated:</h4>
            <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <div className="flex items-start gap-2">
                <Moon className="w-4 h-4 mt-0.5 text-indigo-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Sleep Quality (50%)</span>
                  <p>Based on your sleep score, deep sleep duration, and sleep efficiency.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Heart className="w-4 h-4 mt-0.5 text-emerald-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Recovery (30%)</span>
                  <p>Heart rate variability compared to your personal baseline.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Footprints className="w-4 h-4 mt-0.5 text-amber-400" />
                <div>
                  <span className="text-[var(--foreground)] font-medium">Activity Balance (20%)</span>
                  <p>Activity levels balanced against recovery needs.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
            <h4 className="font-medium text-[var(--foreground)] mb-2">Today's Key Drivers</h4>
            <p className="text-sm text-[var(--muted-foreground)]">
              {processedData.headline}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {processedData.drivers.map((driver, i) => (
                <span
                  key={i}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium",
                    driver.isGood
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  )}
                >
                  {driver.delta} {driver.label}
                </span>
              ))}
            </div>
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
                  <div className="text-sm text-[var(--muted-foreground)]">{selectedDelta.vsBaseline}</div>
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

// Sub-score card component
function SubScoreCard({
  icon: Icon,
  label,
  score,
  color
}: {
  icon: typeof Moon
  label: string
  score: number
  color: 'indigo' | 'emerald' | 'amber'
}) {
  const colors = {
    indigo: 'bg-indigo-500/20 text-indigo-400',
    emerald: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400'
  }

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', colors[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-[var(--foreground)] tabular-nums">{score}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
    </div>
  )
}

// Helper functions
function getMetricDisplayName(metricType: string): string {
  const names: Record<string, string> = {
    // Sleep
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
    // Activity
    steps: 'Steps',
    active_calories: 'Active Calories',
    basal_calories: 'Basal Calories',
    exercise_minutes: 'Exercise',
    stand_hours: 'Stand Hours',
    walking_running_distance: 'Distance',
    // Body Composition
    weight: 'Weight',
    body_fat_percentage: 'Body Fat',
    lean_body_mass: 'Lean Mass',
    muscle_mass: 'Muscle Mass',
    bmi: 'BMI',
    bone_mass: 'Bone Mass',
    body_water: 'Body Water',
    // Fitness & Vitals
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

  // Body composition
  if (['weight', 'lean_body_mass', 'muscle_mass', 'bone_mass'].includes(metricType))
    return `${sign}${value.toFixed(1)}kg`
  if (metricType === 'body_fat_percentage') return `${sign}${value.toFixed(1)}%`
  if (metricType === 'bmi') return `${sign}${value.toFixed(1)}`

  // Fitness & Vitals
  if (metricType === 'vo2_max') return `${sign}${value.toFixed(1)}`
  if (metricType === 'blood_oxygen') return `${sign}${value.toFixed(1)}%`
  if (metricType === 'respiratory_rate') return `${sign}${value.toFixed(1)}`
  if (metricType === 'body_temperature') return `${sign}${value.toFixed(1)}°`

  // Activity
  if (metricType === 'steps') return `${sign}${Math.round(value).toLocaleString()}`
  if (metricType === 'active_calories' || metricType === 'basal_calories')
    return `${sign}${Math.round(value)}kcal`
  if (metricType === 'exercise_minutes') return `${sign}${Math.round(value)}min`
  if (metricType === 'walking_running_distance') return `${sign}${value.toFixed(1)}km`
  if (metricType === 'stand_hours') return `${sign}${Math.round(value)}h`

  return `${sign}${value.toFixed(1)}`
}
