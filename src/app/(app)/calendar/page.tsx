'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Check, X, CheckCheck, Flame, TrendingUp, CalendarOff } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { cn } from '@/lib/utils'
import type { Protocol, Peptide, DoseLog, DayOfWeek } from '@/types'

interface ProtocolWithPeptide extends Protocol {
  peptide: Peptide
}

interface DayData {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  protocols: {
    protocol: ProtocolWithPeptide
    timing: string | null
    status: 'pending' | 'completed' | 'skipped' | 'missed' | 'scheduled'
    penUnits?: number | null
  }[]
}

function calculatePenUnits(protocol: ProtocolWithPeptide): number | null {
  if (!protocol.vialAmount || !protocol.diluentVolume) return null
  const concentration = protocol.vialAmount / protocol.diluentVolume
  let doseInVialUnits = protocol.doseAmount
  if (protocol.doseUnit === 'mcg' && protocol.vialUnit === 'mg') {
    doseInVialUnits = protocol.doseAmount / 1000
  } else if (protocol.doseUnit === 'mg' && protocol.vialUnit === 'mcg') {
    doseInVialUnits = protocol.doseAmount * 1000
  }
  const volumeMl = doseInVialUnits / concentration
  return Math.round(volumeMl * 100)
}

const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
}

function isDoseDay(date: Date, frequency: string, startDate: Date, customDays?: string | null): boolean {
  const dayOfWeek = DAY_INDEX_MAP[getDay(date)]
  switch (frequency) {
    case 'daily': return true
    case 'weekly': return getDay(date) === getDay(startDate)
    case 'custom':
      if (!customDays) return false
      try {
        const days = JSON.parse(customDays) as DayOfWeek[]
        return days.includes(dayOfWeek)
      } catch { return false }
    default: return false
  }
}

