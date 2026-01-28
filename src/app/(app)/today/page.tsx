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
    status: 'completed' | 'skipped'
  ) {
    if (!currentUserId) return

    try {
      await fetch('/api/doses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          protocolId: item.protocolId,
          scheduledDate: selectedDate.toISOString(),
          status,
        }),
      })

      // Refresh data
      fetchToday()
    } catch (error) {
      console.error('Error updating dose:', error)
    }
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

      <div className="p-4">
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
          {data.items.map((item) => (
            <Card
              key={item.id}
              className={cn(
                'transition-all',
                item.status === 'completed' && 'opacity-60',
                item.vialExpired && 'border-amber-300 bg-amber-50/50'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900">
                        {item.peptideName}
                      </span>
                      {item.vialExpired && (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Expired
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>
                        {item.doseAmount} {item.doseUnit}
                      </span>
                      {item.timing && (
                        <>
                          <span className="text-slate-300">•</span>
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
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(item, 'completed')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="w-5 h-5" />
                        </Button>
                      </>
                    ) : item.status === 'completed' ? (
                      <Badge variant="success">Done</Badge>
                    ) : (
                      <Badge variant="default">Skipped</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
