'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Check,
  CheckCheck,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertsBanner } from '@/components/alerts-banner'
import { cn } from '@/lib/utils'
import type { TodayDoseItem } from '@/types'

// Color palette for peptides - consistent colors based on peptide name
const COLORS = ['blue', 'purple', 'green', 'amber', 'rose', 'cyan', 'orange', 'teal'] as const

const colorStyles: Record<string, { bg: string; border: string; text: string; accent: string; checkBg: string; checkHover: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', accent: 'text-blue-600', checkBg: 'bg-blue-500', checkHover: 'hover:border-blue-500 hover:bg-blue-50' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', accent: 'text-purple-600', checkBg: 'bg-purple-500', checkHover: 'hover:border-purple-500 hover:bg-purple-50' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', accent: 'text-green-600', checkBg: 'bg-green-500', checkHover: 'hover:border-green-500 hover:bg-green-50' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', accent: 'text-amber-600', checkBg: 'bg-amber-500', checkHover: 'hover:border-amber-500 hover:bg-amber-50' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', accent: 'text-rose-600', checkBg: 'bg-rose-500', checkHover: 'hover:border-rose-500 hover:bg-rose-50' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-900', accent: 'text-cyan-600', checkBg: 'bg-cyan-500', checkHover: 'hover:border-cyan-500 hover:bg-cyan-50' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', accent: 'text-orange-600', checkBg: 'bg-orange-500', checkHover: 'hover:border-orange-500 hover:bg-orange-50' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-900', accent: 'text-teal-600', checkBg: 'bg-teal-500', checkHover: 'hover:border-teal-500 hover:bg-teal-50' },
}

