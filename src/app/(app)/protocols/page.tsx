'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { Plus, Play, Pause, Infinity, Syringe, Pill } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { StackAssessmentCard } from '@/components/stack-assessment-card'
import { cn } from '@/lib/utils'
import type { Protocol, Peptide, ItemType } from '@/types'
import { PEPTIDE_REFERENCE } from '@/lib/peptide-reference'
import { getSupplementBenefit } from '@/lib/supplement-reference'

// Peptide benefit descriptions by category
const CATEGORY_BENEFITS: Record<string, string> = {
  'healing': 'Tissue Repair',
  'growth-hormone': 'GH & Recovery',
  'weight-loss': 'Fat Loss',
  'cosmetic': 'Skin & Hair',
}

// Specific benefit labels for peptides in "other" category
const SPECIFIC_PEPTIDE_BENEFITS: Record<string, string> = {
  'pt-141': 'Libido & Function',
  'bremelanotide': 'Libido & Function',
  'epithalon': 'Longevity & Telomeres',
  'epitalon': 'Longevity & Telomeres',
  'thymosin alpha-1': 'Immune Support',
  'ta1': 'Immune Support',
  'll-37': 'Immune & Antimicrobial',
  'cathelicidin': 'Immune & Antimicrobial',
  'selank': 'Anxiety & Cognition',
  'semax': 'Focus & Cognition',
  'nad+': 'Energy & Longevity',
  'nad': 'Energy & Longevity',
  'glutathione': 'Detox & Antioxidant',
  'gsh': 'Detox & Antioxidant',
  'dsip': 'Sleep & Recovery',
  'dihexa': 'Brain & Memory',
  'p21': 'Cognition & BDNF',
  'p-21': 'Cognition & BDNF',
  'fgl': 'Brain & Nerves',
  'cerebrolysin': 'Brain & Neuroprotection',
  'cortexin': 'Brain & Neuroprotection',
  'na-selank': 'Calm & Focus',
  'na-semax': 'Focus & Energy',
  'thymalin': 'Immune & Thymus',
  'humanin': 'Longevity & Mitochondria',
  'ss-31': 'Energy & Mitochondria',
  'elamipretide': 'Energy & Mitochondria',
  'kisspeptin': 'Hormones & Fertility',
  'kisspeptin-10': 'Hormones & Fertility',
  'gonadorelin': 'Testosterone Support',
  'gnrh': 'Testosterone Support',
  'vip': 'Immune & Neuro',
}

