'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import {
  Activity,
  Heart,
  Moon,
  Footprints,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  Zap,
  Brain,
  Settings2,
  Flame,
  Timer,
  Wind,
  Droplet,
  Thermometer,
  Route,
  Target,
  Dumbbell
} from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { HealthIntegrationCard } from '@/components/health-integration-card'
import { HealthMetricsChart } from '@/components/health-metrics-chart'
import { cn } from '@/lib/utils'
import {
  MetricType,
  HealthProviderType,
  getMetricDisplayName,
  formatMetricValue
} from '@/lib/health-providers'

interface ProviderWithIntegration {
  name: HealthProviderType
  displayName: string
  description: string
  supportedMetrics: string[]
  requiresOAuth: boolean
  requiresCredentials: boolean
  isNativeOnly: boolean
  integration: {
    id: string
    provider: string
    isConnected: boolean
    lastSyncAt: string | null
    syncError: string | null
    enabledMetrics: string | null
  } | null
}

interface HealthTrend {
  metricType: MetricType
  displayName: string
  currentValue: number
  previousValue: number
  change: number
  changePercent: number
  trend: 'improving' | 'declining' | 'stable'
  confidence: 'high' | 'medium' | 'low'
  dataPoints: number
}

interface SynthesizedInsight {
  id: string
  type: 'improvement' | 'concern' | 'observation' | 'recommendation'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  metrics: MetricType[]
  relatedProtocol?: { id: string; name: string }
}

interface HealthScore {
  overall: number
  sleep: number
  recovery: number
  activity: number
  breakdown: Array<{
    metric: MetricType
    score: number
    weight: number
    trend: 'up' | 'down' | 'stable'
  }>
}

interface HealthSummary {
  score: HealthScore
  trends: HealthTrend[]
  insights: SynthesizedInsight[]
  lastUpdated: string
}

interface MetricDataPoint {
  id: string
  provider: string
  value: number
  unit: string
  recordedAt: string
}

interface MetricsResponse {
  metrics: Record<string, MetricDataPoint[]>
  stats: Record<string, {
    count: number
    min: number
    max: number
    avg: number
    latest: number
    latestDate: string
  }>
  dateRange: { start: string; end: string }
}

const metricIcons: Partial<Record<MetricType, React.ReactNode>> = {
  // Sleep
  sleep_duration: <Moon className="w-4 h-4" />,
  sleep_score: <Moon className="w-4 h-4" />,
  bed_temperature: <Moon className="w-4 h-4" />,
  time_in_bed: <Moon className="w-4 h-4" />,
  // Heart & HRV
  hrv: <Activity className="w-4 h-4" />,
  rhr: <Heart className="w-4 h-4" />,
  // Body Composition
  weight: <Scale className="w-4 h-4" />,
  body_fat_percentage: <Target className="w-4 h-4" />,
  lean_body_mass: <Dumbbell className="w-4 h-4" />,
  bmi: <Scale className="w-4 h-4" />,
  bone_mass: <Scale className="w-4 h-4" />,
  muscle_mass: <Dumbbell className="w-4 h-4" />,
  body_water: <Droplet className="w-4 h-4" />,
  // Activity
  steps: <Footprints className="w-4 h-4" />,
  active_calories: <Flame className="w-4 h-4" />,
  basal_calories: <Flame className="w-4 h-4" />,
  exercise_minutes: <Timer className="w-4 h-4" />,
  stand_hours: <Activity className="w-4 h-4" />,
  vo2_max: <Activity className="w-4 h-4" />,
  walking_running_distance: <Route className="w-4 h-4" />,
  // Vitals
  respiratory_rate: <Wind className="w-4 h-4" />,
  blood_oxygen: <Droplet className="w-4 h-4" />,
  body_temperature: <Thermometer className="w-4 h-4" />
}

const insightIcons = {
  improvement: <TrendingUp className="w-4 h-4" />,
  concern: <AlertCircle className="w-4 h-4" />,
  observation: <Sparkles className="w-4 h-4" />,
  recommendation: <Brain className="w-4 h-4" />
}