// Get consistent color for a peptide name
function getPeptideColor(peptideName: string): string {
  let hash = 0
  for (let i = 0; i < peptideName.length; i++) {
    hash = peptideName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

interface TodayResponse {
  date: string
  items: TodayDoseItem[]
  summary: {
    total: number
    completed: number
    pending: number
    skipped: number
  }
}

export default function TodayPage() {
  const { currentUserId } = useAppStore()
  const [data, setData] = useState<TodayResponse | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [isLoading, setIsLoading] = useState(true)

  const fetchToday = useCallback(async () => {
    if (!currentUserId) return

    try {
      setIsLoading(true)
      const dateParam = format(selectedDate, 'yyyy-MM-dd')
      const res = await fetch(`/api/today?userId=${currentUserId}&date=${dateParam}`)
      if (res.ok) {
        const result = await res.json()
        setData(result)
      }
    } catch (error) {
      console.error('Error fetching today:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId, selectedDate])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  async function handleStatusChange(
    item: TodayDoseItem,
    status: 'completed' | 'skipped' | 'pending'
  ) {
    if (!currentUserId || !data) return

    // Optimistic update - update UI immediately
    setData({
      ...data,
      items: data.items.map((i) =>
        i.protocolId === item.protocolId ? { ...i, status } : i
      ),
      summary: {
        ...data.summary,
        completed: data.items.filter((i) =>
          i.protocolId === item.protocolId ? status === 'completed' : i.status === 'completed'
        ).length,
        pending: data.items.filter((i) =>
          i.protocolId === item.protocolId ? status === 'pending' : i.status === 'pending'
        ).length,
        skipped: data.items.filter((i) =>
          i.protocolId === item.protocolId ? status === 'skipped' : i.status === 'skipped'
        ).length,
      },
    })

    // Send to server in background
    const dateStr = format(selectedDate, 'yyyy-MM-dd') + 'T12:00:00.000Z'
    fetch('/api/doses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        protocolId: item.protocolId,
        scheduledDate: dateStr,
        status,
      }),
    }).catch((error) => {
      console.error('Error updating dose:', error)
      // Revert on error
      fetchToday()
    })
  }

  async function handleMarkAllDone() {
    if (!currentUserId || !data) return

    const pendingItems = data.items.filter((item) => item.status === 'pending')
    if (pendingItems.length === 0) return

    try {
      // Mark all pending items as completed in parallel
      await Promise.all(
        pendingItems.map((item) =>
          fetch('/api/doses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUserId,
              protocolId: item.protocolId,
              scheduledDate: selectedDate.toISOString(),
              status: 'completed',
            }),
          })
        )
      )

      // Refresh data
      fetchToday()
    } catch (error) {
      console.error('Error marking all done:', error)
    }
  }

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  const pendingCount = data?.summary.pending || 0

  return (
    <div>
      {/* Alerts Banner */}
      <AlertsBanner />

      <div className="p-4 pb-20">
      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedDate((d) => new Date(d.getTime() - 86400000))}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <div className="text-sm text-slate-500">
            {isToday ? 'Today' : format(selectedDate, 'EEEE')}
          </div>
          <div className="font-semibold text-slate-900">
            {format(selectedDate, 'MMMM d, yyyy')}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedDate((d) => new Date(d.getTime() + 86400000))}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Summary */}
      {data && data.summary.total > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-lg p-3 text-center border border-slate-100">
            <div className="text-2xl font-bold text-slate-900">
              {data.summary.total}
            </div>
            <div className="text-xs text-slate-500">Total</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
            <div className="text-2xl font-bold text-green-700">
              {data.summary.completed}
            </div>
            <div className="text-xs text-green-600">Done</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
            <div className="text-2xl font-bold text-slate-700">
              {data.summary.pending}
            </div>
            <div className="text-xs text-slate-500">Pending</div>
          </div>
        </div>
      )}

      {/* Mark All Done Button */}
      {isToday && pendingCount > 1 && (
        <Button
          onClick={handleMarkAllDone}
          className="w-full mb-4 bg-green-600 hover:bg-green-700"
        >
          <CheckCheck className="w-4 h-4 mr-2" />
          Mark All Done ({pendingCount})
        </Button>
      )}

      {/* Checklist */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500">Loading...</div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((item) => {
            const color = getPeptideColor(item.peptideName)
            const styles = colorStyles[color]

            return (
              <Card
                key={item.id}
                className={cn(
                  'transition-all border',
                  item.status === 'completed'
                    ? 'opacity-60 bg-slate-50 border-slate-200'
                    : item.vialExpired
                      ? 'border-amber-300 bg-amber-50/50'
                      : `${styles.bg} ${styles.border}`
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          'font-medium',
                          item.status === 'completed' ? 'text-slate-500' : styles.text
                        )}>
                          {item.peptideName}
                        </span>
                        {item.vialExpired && (
                          <Badge variant="warning" className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Expired
                          </Badge>
                        )}
                      </div>
                      <div className={cn(
                        'flex items-center gap-2 text-sm',
                        item.status === 'completed' ? 'text-slate-400' : styles.accent
                      )}>
                        <span className="font-medium">
                          {item.doseAmount} {item.doseUnit}
                        </span>
                        {item.timing && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {item.timing}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(item, 'skipped')}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-5 h-5" />
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item, 'completed')}
                            className={cn(
                              'w-10 h-10 rounded-full border-2 border-slate-300 bg-white flex items-center justify-center transition-colors active:scale-95',
                              styles.checkHover
                            )}
                          >
                            <Check className="w-5 h-5 text-slate-400" />
                          </button>
                        </>
                      ) : item.status === 'completed' ? (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(item, 'pending')}
                          className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center transition-colors active:scale-95',
                            styles.checkBg,
                            'hover:opacity-80'
                          )}
                        >
                          <Check className="w-5 h-5 text-white" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(item, 'pending')}
                          className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 text-sm transition-colors active:scale-95"
                        >
                          Skipped
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-slate-400 mb-2">No doses scheduled</div>
            <div className="text-sm text-slate-500">
              {isToday
                ? 'Add a protocol to get started'
                : 'No doses were scheduled for this day'}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
