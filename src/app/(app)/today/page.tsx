'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import confetti from 'canvas-confetti'
import {
  Check,
  CheckCheck,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  Syringe,
  Pill,
} from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { DoseCardSkeleton } from '@/components/ui/skeleton'
import { SyringeVisual } from '@/components/syringe-visual'
import { AlertsBanner } from '@/components/alerts-banner'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { SwipeableCard } from '@/components/swipeable-card'
import { HeroCard } from '@/components/hero-card'
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
        className="w-11 h-11 rounded-full bg-[var(--success)] flex items-center justify-center shadow-lg"
        style={{
          animation: justCompleted ? 'checkPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : undefined,
          boxShadow: justCompleted ? 'var(--glow-success)' : undefined,
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
      className="w-11 h-11 rounded-full border-2 border-[var(--border)] bg-[var(--card)] hover:border-[var(--success)] hover:bg-[var(--success-muted)] flex items-center justify-center transition-all active:scale-95"
    >
      <Check className="w-5 h-5 text-[var(--muted-foreground)]" />
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

// Trigger confetti celebration
function triggerConfetti() {
  const colors = ['#22c55e', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']

  confetti({
    particleCount: 60,
    spread: 70,
    origin: { y: 0.6 },
    colors,
  })

  setTimeout(() => {
    confetti({
      particleCount: 30,
      angle: 60,
      spread: 50,
      origin: { x: 0.1, y: 0.7 },
      colors,
    })
    confetti({
      particleCount: 30,
      angle: 120,
      spread: 50,
      origin: { x: 0.9, y: 0.7 },
      colors,
    })
  }, 150)
}

export default function TodayPage() {
  const { currentUserId, currentUser } = useAppStore()
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [selectedDose, setSelectedDose] = useState<TodayDoseItem | null>(null)
  const prevCompletedRef = useRef<number | null>(null)
  const hasTriggeredConfetti = useRef(false)

  const dateParam = format(selectedDate, 'yyyy-MM-dd')

  const { data, isLoading, refetch } = useQuery<TodayResponse>({
    queryKey: ['today', currentUserId, dateParam],
    queryFn: async () => {
      const res = await fetch(`/api/today?userId=${currentUserId}&date=${dateParam}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  // Trigger confetti when all doses are completed
  useEffect(() => {
    if (!data || data.summary.total === 0) {
      hasTriggeredConfetti.current = false
      prevCompletedRef.current = null
      return
    }

    const allCompleted = data.summary.completed === data.summary.total
    const wasNotAllCompleted = prevCompletedRef.current !== null && prevCompletedRef.current < data.summary.total

    if (allCompleted && wasNotAllCompleted && !hasTriggeredConfetti.current) {
      hasTriggeredConfetti.current = true
      triggerConfetti()
    }

    if (!allCompleted) {
      hasTriggeredConfetti.current = false
    }

    prevCompletedRef.current = data.summary.completed
  }, [data])

  useEffect(() => {
    hasTriggeredConfetti.current = false
    prevCompletedRef.current = null
  }, [dateParam])

  async function handleStatusChange(
    item: TodayDoseItem,
    status: 'completed' | 'skipped' | 'pending'
  ) {
    if (!currentUserId || !data) return

    // Use item.id for tracking since same protocol can have multiple timings
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

    // Match by item.id to handle multi-timing protocols correctly
    queryClient.setQueryData<TodayResponse>(['today', currentUserId, dateParam], (old) => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map((i) =>
          i.id === item.id ? { ...i, status } : i
        ),
        summary: {
          ...old.summary,
          completed: old.items.filter((i) =>
            i.id === item.id ? status === 'completed' : i.status === 'completed'
          ).length,
          pending: old.items.filter((i) =>
            i.id === item.id ? status === 'pending' : i.status === 'pending'
          ).length,
          skipped: old.items.filter((i) =>
            i.id === item.id ? status === 'skipped' : i.status === 'skipped'
          ).length,
        },
      }
    })

    const dateStr = format(selectedDate, 'yyyy-MM-dd') + 'T12:00:00.000Z'
    fetch('/api/doses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        protocolId: item.protocolId,
        scheduledDate: dateStr,
        status,
        timing: item.timing,
      }),
    }).catch((error) => {
      console.error('Error updating dose:', error)
      refetch()
    })
  }

  async function handleMarkAllDone() {
    if (!currentUserId || !data) return

    const pendingItems = data.items.filter((item) => item.status === 'pending')
    if (pendingItems.length === 0) return

    queryClient.setQueryData<TodayResponse>(['today', currentUserId, dateParam], (old) => {
      if (!old) return old
      return {
        ...old,
        items: old.items.map((i) =>
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
        pendingItems.map((item) =>
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
  const hasExpiredVials = data?.items.some(item => item.vialExpired) || false

  return (
    <div>
      <AlertsBanner />

      <PullToRefresh onRefresh={handleRefresh} className="h-full">
        <div className="p-4 pb-20">
          {/* Date Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate((d) => new Date(d.getTime() - 86400000))}
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
              <div className="font-semibold text-[var(--foreground)]">
                {format(selectedDate, 'MMMM d, yyyy')}
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate((d) => new Date(d.getTime() + 86400000))}
              className="w-10 h-10 p-0"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Hero Card */}
          {isLoading ? (
            <div className="h-[140px] rounded-2xl bg-[var(--muted)] animate-pulse mb-6" />
          ) : data ? (
            <div className="mb-6 animate-card-in">
              <HeroCard
                completed={data.summary.completed}
                total={data.summary.total}
                pending={data.summary.pending}
                nextDose={nextPendingDose ? {
                  name: nextPendingDose.peptideName,
                  time: nextPendingDose.timing ?? undefined,
                } : undefined}
                hasExpiredVials={hasExpiredVials}
                userName={currentUser?.name}
              />
            </div>
          ) : null}

          {/* Mark All Done Button */}
          {pendingCount > 1 && (
            <Button
              onClick={handleMarkAllDone}
              variant="success"
              className="w-full mb-4"
            >
              <CheckCheck className="w-4 h-4 mr-2" />
              Complete All ({pendingCount})
            </Button>
          )}

          {/* Section Header */}
          {data && data.items.length > 0 && pendingCount > 0 && (
            <div className="flex items-center justify-end mb-3">
              <span className="text-xs text-[var(--muted-foreground)]">
                Swipe to complete or skip
              </span>
            </div>
          )}

          {/* Dose List */}
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
              {data.items.map((item, index) => {
                const itemType = item.itemType || 'peptide'
                const isSupplement = itemType === 'supplement'
                const isFirstOfType = index === 0 || (data.items[index - 1].itemType || 'peptide') !== itemType

                return (
                  <div key={item.id}>
                    {/* Section header when type changes */}
                    {isFirstOfType && (
                      <div className="flex items-center gap-2 mb-2 pt-2">
                        {isSupplement ? (
                          <Pill className="w-4 h-4 text-[var(--success)]" />
                        ) : (
                          <Syringe className="w-4 h-4 text-[var(--accent)]" />
                        )}
                        <h3 className="text-label">{isSupplement ? 'Supplements' : 'Peptides'}</h3>
                      </div>
                    )}
                    <div className={cn('animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                      <SwipeableCard
                        onSwipeRight={
                          item.status === 'pending'
                            ? () => handleStatusChange(item, 'completed')
                            : undefined
                        }
                        onSwipeLeft={
                          item.status === 'pending'
                            ? () => handleStatusChange(item, 'skipped')
                            : undefined
                        }
                        disabled={item.status !== 'pending'}
                      >
                        <Card
                          interactive
                          className={cn(
                            'transition-all',
                            item.status === 'completed' && 'opacity-60',
                            item.vialExpired && 'border-l-4 border-l-[var(--warning)]'
                          )}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              {/* Status indicator */}
                              <div
                                className={cn(
                                  'w-1 h-12 rounded-full',
                                  item.status === 'completed' && 'bg-[var(--success)]',
                                  item.status === 'pending' && (isSupplement ? 'bg-[var(--success)]' : 'bg-[var(--accent)]'),
                                  item.status === 'skipped' && 'bg-[var(--muted)]'
                                )}
                              />

                              {/* Content */}
                              <button
                                type="button"
                                onClick={() => setSelectedDose(item)}
                                className="flex-1 min-w-0 text-left"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-[var(--foreground)]">
                                    {item.peptideName}
                                  </span>
                                  {item.penUnits && (
                                    <Badge variant="accent">
                                      {item.penUnits}u
                                    </Badge>
                                  )}
                                  {item.vialExpired && (
                                    <Badge variant="warning" className="flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      Expired
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                                  {isSupplement ? (
                                    <Pill className="w-3.5 h-3.5" />
                                  ) : (
                                    <Syringe className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {isSupplement && item.servingSize
                                      ? `${item.servingSize} ${item.servingUnit || 'serving'}${item.servingSize > 1 ? 's' : ''}`
                                      : `${item.doseAmount} ${item.doseUnit}`}
                                  </span>
                                  {item.timing && (
                                    <>
                                      <span className="text-[var(--border)]">•</span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {item.timing}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>

                              {/* Action buttons */}
                              <div className="flex items-center gap-2">
                                {item.status === 'pending' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleStatusChange(item, 'skipped')}
                                      className="w-9 h-9 p-0"
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
                                    justCompleted={justCompleted.has(item.id)}
                                    onComplete={() => handleStatusChange(item, 'completed')}
                                    onUndo={() => handleStatusChange(item, 'pending')}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(item, 'pending')}
                                    className="px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--muted-foreground)] text-sm font-medium transition-colors active:scale-95"
                                  >
                                    Skipped
                                  </button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </SwipeableCard>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Card className="mt-4">
              <CardContent className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-4">
                  <Syringe className="w-8 h-8 text-[var(--muted-foreground)]" />
                </div>
                <div className="text-[var(--foreground)] font-medium mb-1">No doses scheduled</div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  {isToday
                    ? 'Add a protocol to get started'
                    : 'No doses were scheduled for this day'}
                </div>
              </CardContent>
            </Card>
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
            {/* Pen Units - Primary Info */}
            {selectedDose.penUnits ? (
              <div className="text-center py-6 bg-[var(--accent-muted)] rounded-2xl">
                <div className="text-hero text-[var(--accent)]">
                  {selectedDose.penUnits}
                </div>
                <div className="text-[var(--accent)] mt-1 font-medium">
                  units to draw
                </div>
              </div>
            ) : (
              <div className="text-center py-6 bg-[var(--muted)] rounded-2xl">
                <div className="text-[var(--muted-foreground)]">
                  Add reconstitution info to see pen units
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