const insightColors = {
  improvement: 'bg-green-500/10 border-green-500/30 text-green-400',
  concern: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  observation: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  recommendation: 'bg-purple-500/10 border-purple-500/30 text-purple-400'
}

export default function HealthPage() {
  const { currentUserId } = useAppStore()
  const queryClient = useQueryClient()

  const [connectingProvider, setConnectingProvider] = useState<HealthProviderType | null>(null)
  const [syncingProvider, setSyncingProvider] = useState<HealthProviderType | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('sleep_score')
  const [dateRange, setDateRange] = useState(30)
  const [showIntegrations, setShowIntegrations] = useState(false)
  const [autoSyncedProviders, setAutoSyncedProviders] = useState<Set<string>>(new Set())

  // Check for connection success/error in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('error')

    if (connected || error) {
      window.history.replaceState({}, '', '/health')
      queryClient.invalidateQueries({ queryKey: ['health-integrations'] })
      queryClient.invalidateQueries({ queryKey: ['health-summary'] })
    }
  }, [queryClient])


  // Fetch unified health summary
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<HealthSummary>({
    queryKey: ['health-summary', currentUserId],
    queryFn: async () => {
      const res = await fetch('/api/health/summary')
      if (!res.ok) throw new Error('Failed to fetch health summary')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5
  })

  // Fetch integrations
  const { data: integrations, isLoading: integrationsLoading, refetch: refetchIntegrations } = useQuery<ProviderWithIntegration[]>({
    queryKey: ['health-integrations'],
    queryFn: async () => {
      const res = await fetch('/api/health/integrations')
      if (!res.ok) throw new Error('Failed to fetch integrations')
      return res.json()
    },
    staleTime: 1000 * 60
  })

  // Fetch metrics for chart
  const endDate = new Date()
  const startDate = subDays(endDate, dateRange)

  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<MetricsResponse>({
    queryKey: ['health-metrics', currentUserId, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })
      const res = await fetch(`/api/health/metrics?${params}`)
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60
  })

  // Auto-sync on page visit if last sync was >1 hour ago
  useEffect(() => {
    if (!integrations || integrationsLoading) return

    const ONE_HOUR_MS = 60 * 60 * 1000
    const now = new Date().getTime()

    integrations.forEach(provider => {
      if (!provider.integration?.isConnected) return
      if (autoSyncedProviders.has(provider.name)) return

      const lastSync = provider.integration.lastSyncAt
        ? new Date(provider.integration.lastSyncAt).getTime()
        : 0
      const timeSinceSync = now - lastSync

      if (timeSinceSync > ONE_HOUR_MS) {
        // Mark as auto-synced to prevent re-triggering
        setAutoSyncedProviders(prev => new Set(prev).add(provider.name))
        // Trigger sync
        setSyncingProvider(provider.name)
        fetch(`/api/health/sync/${provider.name}`, { method: 'POST' })
          .then(res => {
            if (res.ok) {
              refetchMetrics()
              refetchSummary()
            }
          })
          .finally(() => {
            setSyncingProvider(null)
          })
      }
    })
  }, [integrations, integrationsLoading, autoSyncedProviders, refetchMetrics, refetchSummary])

  // Mutations
  const connectMutation = useMutation({
    mutationFn: async (provider: HealthProviderType) => {
      const res = await fetch('/api/health/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      })
      if (!res.ok) throw new Error('Failed to initiate connection')
      return res.json()
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else if (data.requiresNativePermission) {
        refetchIntegrations()
        refetchSummary()
        setConnectingProvider(null)
      }
    },
    onError: () => setConnectingProvider(null)
  })

  const disconnectMutation = useMutation({
    mutationFn: async (provider: HealthProviderType) => {
      const res = await fetch(`/api/health/integrations?provider=${provider}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      return res.json()
    },
    onSuccess: () => {
      refetchIntegrations()
      refetchMetrics()
      refetchSummary()
    }
  })

  const syncMutation = useMutation({
    mutationFn: async (provider: HealthProviderType) => {
      const res = await fetch(`/api/health/sync/${provider}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to sync')
      return res.json()
    },
    onSuccess: () => {
      refetchMetrics()
      refetchSummary()
      setSyncingProvider(null)
    },
    onError: () => setSyncingProvider(null)
  })

  const handleConnect = (provider: HealthProviderType) => {
    setConnectingProvider(provider)
    connectMutation.mutate(provider)
  }

  const handleDisconnect = (provider: HealthProviderType) => {
    if (confirm(`Disconnect from ${provider.replace(/_/g, ' ')}? Your synced data will be kept.`)) {
      disconnectMutation.mutate(provider)
    }
  }

  const handleSync = (provider: HealthProviderType) => {
    setSyncingProvider(provider)
    syncMutation.mutate(provider)
  }

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchIntegrations(), refetchMetrics(), refetchSummary()])
  }, [refetchIntegrations, refetchMetrics, refetchSummary])

  const hasConnectedProvider = integrations?.some(p => p.integration?.isConnected) || false
  const connectedCount = integrations?.filter(p => p.integration?.isConnected).length || 0
  const availableMetrics = Object.keys(metricsData?.metrics || {}) as MetricType[]

  // Score ring component
  const ScoreRing = ({ score, size = 'large', label }: { score: number; size?: 'large' | 'small'; label: string }) => {
    const radius = size === 'large' ? 54 : 28
    const stroke = size === 'large' ? 8 : 4
    const circumference = 2 * Math.PI * radius
    const progress = (score / 100) * circumference

    const getColor = (s: number) => {
      if (s >= 80) return 'text-green-400'
      if (s >= 60) return 'text-yellow-400'
      return 'text-red-400'
    }

    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: (radius + stroke) * 2, height: (radius + stroke) * 2 }}>
          <svg className="transform -rotate-90" width="100%" height="100%">
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              stroke="currentColor"
              strokeWidth={stroke}
              fill="none"
              className="text-[var(--muted)]"
            />
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              stroke="currentColor"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              className={cn('transition-all duration-500', getColor(score))}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn(
              'font-bold text-[var(--foreground)]',
              size === 'large' ? 'text-2xl' : 'text-sm'
            )}>
              {score}
            </span>
          </div>
        </div>
        <span className={cn(
          'text-[var(--muted-foreground)] mt-1',
          size === 'large' ? 'text-sm' : 'text-[10px]'
        )}>
          {label}
        </span>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="p-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Health</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {connectedCount > 0 ? `${connectedCount} source${connectedCount > 1 ? 's' : ''} connected` : 'Connect a health source'}
            </p>
          </div>
          <button
            onClick={() => setShowIntegrations(!showIntegrations)}
            className="p-2 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] transition-colors"
          >
            <Settings2 className="w-5 h-5 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* No data state */}
        {!hasConnectedProvider && !integrationsLoading && (
          <Card className="mb-6">
            <CardContent className="py-8 text-center">
              <Activity className="w-12 h-12 mx-auto mb-3 text-[var(--muted-foreground)]" />
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">
                Connect Your Health Data
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mb-4">
                Link Oura, Eight Sleep, or Apple Health to track and correlate metrics with your protocols
              </p>
              <Button variant="primary" size="sm" onClick={() => setShowIntegrations(true)}>
                <Zap className="w-4 h-4 mr-2" />
                Connect a Source
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Health Score */}
        {hasConnectedProvider && summary && !summaryLoading && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent)]/5 border border-[var(--accent)]/20">
            <div className="flex items-center justify-between">
              <ScoreRing score={summary.score.overall} size="large" label="Overall" />
              <div className="flex gap-4">
                <ScoreRing score={summary.score.sleep} size="small" label="Sleep" />
                <ScoreRing score={summary.score.recovery} size="small" label="Recovery" />
                <ScoreRing score={summary.score.activity} size="small" label="Activity" />
              </div>
            </div>
          </div>
        )}

        {/* Synthesized Insights */}
        {hasConnectedProvider && summary?.insights && summary.insights.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              Insights
            </h2>
            <div className="space-y-2">
              {summary.insights.map(insight => (
                <div
                  key={insight.id}
                  className={cn(
                    'p-3 rounded-xl border',
                    insightColors[insight.type]
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">{insightIcons[insight.type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)]">{insight.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{insight.description}</p>
                      {insight.relatedProtocol && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
                          {insight.relatedProtocol.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trends */}
        {hasConnectedProvider && summary?.trends && summary.trends.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Trends (7 days)</h2>
            <div className="grid grid-cols-2 gap-2">
              {summary.trends.slice(0, 6).map(trend => (
                <div
                  key={trend.metricType}
                  className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {metricIcons[trend.metricType] || <Activity className="w-4 h-4" />}
                      <span className="text-xs text-[var(--muted-foreground)]">{trend.displayName}</span>
                    </div>
                    {trend.trend === 'improving' ? (
                      <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    ) : trend.trend === 'declining' ? (
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    )}
                  </div>
                  <div className="text-lg font-bold text-[var(--foreground)]">
                    {formatMetricValue(trend.currentValue, trend.metricType)}
                  </div>
                  <div className={cn(
                    'text-[10px]',
                    trend.trend === 'improving' ? 'text-green-400' :
                      trend.trend === 'declining' ? 'text-red-400' :
                        'text-[var(--muted-foreground)]'
                  )}>
                    {trend.changePercent > 0 ? '+' : ''}{trend.changePercent.toFixed(0)}% vs last week
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart Section */}
        {hasConnectedProvider && availableMetrics.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">History</h2>
              <div className="flex gap-1">
                {[7, 30, 90].map(days => (
                  <button
                    key={days}
                    onClick={() => setDateRange(days)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      dateRange === days
                        ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    )}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {availableMetrics.map(metric => (
                <button
                  key={metric}
                  onClick={() => setSelectedMetric(metric)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all',
                    selectedMetric === metric
                      ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  )}
                >
                  {metricIcons[metric] || <Activity className="w-4 h-4" />}
                  {getMetricDisplayName(metric)}
                </button>
              ))}
            </div>

            {metricsLoading ? (
              <div className="h-48 rounded-xl bg-[var(--muted)] animate-pulse" />
            ) : metricsData?.metrics[selectedMetric] ? (
              <HealthMetricsChart
                metricType={selectedMetric}
                data={metricsData.metrics[selectedMetric]}
                protocolMarkers={[]}
              />
            ) : null}
          </div>
        )}

        {/* Integrations (Collapsible) */}
        <div className="border-t border-[var(--border)] pt-4">
          <button
            onClick={() => setShowIntegrations(!showIntegrations)}
            className="w-full flex items-center justify-between py-2"
          >
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Data Sources</h2>
            {showIntegrations ? (
              <ChevronUp className="w-4 h-4 text-[var(--muted-foreground)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
            )}
          </button>

          {showIntegrations && (
            <div className="space-y-3 mt-2">
              {integrationsLoading ? (
                <div className="h-32 rounded-2xl bg-[var(--muted)] animate-pulse" />
              ) : integrations && integrations.length > 0 ? (
                integrations.map(provider => (
                  <HealthIntegrationCard
                    key={provider.name}
                    provider={provider.name}
                    displayName={provider.displayName}
                    description={provider.description}
                    supportedMetrics={provider.supportedMetrics}
                    isNativeOnly={provider.isNativeOnly}
                    requiresCredentials={provider.requiresCredentials}
                    integration={provider.integration}
                    onConnect={() => handleConnect(provider.name)}
                    onDisconnect={() => handleDisconnect(provider.name)}
                    onSync={() => handleSync(provider.name)}
                    isConnecting={connectingProvider === provider.name}
                    isSyncing={syncingProvider === provider.name}
                  />
                ))
              ) : null}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  )
}
