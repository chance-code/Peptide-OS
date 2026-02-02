'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { Plus, Play, Pause, Infinity, Syringe, Pill, Heart, Zap, Scale, Sparkles } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { StackAssessmentCard } from '@/components/stack-assessment-card'
import { cn } from '@/lib/utils'
import type { Protocol, Peptide, ItemType } from '@/types'
import { PEPTIDE_REFERENCE } from '@/lib/peptide-reference'
import { getSupplementCategory } from '@/lib/supplement-reference'

// Look up category from reference database by peptide name
function getCategoryForItem(name: string, itemType?: string | null, dbCategory?: string | null): string {
  // Use database category if set
  if (dbCategory) return dbCategory

  // If it's a supplement, look up in supplement reference
  if (itemType === 'supplement') {
    return getSupplementCategory(name)
  }

  // For peptides, look up in peptide reference
  const normalizedName = name.toLowerCase().trim()
  const ref = PEPTIDE_REFERENCE.find(p => {
    const peptideName = p.name.toLowerCase()
    // Exact match
    if (peptideName === normalizedName) return true
    // Alias match
    if (p.aliases?.some(a => a.toLowerCase() === normalizedName)) return true
    // Partial/fuzzy match - name contains or is contained
    if (normalizedName.includes(peptideName) || peptideName.includes(normalizedName)) return true
    // Alias partial match
    if (p.aliases?.some(a =>
      normalizedName.includes(a.toLowerCase()) ||
      a.toLowerCase().includes(normalizedName)
    )) return true
    return false
  })

  return ref?.category || 'other'
}

const CATEGORY_INFO: Record<string, { label: string; icon: typeof Pill; color: string }> = {
  // Peptide categories
  healing: { label: 'Healing', icon: Heart, color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  'growth-hormone': { label: 'GH', icon: Zap, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  'weight-loss': { label: 'Weight Loss', icon: Scale, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  cosmetic: { label: 'Cosmetic', icon: Sparkles, color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300' },
  // Supplement categories
  vitamin: { label: 'Vitamin', icon: Pill, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
  mineral: { label: 'Mineral', icon: Pill, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300' },
  'amino-acid': { label: 'Amino Acid', icon: Pill, color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' },
  nootropic: { label: 'Nootropic', icon: Sparkles, color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300' },
  adaptogen: { label: 'Adaptogen', icon: Heart, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  omega: { label: 'Omega', icon: Pill, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  probiotic: { label: 'Probiotic', icon: Pill, color: 'bg-lime-100 text-lime-800 dark:bg-lime-900/50 dark:text-lime-300' },
  herb: { label: 'Herb', icon: Heart, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' },
  hormone: { label: 'Hormone', icon: Zap, color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300' },
  antioxidant: { label: 'Antioxidant', icon: Sparkles, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  other: { label: 'Other', icon: Pill, color: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300' },
}

interface ProtocolWithPeptide extends Protocol {
  peptide: Peptide & { type?: string; category?: string }
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
    staleTime: 1000 * 60 * 5, // 5 minutes - pull to refresh for updates
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

        {/* Stack Assessment */}
        {currentUserId && protocols.length > 0 && (
          <StackAssessmentCard
            userId={currentUserId}
            protocols={protocols.map(p => ({
              id: p.id,
              peptideName: p.peptide.name,
              doseAmount: p.doseAmount,
              doseUnit: p.doseUnit,
              status: p.status,
            }))}
            className="mb-4"
          />
        )}

        {/* Protocols List */}
        {isLoading ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading...</div>
        ) : filteredProtocols.length > 0 ? (
          <div className="space-y-3">
            {filteredProtocols.map((protocol, index) => {
              const stats = getProgressStats(protocol)
              const penUnits = getPenUnits(protocol)
              const category = getCategoryForItem(protocol.peptide.name, protocol.peptide.type, protocol.peptide.category)
              const categoryInfo = CATEGORY_INFO[category] || CATEGORY_INFO.other
              const CategoryIcon = categoryInfo.icon

              return (
                <Link key={protocol.id} href={`/protocols/${protocol.id}`}>
                  <Card className={cn('hover:shadow-md transition-shadow animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {protocol.peptide.name}
                            </span>
                            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1', categoryInfo.color)}>
                              <CategoryIcon className="w-3 h-3" />
                              {categoryInfo.label}
                            </span>
                            {penUnits && (
                              <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                                {penUnits}u
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
