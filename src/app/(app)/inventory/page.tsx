'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { Plus, Package, AlertTriangle, Clock, Droplet, Syringe, Pill } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { InventoryVial, Peptide, ItemType } from '@/types'

interface VialWithPeptide extends InventoryVial {
  peptide: Peptide & { type?: string }
}

type FilterType = 'all' | ItemType

function getExpirationStatus(vial: VialWithPeptide) {
  if (vial.isExpired) return 'expired'
  if (!vial.expirationDate) return 'unknown'

  const daysUntilExpiry = differenceInDays(new Date(vial.expirationDate), new Date())
  if (daysUntilExpiry <= 7) return 'expiring-soon'
  return 'valid'
}

export default function InventoryPage() {
  const currentUserId = useAppStore(s => s.currentUserId)
  const [showExpired, setShowExpired] = useState(false)
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')

  const { data: vials = [], isLoading } = useQuery<VialWithPeptide[]>({
    queryKey: ['inventory', currentUserId, showExpired],
    queryFn: async () => {
      const params = new URLSearchParams({
        userId: currentUserId!,
        includeExpired: showExpired.toString(),
        includeExhausted: 'false',
      })
      const res = await fetch(`/api/inventory?${params}`)
      if (!res.ok) throw new Error('Failed to fetch inventory')
      return res.json()
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5,
  })

  const { activeVials, expiredVials, expiringVials, filteredVials } = useMemo(() => {
    const active = vials.filter((v) => !v.isExpired && !v.isExhausted)
    const expired = vials.filter((v) => v.isExpired)
    const expiring = active.filter((v) => getExpirationStatus(v) === 'expiring-soon')
    const filtered = typeFilter === 'all'
      ? vials
      : vials.filter(v => (v.peptide.type || 'peptide') === typeFilter)
    return { activeVials: active, expiredVials: expired, expiringVials: expiring, filteredVials: filtered }
  }, [vials, typeFilter])

  return (
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Inventory</h2>
        <Link href="/inventory/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </Link>
      </div>

      {/* Expiration Alerts */}
      {!isLoading && (expiringVials.length > 0 || expiredVials.length > 0) && (
        <div className="space-y-2 mb-4">
          {expiredVials.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-red-800 dark:text-red-300">
                  {expiredVials.length} expired vial{expiredVials.length > 1 ? 's' : ''}
                </div>
                <div className="text-sm text-red-600 dark:text-red-400">
                  {expiredVials.map(v => v.peptide.name).join(', ')}
                </div>
              </div>
            </div>
          )}
          {expiringVials.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-800 dark:text-amber-300">
                  {expiringVials.length} vial{expiringVials.length > 1 ? 's' : ''} expiring soon
                </div>
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  {expiringVials.map(v => {
                    const days = v.expirationDate
                      ? differenceInDays(new Date(v.expirationDate), new Date())
                      : 0
                    return `${v.peptide.name} (${days}d)`
                  }).join(', ')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-100 dark:border-slate-700">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{activeVials.length}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Active</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3 text-center border border-amber-100 dark:border-amber-800">
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {expiringVials.length}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-500">Expiring</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3 text-center border border-red-100 dark:border-red-800">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{expiredVials.length}</div>
            <div className="text-xs text-red-600 dark:text-red-500">Expired</div>
          </div>
        </div>
      )}

      {/* Type Filter Tabs */}
      <div className="flex gap-2 mb-4">
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

      {/* Toggle Expired */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          id="showExpired"
          checked={showExpired}
          onChange={(e) => setShowExpired(e.target.checked)}
          className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700"
        />
        <label htmlFor="showExpired" className="text-sm text-slate-700 dark:text-slate-300">
          Show expired items
        </label>
      </div>

      {/* Vials List */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading...</div>
      ) : filteredVials.length > 0 ? (
        <div className="space-y-3">
          {filteredVials.map((vial) => {
            const status = getExpirationStatus(vial)
            const daysUntilExpiry = vial.expirationDate
              ? differenceInDays(new Date(vial.expirationDate), new Date())
              : null

            return (
              <Link key={vial.id} href={`/inventory/${vial.id}`}>
              <Card
                className={cn(
                  'transition-all cursor-pointer hover:shadow-md',
                  status === 'expired' && 'opacity-60 border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/20',
                  status === 'expiring-soon' && 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/20'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {vial.peptide.name}
                        </span>
                        {vial.identifier && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            ({vial.identifier})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {vial.totalAmount} {vial.totalUnit}
                      </div>
                    </div>
                    <div>
                      {status === 'expired' && (
                        <Badge variant="danger" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Expired
                        </Badge>
                      )}
                      {status === 'expiring-soon' && (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysUntilExpiry}d left
                        </Badge>
                      )}
                      {status === 'valid' && daysUntilExpiry !== null && (
                        <Badge variant="success">{daysUntilExpiry}d left</Badge>
                      )}
                    </div>
                  </div>

                  {vial.diluentVolume && vial.concentration && (
                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <span className="flex items-center gap-1">
                        <Droplet className="w-3 h-3" />
                        {vial.diluentVolume} ml diluent
                      </span>
                      <span>
                        {vial.concentration.toFixed(2)} {vial.concentrationUnit}
                      </span>
                    </div>
                  )}

                  {vial.dateReconstituted && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      Reconstituted: {format(new Date(vial.dateReconstituted), 'MMM d, yyyy')}
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
            <Package className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <div className="text-slate-400 dark:text-slate-500 mb-2">
              {typeFilter === 'all' ? 'No inventory' : `No ${typeFilter}s`}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {typeFilter === 'all'
                ? 'Add your first item to track your inventory'
                : `Add your first ${typeFilter} to track your inventory`}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
