'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { DoseCardSkeleton, SummarySkeleton } from '@/components/ui/skeleton'
import { SyringeVisual } from '@/components/syringe-visual'
import { AlertsBanner } from '@/components/alerts-banner'
import { cn } from '@/lib/utils'
import type { TodayDoseItem } from '@/types'

// Animated checkmark button component
function AnimatedCheckButton({
  isCompleted,
  justCompleted,
  onComplete,
  onUndo
}: {
  isCompleted: boolean
  justCompleted: boolean
  onComplete: () => void
  onUndo: () => void
}) {
  if (isCompleted) {
    return (
      <button
        type="button"
        onClick={onUndo}
        className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center"
        style={{
          animation: justCompleted ? 'checkPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : undefined
        }}
      >
        <Check
          className="w-5 h-5 text-white"
          style={{
            animation: justCompleted ? 'checkDraw 0.4s ease-out 0.1s both' : undefined
          }}
        />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onComplete}
      className="w-10 h-10 rounded-full border-2 border-slate-300 bg-white hover:border-green-500 hover:bg-green-50 flex items-center justify-center transition-colors active:scale-95"
    >
      <Check className="w-5 h-5 text-slate-400" />
    </button>
  )
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
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [selectedDose, setSelectedDose] = useState<TodayDoseItem | null>(null)

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

    // Track animation for newly completed items
    if (status === 'completed') {
      setJustCompleted(prev => new Set(prev).add(item.protocolId))
      // Clear after animation
      setTimeout(() => {
        setJustCompleted(prev => {
          const next = new Set(prev)
          next.delete(item.protocolId)
          return next
        })
      }, 600)
    }

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
      {isLoading ? (
        <SummarySkeleton />
      ) : data && data.summary.total > 0 ? (
        <div className="grid grid-cols-3 gap-3 mb-6 animate-card-in">
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
      ) : null}

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
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`animate-card-in stagger-${i}`}>
              <DoseCardSkeleton />
            </div>
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((item, index) => (
            <Card
              key={item.id}
              className={cn(
                'transition-all animate-card-in',
                `stagger-${Math.min(index + 1, 10)}`,
                item.status === 'completed' && 'opacity-60',
                item.vialExpired && 'border-amber-300 bg-amber-50/50'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDose(item)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900">
                        {item.peptideName}
                      </span>
                      {item.penUnits && (
                        <Badge className="bg-blue-100 text-blue-800 font-semibold">
                          {item.penUnits} units
                        </Badge>
                      )}
                      {item.vialExpired && (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Expired
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
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
                  </button>

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
                        <AnimatedCheckButton
                          isCompleted={false}
                          justCompleted={false}
                          onComplete={() => handleStatusChange(item, 'completed')}
                          onUndo={() => handleStatusChange(item, 'pending')}
                        />
                      </>
                    ) : item.status === 'completed' ? (
                      <AnimatedCheckButton
                        isCompleted={true}
                        justCompleted={justCompleted.has(item.protocolId)}
                        onComplete={() => handleStatusChange(item, 'completed')}
                        onUndo={() => handleStatusChange(item, 'pending')}
                      />
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

      {/* Dose Detail Bottom Sheet */}
      <BottomSheet
        isOpen={!!selectedDose}
        onClose={() => setSelectedDose(null)}
        title={selectedDose?.peptideName || ''}
      >
        {selectedDose && (
          <div className="space-y-4">
            {/* Pen Units - Primary Info */}
            {selectedDose.penUnits ? (
              <div className="text-center py-4 bg-blue-50 rounded-xl">
                <div className="text-4xl font-bold text-blue-800">
                  {selectedDose.penUnits} units
                </div>
                <div className="text-blue-600 mt-1">
                  Draw to this line
                </div>
              </div>
            ) : (
              <div className="text-center py-4 bg-slate-50 rounded-xl">
                <div className="text-slate-500">
                  Add reconstitution info to your protocol to see pen units
                </div>
              </div>
            )}

            {/* Syringe Visual */}
            {selectedDose.penUnits && selectedDose.concentration && (
              <SyringeVisual
                units={selectedDose.penUnits}
                dose={`${selectedDose.doseAmount}${selectedDose.doseUnit}`}
                concentration={selectedDose.concentration}
              />
            )}

            {/* Dose Details */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Dose</div>
                <div className="font-semibold text-slate-900">
                  {selectedDose.doseAmount} {selectedDose.doseUnit}
                </div>
              </div>
              {selectedDose.concentration && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Concentration</div>
                  <div className="font-semibold text-slate-900">
                    {selectedDose.concentration}
                  </div>
                </div>
              )}
            </div>

            {selectedDose.timing && (
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Timing</div>
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {selectedDose.timing}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {selectedDose.status === 'pending' ? (
                <>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      handleStatusChange(selectedDose, 'skipped')
                      setSelectedDose(null)
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Skip
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      handleStatusChange(selectedDose, 'completed')
                      setSelectedDose(null)
                    }}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Mark Done
                  </Button>
                </>
              ) : selectedDose.status === 'completed' ? (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    handleStatusChange(selectedDose, 'pending')
                    setSelectedDose(null)
                  }}
                >
                  Undo
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    handleStatusChange(selectedDose, 'pending')
                    setSelectedDose(null)
                  }}
                >
                  Unskip
                </Button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
