'use client'

import { useEffect, useState, useCallback } from 'react'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { CheckCircle, XCircle, MinusCircle, TrendingUp } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DoseLog, Protocol, Peptide } from '@/types'

interface DoseLogWithProtocol extends DoseLog {
  protocol: Protocol & { peptide: Peptide }
}

export default function HistoryPage() {
  const { currentUserId } = useAppStore()
  const [logs, setLogs] = useState<DoseLogWithProtocol[]>([])
  const [dateRange, setDateRange] = useState<'7' | '14' | '30'>('7')
  const [isLoading, setIsLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    if (!currentUserId) return

    try {
      setIsLoading(true)
      const days = parseInt(dateRange)
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd')
      const endDate = format(new Date(), 'yyyy-MM-dd')

      const res = await fetch(
        `/api/doses?userId=${currentUserId}&startDate=${startDate}&endDate=${endDate}`
      )
      if (res.ok) {
        const data = await res.json()
        setLogs(data)
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId, dateRange])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Group logs by date
  const logsByDate = logs.reduce((acc, log) => {
    const date = format(new Date(log.scheduledDate), 'yyyy-MM-dd')
    if (!acc[date]) acc[date] = []
    acc[date].push(log)
    return acc
  }, {} as Record<string, DoseLogWithProtocol[]>)

  // Calculate stats
  const stats = {
    total: logs.length,
    completed: logs.filter((l) => l.status === 'completed').length,
    skipped: logs.filter((l) => l.status === 'skipped').length,
    missed: logs.filter((l) => l.status === 'missed').length,
  }
  const adherenceRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 100

  // Get sorted dates (most recent first)
  const sortedDates = Object.keys(logsByDate).sort((a, b) => b.localeCompare(a))

  return (
    <div className="p-4 pb-20">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">History</h2>

      {/* Date Range Selector */}
      <div className="flex gap-2 mb-4">
        {(['7', '14', '30'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={cn(
              'px-4 py-2.5 rounded-full text-sm font-medium transition-colors',
              dateRange === range
                ? 'bg-[var(--foreground)] text-[var(--background)]'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
            )}
          >
            {range} days
          </button>
        ))}
      </div>

      {/* Stats */}
      {!isLoading && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <span className="font-medium text-[var(--foreground)]">Adherence Rate</span>
              </div>
              <span className="text-2xl font-bold text-emerald-500">{adherenceRate}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold text-[var(--foreground)]">{stats.total}</div>
                <div className="text-xs text-[var(--muted-foreground)]">Total</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-emerald-500">{stats.completed}</div>
                <div className="text-xs text-[var(--muted-foreground)]">Done</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[var(--muted-foreground)]">{stats.skipped}</div>
                <div className="text-xs text-[var(--muted-foreground)]">Skipped</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-500">{stats.missed}</div>
                <div className="text-xs text-[var(--muted-foreground)]">Missed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History List */}
      {isLoading ? (
        <div className="text-center py-8 text-[var(--muted-foreground)]">Loading...</div>
      ) : sortedDates.length > 0 ? (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dayLogs = logsByDate[date]
            const isToday = date === format(new Date(), 'yyyy-MM-dd')

            return (
              <div key={date}>
                <div className="text-sm font-medium text-[var(--muted-foreground)] mb-2">
                  {isToday ? 'Today' : format(new Date(date), 'EEEE, MMMM d')}
                </div>
                <Card>
                  <CardContent className="p-0 divide-y divide-[var(--border)]">
                    {dayLogs.map((log) => (
                      <div key={log.id} className="p-3 flex items-center gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            log.status === 'completed' && 'bg-emerald-500/20',
                            log.status === 'skipped' && 'bg-slate-500/20',
                            log.status === 'missed' && 'bg-red-500/20',
                            log.status === 'pending' && 'bg-amber-500/20'
                          )}
                        >
                          {log.status === 'completed' && (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          )}
                          {log.status === 'skipped' && (
                            <MinusCircle className="w-4 h-4 text-[var(--muted-foreground)]" />
                          )}
                          {log.status === 'missed' && (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          {log.status === 'pending' && (
                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--foreground)]">
                            {log.protocol.peptide.name}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {log.actualDose || log.protocol.doseAmount}{' '}
                            {log.actualUnit || log.protocol.doseUnit}
                          </div>
                        </div>
                        <Badge
                          variant={
                            log.status === 'completed'
                              ? 'success'
                              : log.status === 'skipped'
                              ? 'default'
                              : log.status === 'missed'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {log.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-[var(--muted-foreground)] mb-2">No history</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              Start tracking doses to see your history here
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