// Animated score ring component
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = size * 0.08
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 100) * circumference

  const getColor = () => {
    if (score >= 85) return 'var(--success)'
    if (score >= 70) return 'var(--accent)'
    if (score >= 50) return 'var(--warning)'
    return 'var(--error)'
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
          style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', filter: `drop-shadow(0 0 8px ${getColor()})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-display-xl text-[var(--foreground)]">
          {score}
        </span>
        <span className="text-label">
          Score
        </span>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { currentUserId } = useAppStore()
  const queryClient = useQueryClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)

  const { data: protocols = [] } = useQuery<ProtocolWithPeptide[]>({
    queryKey: ['protocols'],
    queryFn: async () => {
      const res = await fetch('/api/protocols')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 1000 * 60 * 15, // 15 minutes - protocols don't change often
  })

  const { data: doseLogs = [], refetch: refetchLogs } = useQuery<DoseLog[]>({
    queryKey: ['doseLogs', currentUserId, format(monthStart, 'yyyy-MM'), format(monthEnd, 'yyyy-MM')],
    queryFn: async () => {
      const res = await fetch(
        `/api/doses?userId=${currentUserId}&startDate=${format(monthStart, 'yyyy-MM-dd')}&endDate=${format(monthEnd, 'yyyy-MM-dd')}`
      )
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const handleRefresh = useCallback(async () => {
    // Only refetch dose logs - protocols rarely change during refresh
    await refetchLogs()
  }, [refetchLogs])

  const calendarDays = useMemo(() => {
    const calendarStart = startOfWeek(monthStart)
    const calendarEnd = endOfWeek(monthEnd)
    const days: DayData[] = []
    let day = calendarStart

    while (day <= calendarEnd) {
      const currentDay = day
      const dayProtocols: DayData['protocols'] = []

      for (const protocol of protocols) {
        const protocolStart = new Date(protocol.startDate)
        const protocolEnd = protocol.endDate ? new Date(protocol.endDate) : null
        if (currentDay < protocolStart) continue
        if (protocolEnd && currentDay > protocolEnd) continue
        // Don't filter out completed protocols - we need their historical data for compliance stats
        if (!isDoseDay(currentDay, protocol.frequency, protocolStart, protocol.customDays)) continue

        // Get timings - either from timings array or single timing
        let timingsToProcess: (string | null)[] = [protocol.timing]
        if (protocol.timings) {
          try {
            const parsedTimings = JSON.parse(protocol.timings) as string[]
            if (parsedTimings.length > 0) {
              timingsToProcess = parsedTimings
            }
          } catch {
            // Fall back to single timing
          }
        }

        // Create one entry per timing
        for (const timing of timingsToProcess) {
          const log = doseLogs.find(
            (l) => l.protocolId === protocol.id &&
                   isSameDay(new Date(l.scheduledDate), currentDay) &&
                   (l.timing || null) === timing
          )

          let status: DayData['protocols'][0]['status'] = 'scheduled'
          if (log) {
            status = log.status as DayData['protocols'][0]['status']
          } else if (currentDay < new Date() && !isToday(currentDay)) {
            status = 'missed'
          } else if (isToday(currentDay)) {
            status = 'pending'
          }

          dayProtocols.push({ protocol, timing, status, penUnits: calculatePenUnits(protocol) })
        }
      }

      days.push({
        date: currentDay,
        isCurrentMonth: isSameMonth(currentDay, currentMonth),
        isToday: isToday(currentDay),
        protocols: dayProtocols,
      })

      day = addDays(day, 1)
    }

    return days
  }, [currentMonth, protocols, doseLogs, monthStart, monthEnd])

  const monthlyStats = useMemo(() => {
    const today = new Date()
    let totalDoses = 0
    let completedDoses = 0
    let currentStreak = 0
    let checkingStreak = true

    const daysToCount = calendarDays.filter(
      (d) => d.isCurrentMonth && d.date <= today && d.protocols.length > 0
    )

    const sortedDays = [...daysToCount].sort((a, b) => b.date.getTime() - a.date.getTime())

    for (const day of sortedDays) {
      const dayTotal = day.protocols.length
      const dayCompleted = day.protocols.filter((p) => p.status === 'completed').length
      totalDoses += dayTotal
      completedDoses += dayCompleted

      if (checkingStreak) {
        if (dayCompleted === dayTotal && dayTotal > 0) {
          currentStreak++
        } else if (dayCompleted < dayTotal) {
          checkingStreak = false
        }
      }
    }

    return {
      totalDoses,
      completedDoses,
      percentage: totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0,
      streak: currentStreak,
    }
  }, [calendarDays])

  const selectedDayData = selectedDay
    ? calendarDays.find((d) => isSameDay(d.date, selectedDay))
    : null

  async function handleStatusChange(protocolId: string, date: Date, status: 'completed' | 'skipped' | 'pending', timing: string | null) {
    if (!currentUserId) return

    queryClient.setQueryData<DoseLog[]>(
      ['doseLogs', currentUserId, format(monthStart, 'yyyy-MM'), format(monthEnd, 'yyyy-MM')],
      (prev = []) => {
        const existingIndex = prev.findIndex(
          l => l.protocolId === protocolId &&
               isSameDay(new Date(l.scheduledDate), date) &&
               (l.timing || null) === timing
        )
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], status }
          return updated
        } else {
          const newLog: DoseLog = {
            id: `temp-${Date.now()}`,
            protocolId,
            userId: currentUserId,
            scheduledDate: date,
            status,
            createdAt: new Date(),
            updatedAt: new Date(),
            notes: null,
            completedAt: status === 'completed' ? new Date() : null,
            actualDose: null,
            actualUnit: null,
            scheduleId: null,
            timing,
          }
          return [...prev, newLog]
        }
      }
    )

    const dateStr = format(date, 'yyyy-MM-dd') + 'T12:00:00.000Z'
    try {
      await fetch('/api/doses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, protocolId, scheduledDate: dateStr, status, timing }),
      })
    } catch (error) {
      console.error('Error updating dose:', error)
      refetchLogs()
    }
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="h-full">
      <div className="px-4 pb-24 pt-[env(safe-area-inset-top)]">
        {/* Header with month navigation */}
        <div className="flex items-center justify-between py-4">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-display text-[var(--foreground)]">
              {format(currentMonth, 'MMMM')}
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {format(currentMonth, 'yyyy')}
            </p>
          </div>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] active:scale-95 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Score Card - Oura style */}
        <div className="rounded-3xl bg-gradient-to-br from-[var(--card)] to-[var(--muted)] p-6 mb-6 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-[var(--muted-foreground)] mb-1">Monthly Compliance</p>
              <div className="flex items-baseline mb-3">
                <span className="text-display-xl text-[var(--foreground)]">
                  {monthlyStats.percentage}
                </span>
                <span className="text-display text-[var(--muted-foreground)] ml-0.5">%</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                  <span className="text-sm text-[var(--muted-foreground)]">
                    {monthlyStats.completedDoses}/{monthlyStats.totalDoses} doses
                  </span>
                </div>
                {monthlyStats.streak > 0 && (
                  <div className="flex items-center gap-1 text-[var(--accent)]">
                    <Flame className="w-4 h-4" />
                    <span className="text-sm font-medium">{monthlyStats.streak} day streak</span>
                  </div>
                )}
              </div>
            </div>
            <ScoreRing score={monthlyStats.percentage} size={100} />
          </div>
        </div>

        {/* Today button */}
        {!isSameMonth(currentMonth, new Date()) && (
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="w-full mb-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-muted)] rounded-xl transition-colors"
          >
            Go to Today
          </button>
        )}

        {/* Calendar Grid */}
        <div className="mb-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-3">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div
                key={i}
                className="text-center text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-widest"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((dayData) => {
              const hasProtocols = dayData.protocols.length > 0
              const completedCount = dayData.protocols.filter((p) => p.status === 'completed').length
              const completionRatio = hasProtocols ? completedCount / dayData.protocols.length : 0
              const allCompleted = hasProtocols && completedCount === dayData.protocols.length
              const hasMissed = dayData.protocols.some((p) => p.status === 'missed')
              const isFuture = dayData.date > new Date() && !dayData.isToday

              // Get background color based on completion
              const getBgStyle = () => {
                if (!dayData.isCurrentMonth) return {}
                if (!hasProtocols) return {}
                if (isFuture) return { backgroundColor: 'var(--muted)', opacity: 0.5 }
                if (allCompleted) return { backgroundColor: 'var(--success)', opacity: 0.15 + completionRatio * 0.25 }
                if (hasMissed) return { backgroundColor: 'var(--error)', opacity: 0.15 }
                if (completionRatio > 0) return { backgroundColor: 'var(--success)', opacity: 0.1 + completionRatio * 0.2 }
                return { backgroundColor: 'var(--warning)', opacity: 0.15 }
              }

              return (
                <button
                  key={dayData.date.toISOString()}
                  onClick={() => hasProtocols && setSelectedDay(dayData.date)}
                  disabled={!hasProtocols}
                  className={cn(
                    'relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all duration-200 overflow-hidden',
                    dayData.isCurrentMonth
                      ? 'text-[var(--foreground)]'
                      : 'text-[var(--muted-foreground)] opacity-50',
                    dayData.isToday && 'ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--background)]',
                    hasProtocols && !isFuture && 'hover:scale-105 active:scale-95 cursor-pointer',
                    !hasProtocols && 'cursor-default'
                  )}
                  style={getBgStyle()}
                >
                  <span className={cn(
                    'text-sm',
                    dayData.isToday ? 'font-bold' : 'font-semibold'
                  )}>
                    {format(dayData.date, 'd')}
                  </span>

                  {/* Completion indicator - limit to 4 dots max */}
                  {hasProtocols && dayData.isCurrentMonth && !isFuture && (
                    <div className="mt-0.5 flex gap-0.5 max-w-full px-1">
                      {dayData.protocols.slice(0, 4).map((p, i) => (
                        <div
                          key={i}
                          className={cn(
                            'w-1.5 h-1.5 rounded-full flex-shrink-0',
                            p.status === 'completed' && 'bg-[var(--success)]',
                            p.status === 'missed' && 'bg-[var(--error)]',
                            p.status === 'skipped' && 'bg-[var(--muted-foreground)]',
                            (p.status === 'pending' || p.status === 'scheduled') && 'bg-[var(--warning)]'
                          )}
                        />
                      ))}
                      {dayData.protocols.length > 4 && (
                        <span className="text-[8px] text-[var(--muted-foreground)]">+</span>
                      )}
                    </div>
                  )}

                  {/* Future scheduled indicator */}
                  {hasProtocols && dayData.isCurrentMonth && isFuture && (
                    <div className="mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] opacity-50" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 text-[11px] text-[var(--muted-foreground)]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <span>Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--warning)]" />
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--error)]" />
            <span>Missed</span>
          </div>
        </div>

        {/* Selected Day Bottom Sheet */}
        <BottomSheet
          isOpen={!!selectedDay}
          onClose={() => setSelectedDay(null)}
          title={selectedDayData ? format(selectedDayData.date, 'EEEE, MMMM d') : ''}
        >
          {selectedDayData && (
            <>
              {selectedDayData.protocols.length > 0 ? (
                <div className="space-y-3">
                  {selectedDayData.protocols.filter(p =>
                    p.status === 'pending' || p.status === 'missed' || p.status === 'scheduled'
                  ).length > 1 && (
                    <Button
                      onClick={() => {
                        selectedDayData.protocols.forEach(({ protocol, timing, status }) => {
                          if (status === 'pending' || status === 'missed' || status === 'scheduled') {
                            handleStatusChange(protocol.id, selectedDayData.date, 'completed', timing)
                          }
                        })
                      }}
                      className="w-full bg-[var(--success)] hover:opacity-90"
                    >
                      <CheckCheck className="w-4 h-4 mr-2" />
                      Mark All Done ({selectedDayData.protocols.filter(p =>
                        p.status === 'pending' || p.status === 'missed' || p.status === 'scheduled'
                      ).length})
                    </Button>
                  )}

                  {selectedDayData.protocols.map(({ protocol, timing, status, penUnits }) => (
                    <div
                      key={`${protocol.id}-${timing || 'default'}`}
                      className={cn(
                        'flex items-center justify-between p-4 rounded-2xl transition-colors',
                        status === 'completed'
                          ? 'bg-[var(--success-muted)]'
                          : 'bg-[var(--muted)]'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-[var(--foreground)]">
                            {protocol.peptide.name}
                          </span>
                          {penUnits && (
                            <span className="bg-[var(--info-muted)] text-[var(--info)] text-xs font-medium px-2 py-0.5 rounded-full">
                              {penUnits}u
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[var(--muted-foreground)]">
                          {protocol.doseAmount} {protocol.doseUnit}
                          {timing && ` · ${timing}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {status === 'pending' || status === 'missed' || status === 'scheduled' ? (
                          <>
                            <button
                              onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'skipped', timing)}
                              className="p-2.5 rounded-full text-[var(--muted-foreground)] hover:bg-[var(--border)] transition-colors"
                            >
                              <X className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'completed', timing)}
                              className="w-12 h-12 rounded-full border-2 border-[var(--border)] bg-[var(--card)] hover:border-[var(--success)] hover:bg-[var(--success-muted)] flex items-center justify-center transition-all"
                            >
                              <Check className="w-6 h-6 text-[var(--muted-foreground)]" />
                            </button>
                          </>
                        ) : status === 'completed' ? (
                          <button
                            onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'pending', timing)}
                            className="w-12 h-12 rounded-full bg-[var(--success)] flex items-center justify-center transition-all hover:opacity-80"
                            style={{ boxShadow: 'var(--glow-success)' }}
                          >
                            <Check className="w-6 h-6 text-white" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'pending', timing)}
                            className="px-4 py-2 rounded-xl bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--muted-foreground)] text-sm transition-colors"
                          >
                            Skipped
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-3">
                    <CalendarOff className="w-6 h-6 text-[var(--muted-foreground)]" />
                  </div>
                  <p className="text-[var(--foreground)] font-medium mb-1">No doses scheduled</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    This day has no protocols assigned.
                  </p>
                </div>
              )}
            </>
          )}
        </BottomSheet>
      </div>
    </PullToRefresh>
  )
}
