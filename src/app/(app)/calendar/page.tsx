'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { ChevronLeft, ChevronRight, Circle, CheckCircle, XCircle } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  }[]
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
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [protocols, setProtocols] = useState<ProtocolWithPeptide[]>([])
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!currentUserId) return

    try {
      setIsLoading(true)

      // Fetch protocols
      const protocolsRes = await fetch(`/api/protocols?userId=${currentUserId}`)
      if (protocolsRes.ok) {
        const protocolsData = await protocolsRes.json()
        setProtocols(protocolsData)
      }

      // Fetch dose logs for the month range
      const monthStart = startOfMonth(currentMonth)
      const monthEnd = endOfMonth(currentMonth)
      const logsRes = await fetch(
        `/api/doses?userId=${currentUserId}&startDate=${format(monthStart, 'yyyy-MM-dd')}&endDate=${format(monthEnd, 'yyyy-MM-dd')}`
      )
      if (logsRes.ok) {
        const logsData = await logsRes.json()
        setDoseLogs(logsData)
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId, currentMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
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

        dayProtocols.push({ protocol, status })
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
  }, [currentMonth, protocols, doseLogs])

  const selectedDayData = selectedDay
    ? calendarDays.find((d) => isSameDay(d.date, selectedDay))
    : null

  return (
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-semibold text-slate-900">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Today button */}
      {!isSameMonth(currentMonth, new Date()) && (
        <div className="flex justify-center mb-4">
          <Button variant="secondary" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Go to Today
          </Button>
        </div>
      )}

      {/* Calendar Grid */}
      <Card className="mb-4">
        <CardContent className="p-2">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-slate-500 py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((dayData, index) => {
              const hasProtocols = dayData.protocols.length > 0
              const allCompleted = hasProtocols && dayData.protocols.every((p) => p.status === 'completed')
              const hasMissed = dayData.protocols.some((p) => p.status === 'missed')
              const hasPending = dayData.protocols.some((p) => p.status === 'pending' || p.status === 'scheduled')

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDay(dayData.date)}
                  className={cn(
                    'relative aspect-square p-1 rounded-lg text-sm transition-colors',
                    dayData.isCurrentMonth ? 'text-slate-900' : 'text-slate-300',
                    dayData.isToday && 'ring-2 ring-slate-900',
                    selectedDay && isSameDay(dayData.date, selectedDay) && 'bg-slate-100',
                    !selectedDay && hasProtocols && 'hover:bg-slate-50'
                  )}
                >
                  <span
                    className={cn(
                      'block text-center',
                      dayData.isToday && 'font-bold'
                    )}
                  >
                    {format(dayData.date, 'd')}
                  </span>

                  {/* Protocol indicators */}
                  {hasProtocols && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {allCompleted ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      ) : hasMissed ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      ) : hasPending ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      )}
                      {dayData.protocols.length > 1 && (
                        <span className="text-[8px] text-slate-400">
                          +{dayData.protocols.length - 1}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-slate-500 mb-4">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Missed</span>
        </div>
      </div>

      {/* Selected Day Details */}
      {selectedDayData && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900">
                {format(selectedDayData.date, 'EEEE, MMMM d')}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                Close
              </Button>
            </div>

            {selectedDayData.protocols.length > 0 ? (
              <div className="space-y-2">
                {selectedDayData.protocols.map(({ protocol, status }) => (
                  <div
                    key={protocol.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      {status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : status === 'missed' ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300" />
                      )}
                      <div>
                        <div className="font-medium text-slate-900">
                          {protocol.peptide.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {protocol.doseAmount} {protocol.doseUnit}
                          {protocol.timing && ` • ${protocol.timing}`}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={
                        status === 'completed'
                          ? 'success'
                          : status === 'missed'
                          ? 'danger'
                          : status === 'skipped'
                          ? 'default'
                          : 'warning'
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No protocols scheduled for this day</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-4 text-slate-500">Loading...</div>
      )}
    </div>
  )
}