// Get label for an item (peptide or supplement)
function getItemLabel(name: string, itemType?: string | null): { label: string; color: string } {
  // For supplements, look up benefit
  if (itemType === 'supplement') {
    const benefit = getSupplementBenefit(name)
    if (benefit) {
      return { label: benefit, color: 'bg-[var(--success-muted)] text-[var(--success)]' }
    }
    return { label: 'Supplement', color: 'bg-[var(--muted)] text-[var(--muted-foreground)]' }
  }

  // For peptides, look up in reference
  const normalizedName = name.toLowerCase().trim()
  const ref = PEPTIDE_REFERENCE.find(p => {
    const peptideName = p.name.toLowerCase()
    if (peptideName === normalizedName) return true
    if (p.aliases?.some(a => a.toLowerCase() === normalizedName)) return true
    // More aggressive partial matching
    if (normalizedName.includes(peptideName) || peptideName.includes(normalizedName)) return true
    if (p.aliases?.some(a =>
      normalizedName.includes(a.toLowerCase()) ||
      a.toLowerCase().includes(normalizedName)
    )) return true
    // Match without hyphens/spaces
    const cleanName = normalizedName.replace(/[-\s]/g, '')
    const cleanPeptide = peptideName.replace(/[-\s]/g, '')
    if (cleanName.includes(cleanPeptide) || cleanPeptide.includes(cleanName)) return true
    return false
  })

  const category = ref?.category || 'other'

  // For "other" category, check for specific benefit labels
  let label: string
  if (category === 'other') {
    // Try to find a specific benefit for this peptide
    const specificBenefit = SPECIFIC_PEPTIDE_BENEFITS[normalizedName] ||
      Object.entries(SPECIFIC_PEPTIDE_BENEFITS).find(([key]) =>
        normalizedName.includes(key) || key.includes(normalizedName)
      )?.[1]
    label = specificBenefit || 'Peptide'
  } else {
    label = CATEGORY_BENEFITS[category] || 'Peptide'
  }

  const colors: Record<string, string> = {
    'healing': 'bg-[var(--success-muted)] text-[var(--success)]',
    'growth-hormone': 'bg-[rgba(155,125,212,0.12)] text-[var(--tier-3)]',
    'weight-loss': 'bg-[var(--evidence-muted)] text-[var(--evidence)]',
    'cosmetic': 'bg-[var(--warning-muted)] text-[var(--warning)]',
    'other': 'bg-[var(--accent-muted)] text-[var(--accent)]',
  }

  return { label, color: colors[category] || colors.other }
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
    queryKey: ['protocols', filter],
    queryFn: async () => {
      const statusParam = filter !== 'all' ? `?status=${filter}` : ''
      const res = await fetch(`/api/protocols${statusParam}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes - pull to refresh for updates
  })

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  async function handleToggleStatus(protocol: ProtocolWithPeptide) {
    const newStatus = protocol.status === 'active' ? 'paused' : 'active'

    // Optimistic update
    queryClient.setQueryData<ProtocolWithPeptide[]>(
      ['protocols', filter],
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

  const filteredProtocols = useMemo(() => protocols.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false
    if (typeFilter !== 'all' && (p.peptide.type || 'peptide') !== typeFilter) return false
    return true
  }), [protocols, filter, typeFilter])

  // Pre-compute stats, pen units, and labels for all filtered protocols
  const protocolDisplayData = useMemo(() => {
    return filteredProtocols.map((protocol) => ({
      stats: getProgressStats(protocol),
      penUnits: getPenUnits(protocol),
      itemLabel: getItemLabel(protocol.peptide.name, protocol.peptide.type),
    }))
  }, [filteredProtocols])

  return (
    <PullToRefresh onRefresh={handleRefresh} className="h-full">
      <div className="p-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-display text-[var(--foreground)]">Protocols</h2>
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
                ? 'bg-[var(--foreground)] text-[var(--background)]'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
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
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
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
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
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
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
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
          <div className="text-center py-8 text-[var(--muted-foreground)]">Loading...</div>
        ) : filteredProtocols.length > 0 ? (
          <div className="space-y-3">
            {filteredProtocols.map((protocol, index) => {
              const { stats, penUnits, itemLabel: { label, color } } = protocolDisplayData[index]

              return (
                <Link key={protocol.id} href={`/protocols/${protocol.id}`}>
                  <Card className={cn('hover:shadow-md transition-shadow animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[var(--foreground)] truncate max-w-[180px]">
                              {protocol.peptide.name}
                            </span>
                            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', color)}>
                              {label}
                            </span>
                            {penUnits && (
                              <span className="bg-[var(--evidence-muted)] text-[var(--evidence)] text-xs font-semibold px-2 py-0.5 rounded-full">
                                {penUnits}u
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)] mt-0.5">
                            {protocol.servingSize
                              ? `${protocol.servingSize} ${protocol.servingUnit || 'serving'}${protocol.servingSize > 1 ? 's' : ''}`
                              : `${protocol.doseAmount} ${protocol.doseUnit}`}
                            {protocol.timing && ` • ${protocol.timing}`}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
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
                            className="p-1 rounded hover:bg-[var(--muted)]"
                          >
                            {protocol.status === 'active' ? (
                              <Pause className="w-4 h-4 text-[var(--muted-foreground)]" />
                            ) : (
                              <Play className="w-4 h-4 text-[var(--muted-foreground)]" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)] mt-3">
                        <span className="text-data-sm">Day {stats.daysCompleted}</span>
                        {stats.daysRemaining !== null && stats.totalWeeks !== null ? (
                          <>
                            <span className="text-[var(--border)]">•</span>
                            <span>{stats.daysRemaining} days left ({stats.totalWeeks} week cycle)</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[var(--border)]">•</span>
                            <span className="flex items-center gap-1">
                              <Infinity className="w-3 h-3" />
                              Ongoing
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {stats.progress !== null && (
                        <div className="mt-2 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] rounded-full transition-all"
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
              <div className="text-[var(--muted-foreground)] mb-2">No protocols found</div>
              <div className="text-sm text-[var(--muted-foreground)]">
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
