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
import { ChevronLeft, ChevronRight, Check, X, CheckCheck, Flame } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { ComplianceRing } from '@/components/compliance-ring'
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
    status: 'pending' | 'completed' | 'skipped' | 'missed' | 'scheduled'
    penUnits?: number | null
  }[]
}

// Calculate pen units from protocol reconstitution info
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
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}

function isDoseDay(
  date: Date,
  frequency: string,
  startDate: Date,
  customDays?: string | null
): boolean {
  const dayOfWeek = DAY_INDEX_MAP[getDay(date)]

  switch (frequency) {
    case 'daily':
      return true
    case 'weekly':
      return getDay(date) === getDay(startDate)
    case 'custom':
      if (!customDays) return false
      try {
        const days = JSON.parse(customDays) as DayOfWeek[]
        return days.includes(dayOfWeek)
      } catch {
        return false
      }
    default:
      return false
  }
}

export default function CalendarPage() {
  const { currentUserId } = useAppStore()
  const queryClient = useQueryClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)

  // Fetch protocols
  const { data: protocols = [] } = useQuery<ProtocolWithPeptide[]>({
    queryKey: ['protocols', currentUserId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols?userId=${currentUserId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60, // 1 minute
  })

  // Fetch dose logs for the month
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
    staleTime: 1000 * 30, // 30 seconds
  })

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['protocols', currentUserId] }),
      refetchLogs(),
    ])
  }, [queryClient, currentUserId, refetchLogs])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const calendarStart = startOfWeek(monthStart)
    const calendarEnd = endOfWeek(monthEnd)

    const days: DayData[] = []
    let day = calendarStart

    while (day <= calendarEnd) {
      const currentDay = day
      const dayProtocols: DayData['protocols'] = []

      // Check each protocol to see if it applies to this day
      for (const protocol of protocols) {
        const protocolStart = new Date(protocol.startDate)
        const protocolEnd = protocol.endDate ? new Date(protocol.endDate) : null

        // Check if protocol is active on this day
        if (currentDay < protocolStart) continue
        if (protocolEnd && currentDay > protocolEnd) continue
        if (protocol.status === 'completed') continue

        // Check if it's a dose day based on frequency
        if (!isDoseDay(currentDay, protocol.frequency, protocolStart, protocol.customDays)) {
          continue
        }

        // Find dose log for this day/protocol
        const log = doseLogs.find(
          (l) =>
            l.protocolId === protocol.id &&
            isSameDay(new Date(l.scheduledDate), currentDay)
        )

        let status: DayData['protocols'][0]['status'] = 'scheduled'
        if (log) {
          status = log.status as DayData['protocols'][0]['status']
        } else if (currentDay < new Date() && !isToday(currentDay)) {
          status = 'missed'
        } else if (isToday(currentDay)) {
          status = 'pending'
        }

        dayProtocols.push({ protocol, status, penUnits: calculatePenUnits(protocol) })
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

  // Calculate monthly compliance stats
  const monthlyStats = useMemo(() => {
    const today = new Date()
    let totalDoses = 0
    let completedDoses = 0
    let currentStreak = 0
    let checkingStreak = true

    // Only count days in the current month up to today
    const daysToCount = calendarDays.filter(
      (d) => d.isCurrentMonth && d.date <= today && d.protocols.length > 0
    )

    // Count totals and check streak (going backwards from today)
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

  async function handleStatusChange(
    protocolId: string,
    date: Date,
    status: 'completed' | 'skipped' | 'pending'
  ) {
    if (!currentUserId) return

    // Optimistic update
    queryClient.setQueryData<DoseLog[]>(
      ['doseLogs', currentUserId, format(monthStart, 'yyyy-MM'), format(monthEnd, 'yyyy-MM')],
      (prev = []) => {
        const existingIndex = prev.findIndex(
          l => l.protocolId === protocolId && isSameDay(new Date(l.scheduledDate), date)
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
          }
          return [...prev, newLog]
        }
      }
    )

    // Send to server
    const dateStr = format(date, 'yyyy-MM-dd') + 'T12:00:00.000Z'
    try {
      await fetch('/api/doses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          protocolId,
          scheduledDate: dateStr,
          status,
        }),
      })
    } catch (error) {
      console.error('Error updating dose:', error)
      refetchLogs()
    }
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="h-full">
      <div className="p-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Monthly Summary Card */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <ComplianceRing
                  completed={monthlyStats.completedDoses}
                  total={monthlyStats.totalDoses}
                  size="sm"
                  showPercentage={true}
                  showCheckOnComplete={true}
                />
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">
                    {monthlyStats.percentage}% Compliance
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {monthlyStats.completedDoses} of {monthlyStats.totalDoses} doses
                  </div>
                </div>
              </div>
              {monthlyStats.streak > 0 && (
                <div className="flex items-center gap-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-full">
                  <Flame className="w-4 h-4" />
                  <span className="font-semibold">{monthlyStats.streak}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today button */}
        {!isSameMonth(currentMonth, new Date()) && (
          <div className="flex justify-center mb-4">
            <Button variant="secondary" size="sm" onClick={() => setCurrentMonth(new Date())}>
              Go to Today
            </Button>
          </div>
        )}

        {/* Calendar Grid */}
        <Card className="mb-4 overflow-hidden">
          <CardContent className="p-3">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div
                  key={i}
                  className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days - flat grid for consistent sizing */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((dayData, index) => {
                const hasProtocols = dayData.protocols.length > 0
                const completedCount = dayData.protocols.filter((p) => p.status === 'completed').length
                const allCompleted = hasProtocols && completedCount === dayData.protocols.length
                const hasMissed = dayData.protocols.some((p) => p.status === 'missed')
                const isFuture = dayData.date > new Date() && !dayData.isToday

                // Background tint based on status
                const getBgClass = () => {
                  if (!dayData.isCurrentMonth) return ''
                  if (!hasProtocols) return ''
                  if (isFuture) return 'bg-slate-50 dark:bg-slate-800/50'
                  if (allCompleted) return 'bg-green-50 dark:bg-green-900/20'
                  if (hasMissed) return 'bg-red-50 dark:bg-red-900/20'
                  return 'bg-amber-50 dark:bg-amber-900/20'
                }

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDay(dayData.date)}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-xl transition-all duration-200 aspect-square',
                      getBgClass(),
                      dayData.isCurrentMonth
                        ? isFuture
                          ? 'text-slate-400 dark:text-slate-500'
                          : 'text-slate-900 dark:text-white'
                        : 'text-slate-300 dark:text-slate-700',
                      dayData.isToday && 'ring-2 ring-slate-900 dark:ring-white ring-offset-1 ring-offset-[var(--card)]',
                      selectedDay && isSameDay(dayData.date, selectedDay) && 'bg-slate-200 dark:bg-slate-600',
                      hasProtocols && 'hover:scale-105 active:scale-95'
                    )}
                  >
                    <span
                      className={cn(
                        'text-[11px] leading-none',
                        dayData.isToday && 'font-bold',
                        hasProtocols && dayData.isCurrentMonth && 'mb-0.5'
                      )}
                    >
                      {format(dayData.date, 'd')}
                    </span>

                    {/* Mini compliance ring */}
                    {hasProtocols && dayData.isCurrentMonth && (
                      <div className={cn(isFuture && 'opacity-40')}>
                        <ComplianceRing
                          completed={completedCount}
                          total={dayData.protocols.length}
                          size="xs"
                          showPercentage={false}
                          showCheckOnComplete={true}
                        />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Legend - more compact */}
        <div className="flex items-center justify-center gap-6 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" />
            <span>Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700" />
            <span>Partial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600" />
            <span>Scheduled</span>
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
                  {/* Mark All Done button */}
                  {selectedDayData.protocols.filter(p =>
                    p.status === 'pending' || p.status === 'missed' || p.status === 'scheduled'
                  ).length > 1 && (
                    <Button
                      onClick={() => {
                        selectedDayData.protocols.forEach(({ protocol, status }) => {
                          if (status === 'pending' || status === 'missed' || status === 'scheduled') {
                            handleStatusChange(protocol.id, selectedDayData.date, 'completed')
                          }
                        })
                      }}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <CheckCheck className="w-4 h-4 mr-2" />
                      Mark All Done ({selectedDayData.protocols.filter(p =>
                        p.status === 'pending' || p.status === 'missed' || p.status === 'scheduled'
                      ).length})
                    </Button>
                  )}

                  {selectedDayData.protocols.map(({ protocol, status, penUnits }) => (
                    <div
                      key={protocol.id}
                      className={cn(
                        'flex items-center justify-between p-4 rounded-xl',
                        status === 'completed' ? 'bg-green-50 dark:bg-green-900/30' : 'bg-slate-50 dark:bg-slate-700'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900 dark:text-white text-lg">
                            {protocol.peptide.name}
                          </span>
                          {penUnits && (
                            <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-sm font-semibold px-2 py-0.5 rounded-full">
                              {penUnits} units
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {protocol.doseAmount} {protocol.doseUnit}
                          {protocol.timing && ` • ${protocol.timing}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {status === 'pending' || status === 'missed' || status === 'scheduled' ? (
                          <>
                            <button
                              onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'skipped')}
                              className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                              <X className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'completed')}
                              className="w-12 h-12 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center justify-center transition-colors"
                            >
                              <Check className="w-6 h-6 text-slate-400" />
                            </button>
                          </>
                        ) : status === 'completed' ? (
                          <button
                            onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'pending')}
                            className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
                          >
                            <Check className="w-6 h-6 text-white" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(protocol.id, selectedDayData.date, 'pending')}
                            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-600 dark:text-slate-200 text-sm transition-colors"
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
                  <p className="text-slate-500 dark:text-slate-400">No doses scheduled for this day</p>
                </div>
              )}
            </>
          )}
        </BottomSheet>
      </div>
    </PullToRefresh>
  )
}
