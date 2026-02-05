'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, Package, ChevronRight, X } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import type { Alert } from '@/app/api/alerts/route'

export function AlertsBanner() {
  const { currentUserId } = useAppStore()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [isExpanded, setIsExpanded] = useState(false)

  const fetchAlerts = useCallback(async () => {
    if (!currentUserId) return

    try {
      const res = await fetch(`/api/alerts?userId=${currentUserId}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data)
      }
    } catch (error) {
      console.error('Error fetching alerts:', error)
    }
  }, [currentUserId])

  useEffect(() => {
    fetchAlerts()
    // Refresh alerts every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id))

  if (visibleAlerts.length === 0) return null

  const getIcon = (type: Alert['type']) => {
    switch (type) {
      case 'expiring':
      case 'expired':
        return <Clock className="w-4 h-4" />
      case 'low_inventory':
        return <Package className="w-4 h-4" />
      case 'protocol_ending':
        return <AlertTriangle className="w-4 h-4" />
      default:
        return <AlertTriangle className="w-4 h-4" />
    }
  }

  const getSeverityStyles = (severity: Alert['severity']) => {
    switch (severity) {
      case 'danger':
        return 'bg-[var(--error-muted)] border-[var(--error)]/30 text-[var(--error)]'
      case 'warning':
        return 'bg-[var(--warning-muted)] border-[var(--warning)]/30 text-[var(--warning)]'
      case 'info':
        return 'bg-[var(--evidence-muted)] border-[var(--evidence)]/30 text-[var(--evidence)]'
      default:
        return 'bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]'
    }
  }

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDismissedIds((prev) => new Set([...prev, id]))
  }

  // Show condensed view if not expanded
  if (!isExpanded && visibleAlerts.length > 1) {
    const mostSevere = visibleAlerts[0]
    return (
      <div className="px-4 pt-4">
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            'w-full rounded-lg border p-3 flex items-center gap-3 transition-all',
            getSeverityStyles(mostSevere.severity)
          )}
        >
          {getIcon(mostSevere.type)}
          <div className="flex-1 text-left">
            <div className="font-medium text-sm">
              {visibleAlerts.length} alerts need attention
            </div>
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 space-y-2">
      {visibleAlerts.map((alert) => (
        <Link
          key={alert.id}
          href={alert.link || '#'}
          className={cn(
            'block rounded-lg border p-3 transition-all hover:shadow-sm',
            getSeverityStyles(alert.severity)
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getIcon(alert.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{alert.title}</div>
              <div className="text-xs opacity-80">{alert.message}</div>
            </div>
            <button
              onClick={(e) => handleDismiss(alert.id, e)}
              className="p-1 rounded hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </Link>
      ))}
      {visibleAlerts.length > 1 && (
        <button
          onClick={() => setIsExpanded(false)}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] w-full text-center py-1"
        >
          Collapse
        </button>
      )}
    </div>
  )
}
