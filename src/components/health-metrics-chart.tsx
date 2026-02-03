'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { MetricType, getMetricDisplayName, formatMetricValue } from '@/lib/health-providers'

interface MetricDataPoint {
  id: string
  provider: string
  value: number
  unit: string
  recordedAt: string
}

interface ProtocolMarker {
  date: string
  name: string
  id: string
}

interface HealthMetricsChartProps {
  metricType: MetricType
  data: MetricDataPoint[]
  protocolMarkers?: ProtocolMarker[]
  className?: string
}

export function HealthMetricsChart({
  metricType,
  data,
  protocolMarkers = [],
  className
}: HealthMetricsChartProps) {
  // Calculate chart dimensions and values
  const chartData = useMemo(() => {
    if (data.length === 0) return null

    const values = data.map(d => d.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    // Add padding to range
    const paddedMin = min - range * 0.1
    const paddedMax = max + range * 0.1
    const paddedRange = paddedMax - paddedMin

    // Calculate average
    const avg = values.reduce((a, b) => a + b, 0) / values.length

    // Normalize values to 0-100 for chart
    const normalizedData = data.map(d => ({
      ...d,
      normalizedValue: ((d.value - paddedMin) / paddedRange) * 100,
      date: new Date(d.recordedAt)
    }))

    // Get date range
    const dates = normalizedData.map(d => d.date.getTime())
    const minDate = Math.min(...dates)
    const maxDate = Math.max(...dates)
    const dateRange = maxDate - minDate || 1

    // Add x position (0-100)
    const withPositions = normalizedData.map(d => ({
      ...d,
      x: ((d.date.getTime() - minDate) / dateRange) * 100
    }))

    // Process protocol markers
    const markers = protocolMarkers
      .map(m => {
        const date = new Date(m.date).getTime()
        if (date < minDate || date > maxDate) return null
        return {
          ...m,
          x: ((date - minDate) / dateRange) * 100
        }
      })
      .filter((m): m is ProtocolMarker & { x: number } => m !== null)

    return {
      points: withPositions,
      min: paddedMin,
      max: paddedMax,
      avg,
      actualMin: min,
      actualMax: max,
      markers,
      minDate: new Date(minDate),
      maxDate: new Date(maxDate)
    }
  }, [data, protocolMarkers])

  if (!chartData || chartData.points.length === 0) {
    return (
      <div className={cn('rounded-xl bg-[var(--muted)] p-6', className)}>
        <p className="text-sm text-[var(--muted-foreground)] text-center">
          No data available for {getMetricDisplayName(metricType)}
        </p>
      </div>
    )
  }

  // Generate SVG path for the line
  const pathData = chartData.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${100 - p.normalizedValue}`)
    .join(' ')

  // Generate area path (for gradient fill)
  const areaPath = `${pathData} L ${chartData.points[chartData.points.length - 1].x} 100 L ${chartData.points[0].x} 100 Z`

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className={cn('rounded-xl bg-[var(--muted)]/50 p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {getMetricDisplayName(metricType)}
        </h3>
        <div className="text-right">
          <p className="text-lg font-bold text-[var(--foreground)]">
            {formatMetricValue(chartData.points[chartData.points.length - 1].value, metricType)}
          </p>
          <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide">
            Latest
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-32 mb-2">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id={`gradient-${metricType}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />

          {/* Protocol markers */}
          {chartData.markers.map((marker, i) => (
            <g key={marker.id}>
              <line
                x1={marker.x}
                y1="0"
                x2={marker.x}
                y2="100"
                stroke="var(--accent)"
                strokeWidth="0.5"
                strokeDasharray="3,3"
              />
              {/* Marker dot */}
              <circle
                cx={marker.x}
                cy="5"
                r="2"
                fill="var(--accent)"
              />
            </g>
          ))}

          {/* Area fill */}
          <path
            d={areaPath}
            fill={`url(#gradient-${metricType})`}
          />

          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points */}
          {chartData.points.map((point, i) => (
            <circle
              key={point.id}
              cx={point.x}
              cy={100 - point.normalizedValue}
              r="1.5"
              fill="var(--accent)"
              className="hover:r-3 transition-all"
            />
          ))}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-[var(--muted-foreground)] -ml-1 py-1">
          <span>{formatMetricValue(chartData.actualMax, metricType)}</span>
          <span>{formatMetricValue(chartData.avg, metricType)}</span>
          <span>{formatMetricValue(chartData.actualMin, metricType)}</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>{formatDate(chartData.minDate)}</span>
        <span>{formatDate(chartData.maxDate)}</span>
      </div>

      {/* Protocol markers legend */}
      {chartData.markers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide mb-1">
            Protocol starts
          </p>
          <div className="flex flex-wrap gap-2">
            {chartData.markers.map(marker => (
              <span
                key={marker.id}
                className="px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[10px] text-[var(--accent)] font-medium"
              >
                {marker.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
