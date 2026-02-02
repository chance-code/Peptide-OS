'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { Plus, Play, Pause, Infinity, Syringe, Pill } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { cn } from '@/lib/utils'
import type { Protocol, Peptide, ItemType } from '@/types'

interface ProtocolWithPeptide extends Protocol {
  peptide: Peptide & { type?: string }
}

type TypeFilter = 'all' | ItemType

export default function ProtocolsPage() {
  const { currentUserId } = useAppStore()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const { data: protocols = [], isLoading, refetch } = useQuery<ProtocolWithPeptide[]>({
    queryKey: ['protocols', currentUserId, filter],
    queryFn: async () => {
      const statusParam = filter !== 'all' ? `&status=${filter}` : ''
      const res = await fetch(`/api/protocols?userId=${currentUserId}${statusParam}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 30, // 30 seconds
  })

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  async function handleToggleStatus(protocol: ProtocolWithPeptide) {
    const newStatus = protocol.status === 'active' ? 'paused' : 'active'

    // Optimistic update
    queryClient.setQueryData<ProtocolWithPeptide[]>(
      ['protocols', currentUserId, filter],
      (old = []) => old.map(p => p.id === protocol.id ? { ...p, status: newStatus } : p)
    )

    try {
      await fetch(`/api/protocols/${protocol.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch (error) {
      console.error('Error updating protocol:', error)
      refetch()
    }
  }

  function formatDays(protocol: ProtocolWithPeptide): string | null {
    if (protocol.frequency === 'daily') {
      return 'Every day'
    }

    if (protocol.frequency === 'every_other_day') {
      return 'Every other day'
    }

    if (protocol.frequency === 'custom' && protocol.customDays) {
      try {
        const days = JSON.parse(protocol.customDays) as string[]
        const dayLabels: Record<string, string> = {
          mon: 'Mon',
          tue: 'Tue',
          wed: 'Wed',
          thu: 'Thu',
          fri: 'Fri',
          sat: 'Sat',
          sun: 'Sun',
        }
        const orderedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        const sortedDays = days.sort((a, b) => orderedDays.indexOf(a) - orderedDays.indexOf(b))
        return sortedDays.map((d) => dayLabels[d] || d).join(', ')
      } catch {
        return null
      }
    }

    return null
  }

  function getProgressStats(protocol: ProtocolWithPeptide) {
    const today = new Date()
    const start = new Date(protocol.startDate)
    const end = protocol.endDate ? new Date(protocol.endDate) : null

    const daysCompleted = Math.max(0, differenceInDays(today, start) + 1)
    const daysRemaining = end ? Math.max(0, differenceInDays(end, today)) : null
    const totalDays = end ? differenceInDays(end, start) + 1 : null
    const totalWeeks = totalDays ? Math.round(totalDays / 7) : null
    const progress = totalDays ? Math.min(100, (daysCompleted / totalDays) * 100) : null

    return { daysCompleted, daysRemaining, totalDays, totalWeeks, progress }
  }

  function getPenUnits(protocol: ProtocolWithPeptide): number | null {
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

  const filteredProtocols = protocols.filter((p) => {
    // Filter by status
    if (filter !== 'all' && p.status !== filter) return false
    // Filter by type
    if (typeFilter !== 'all' && (p.peptide.type || 'peptide') !== typeFilter) return false
    return true
  })

  return (
    <PullToRefresh onRefresh={handleRefresh} className="h-full">
      <div className="p-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Protocols</h2>
          <Link href="/protocols/new">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </Link>
        </div>

        {/* Type Filter Tabs */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('peptide')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === 'peptide'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <Syringe className="w-3.5 h-3.5" />
            Peptides
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('supplement')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === 'supplement'
                ? 'bg-[var(--success)] text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <Pill className="w-3.5 h-3.5" />
            Supplements
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(['all', 'active', 'paused', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                filter === f
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Protocols List */}
        {isLoading ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading...</div>
        ) : filteredProtocols.length > 0 ? (
          <div className="space-y-3">
            {filteredProtocols.map((protocol, index) => {
              const stats = getProgressStats(protocol)
              const penUnits = getPenUnits(protocol)

              return (
                <Link key={protocol.id} href={`/protocols/${protocol.id}`}>
                  <Card className={cn('hover:shadow-md transition-shadow animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {protocol.peptide.name}
                            </span>
                            {penUnits && (
                              <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {penUnits} units
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {protocol.servingSize
                              ? `${protocol.servingSize} ${protocol.servingUnit || 'serving'}${protocol.servingSize > 1 ? 's' : ''}`
                              : `${protocol.doseAmount} ${protocol.doseUnit}`}
                            {protocol.timing && ` • ${protocol.timing}`}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {formatDays(protocol) || (protocol.frequency === 'weekly' ? 'Weekly' : protocol.frequency)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              protocol.status === 'active'
                                ? 'success'
                                : protocol.status === 'paused'
                                ? 'warning'
                                : 'default'
                            }
                          >
                            {protocol.status}
                          </Badge>
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              handleToggleStatus(protocol)
                            }}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            {protocol.status === 'active' ? (
                              <Pause className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            ) : (
                              <Play className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-3">
                        <span>Day {stats.daysCompleted}</span>
                        {stats.daysRemaining !== null && stats.totalWeeks !== null ? (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">•</span>
                            <span>{stats.daysRemaining} days left ({stats.totalWeeks} week cycle)</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">•</span>
                            <span className="flex items-center gap-1">
                              <Infinity className="w-3 h-3" />
                              Ongoing
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {stats.progress !== null && (
                        <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${stats.progress}%` }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-slate-400 dark:text-slate-500 mb-2">No protocols found</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {filter !== 'all'
                  ? `No ${filter} protocols`
                  : 'Create your first protocol to get started'}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  )
}
