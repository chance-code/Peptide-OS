'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { SyringeVisual } from '@/components/syringe-visual'
import { DailySummary } from '@/components/today/daily-summary'
import { NextUp } from '@/components/today/next-up'
import { DosePlan } from '@/components/today/dose-plan'
import { Exceptions } from '@/components/today/exceptions'
import { TodayMeaningCard, computeMeaning, type DailyStatusResponse } from '@/components/today/meaning-card'
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

// Warm glow celebration (restrained, like a nod from a mentor)
function triggerCelebration(containerRef: React.RefObject<HTMLDivElement | null>) {
  if (!containerRef.current) return
  const el = document.createElement('div')
  el.className = 'animate-celebration'
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 100; pointer-events: none;
    background: radial-gradient(circle at 50% 50%, rgba(212, 165, 116, 0.25), transparent 70%);
  `
  containerRef.current.appendChild(el)
  setTimeout(() => el.remove(), 1600)
}

export default function TodayPage() {
  const { currentUserId } = useAppStore()
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [selectedDose, setSelectedDose] = useState<TodayDoseItem | null>(null)
  const prevCompletedRef = useRef<number | null>(null)
  const hasTriggeredCelebration = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const dateParam = format(selectedDate, 'yyyy-MM-dd')

  const { data, isLoading, isError, refetch } = useQuery<TodayResponse>({
    queryKey: ['today', currentUserId, dateParam],
    queryFn: async () => {
      const res = await fetch(`/api/today?userId=${currentUserId}&date=${dateParam}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 30,
  })

  // Health body-state (silent fetch — card only renders when data arrives)
  const { data: healthMeaning } = useQuery({
    queryKey: ['health-daily-status'],
    queryFn: async () => {
      const res = await fetch('/api/health/daily-status')
      if (!res.ok) return null
      const json: DailyStatusResponse = await res.json()
      return computeMeaning(json)
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  // Trigger celebration when all doses completed
  useEffect(() => {
    if (!data || data.summary.total === 0) {
      hasTriggeredCelebration.current = false
      prevCompletedRef.current = null
      return
    }

    const allCompleted = data.summary.completed === data.summary.total
    const wasNotAllCompleted =
      prevCompletedRef.current !== null && prevCompletedRef.current < data.summary.total

    if (allCompleted && wasNotAllCompleted && !hasTriggeredCelebration.current) {
      hasTriggeredCelebration.current = true
      triggerCelebration(containerRef)
    }

    if (!allCompleted) {
      hasTriggeredCelebration.current = false
    }

    prevCompletedRef.current = data.summary.completed
  }, [data])

  useEffect(() => {
    hasTriggeredCelebration.current = false
    prevCompletedRef.current = null
  }, [dateParam])

  async function handleStatusChange(
    item: TodayDoseItem,
    status: 'completed' | 'skipped' | 'pending'
  ) {
    if (!currentUserId || !data) return

    if (status === 'completed') {
      setJustCompleted(prev => new Set(prev).add(item.id))
      setTimeout(() => {
        setJustCompleted(prev => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }, 600)
    }

    // Optimistic update
    queryClient.setQueryData<TodayResponse>(['today', currentUserId, dateParam], old => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map(i => (i.id === item.id ? { ...i, status } : i)),
        summary: {
          ...old.summary,
          completed: old.items.filter(i =>
            i.id === item.id ? status === 'completed' : i.status === 'completed'
          ).length,
          pending: old.items.filter(i =>
            i.id === item.id ? status === 'pending' : i.status === 'pending'
          ).length,
          skipped: old.items.filter(i =>
            i.id === item.id ? status === 'skipped' : i.status === 'skipped'
          ).length,
        },
      }
    })

    const dateStr = format(selectedDate, 'yyyy-MM-dd') + 'T12:00:00.000Z'
    try {
      const res = await fetch('/api/doses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          protocolId: item.protocolId,
          scheduledDate: dateStr,
          status,
          timing: item.timing,
        }),
      })
      if (!res.ok) {
        console.error('Failed to save dose:', await res.text())
        refetch()
      }
    } catch (error) {
      console.error('Error updating dose:', error)
      refetch()
    }
  }

  async function handleMarkAllDone() {
    if (!currentUserId || !data) return

    const pendingItems = data.items.filter(item => item.status === 'pending')
    if (pendingItems.length === 0) return

    queryClient.setQueryData<TodayResponse>(['today', currentUserId, dateParam], old => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map(i =>
          i.status === 'pending' ? { ...i, status: 'completed' as const } : i
        ),
        summary: {
          ...old.summary,
          completed: old.summary.total - old.summary.skipped,
          pending: 0,
        },
      }
    })

    try {
      await Promise.all(
        pendingItems.map(item =>
          fetch('/api/doses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUserId,
              protocolId: item.protocolId,
              scheduledDate: selectedDate.toISOString(),
              status: 'completed',
              timing: item.timing,
            }),
          })
        )
      )
    } catch (error) {
      console.error('Error marking all done:', error)
      refetch()
    }
  }

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  const pendingCount = data?.summary.pending || 0
  const nextPendingDose = data?.items.find(item => item.status === 'pending')

  return (
    <div ref={containerRef}>
      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        <div className="px-5 pt-4 pb-24 space-y-6">
          {/* 1. Date Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))}
              className="w-10 h-10 p-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="text-center hover:opacity-70 transition-opacity"
            >
              <div className="text-label">
                {isToday ? 'Today' : format(selectedDate, 'EEEE')}
              </div>
              <div className="text-display text-[var(--foreground)]">
                {format(selectedDate, 'MMMM d')}
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))}
              className="w-10 h-10 p-0"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Error State */}
          {isError && !data && (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertTriangle className="w-8 h-8 text-[var(--warning)] mx-auto mb-3" />
                <div className="text-[var(--foreground)] font-medium mb-1">
                  Couldn&apos;t load doses
                </div>
                <div className="text-sm text-[var(--muted-foreground)] mb-4">
                  Pull down to refresh or tap below to retry.
                </div>
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 w-48 bg-[var(--muted)] rounded" />
              <div className="h-20 bg-[var(--muted)] rounded-xl" />
              <div className="space-y-2">
                <div className="h-4 w-16 bg-[var(--muted)] rounded" />
                <div className="h-10 bg-[var(--muted)] rounded-lg" />
                <div className="h-10 bg-[var(--muted)] rounded-lg" />
              </div>
            </div>
          )}

          {/* Content — 5 sections in order */}
          {data && (
            <>
              {/* 2. Daily Summary */}
              <div>
                <DailySummary items={data.items} summary={data.summary} />
                {pendingCount > 1 && (
                  <button
                    type="button"
                    onClick={handleMarkAllDone}
                    className="text-sm text-[var(--accent)] hover:underline mt-1"
                  >
                    Complete all {pendingCount}
                  </button>
                )}
              </div>

              {/* Health meaning (conditional — only when data available) */}
              {healthMeaning && <TodayMeaningCard meaning={healthMeaning} />}

              {/* 3. Next Up (conditional) */}
              {nextPendingDose && (
                <NextUp
                  item={nextPendingDose}
                  onComplete={() => handleStatusChange(nextPendingDose, 'completed')}
                  onSkip={() => handleStatusChange(nextPendingDose, 'skipped')}
                  onTap={() => setSelectedDose(nextPendingDose)}
                />
              )}

              {/* 4. Plan */}
              <DosePlan
                items={data.items}
                nextUpId={nextPendingDose?.id}
                onComplete={item => handleStatusChange(item, 'completed')}
                onSkip={item => handleStatusChange(item, 'skipped')}
                onUndo={item => handleStatusChange(item, 'pending')}
                onTap={item => setSelectedDose(item)}
                justCompleted={justCompleted}
              />

              {/* 5. Exceptions (conditional) */}
              <Exceptions items={data.items} />
            </>
          )}
        </div>
      </PullToRefresh>

      {/* Dose Detail Bottom Sheet */}
      <BottomSheet
        isOpen={!!selectedDose}
        onClose={() => setSelectedDose(null)}
        title={selectedDose?.peptideName || ''}
      >
        {selectedDose && (
          <div className="space-y-4">
            {/* Pen Units */}
            {selectedDose.penUnits != null && (
              <div className="text-center py-4 bg-[var(--accent-muted)] rounded-xl">
                <div className="text-3xl font-bold text-[var(--accent)]">
                  {selectedDose.penUnits}
                </div>
                <div className="text-sm text-[var(--accent)] mt-0.5">units to draw</div>
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
              <div className="bg-[var(--muted)] rounded-xl p-4">
                <div className="text-label mb-1">Dose</div>
                <div className="font-semibold text-[var(--foreground)]">
                  {selectedDose.doseAmount} {selectedDose.doseUnit}
                </div>
              </div>
              {selectedDose.concentration && (
                <div className="bg-[var(--muted)] rounded-xl p-4">
                  <div className="text-label mb-1">Concentration</div>
                  <div className="font-semibold text-[var(--foreground)]">
                    {selectedDose.concentration}
                  </div>
                </div>
              )}
            </div>

            {selectedDose.timing && (
              <div className="bg-[var(--muted)] rounded-xl p-4">
                <div className="text-label mb-1">Timing</div>
                <div className="font-semibold text-[var(--foreground)] flex items-center gap-2">
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
                    variant="success"
                    className="flex-1"
                    onClick={() => {
                      handleStatusChange(selectedDose, 'completed')
                      setSelectedDose(null)
                    }}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Complete
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
                  Undo Completion
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
