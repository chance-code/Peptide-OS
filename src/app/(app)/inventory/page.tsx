'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { Plus, Package, AlertTriangle, Clock, Droplet, Syringe, Pill, ChevronRight } from 'lucide-react'
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
        <h2 className="text-display text-[var(--foreground)]">Inventory</h2>
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
            <div className="flex items-start gap-3 p-3 bg-[var(--error-muted)] border border-[var(--error)]/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-[var(--error)]">
                  {expiredVials.length} expired vial{expiredVials.length > 1 ? 's' : ''}
                </div>
                <div className="text-sm text-[var(--error)]">
                  {expiredVials.map(v => v.peptide.name).join(', ')}
                </div>
              </div>
            </div>
          )}
          {expiringVials.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-[var(--warning-muted)] border border-[var(--warning)]/30 rounded-lg">
              <Clock className="w-5 h-5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-[var(--warning)]">
                  {expiringVials.length} vial{expiringVials.length > 1 ? 's' : ''} expiring soon
                </div>
                <div className="text-sm text-[var(--warning)]">
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
          <div className="bg-[var(--background)] rounded-lg p-3 text-center border border-[var(--border)]">
            <div className="text-data-lg text-[var(--foreground)]">{activeVials.length}</div>
            <div className="text-xs text-[var(--muted-foreground)]">Active</div>
          </div>
          <div className="bg-[var(--warning-muted)] rounded-lg p-3 text-center border border-[var(--warning)]/30">
            <div className="text-2xl font-bold text-[var(--warning)]">
              {expiringVials.length}
            </div>
            <div className="text-xs text-[var(--warning)]">Expiring</div>
          </div>
          <div className="bg-[var(--error-muted)] rounded-lg p-3 text-center border border-[var(--error)]/30">
            <div className="text-2xl font-bold text-[var(--error)]">{expiredVials.length}</div>
            <div className="text-xs text-[var(--error)]">Expired</div>
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

      {/* Toggle Expired */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          id="showExpired"
          checked={showExpired}
          onChange={(e) => setShowExpired(e.target.checked)}
          className="rounded border-[var(--border)]"
        />
        <label htmlFor="showExpired" className="text-sm text-[var(--foreground)]">
          Show expired items
        </label>
      </div>

      {/* Vials List */}
      {isLoading ? (
        <div className="text-center py-8 text-[var(--muted-foreground)]">Loading...</div>
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
                  'transition-all cursor-pointer hover:shadow-md hover:bg-[var(--muted)]/50 active:scale-[0.99]',
                  status === 'expired' && 'opacity-60 border-[var(--error)]/30 bg-[var(--error-muted)]',
                  status === 'expiring-soon' && 'border-[var(--warning)]/30 bg-[var(--warning-muted)]'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--foreground)]">
                              {vial.peptide.name}
                            </span>
                            {vial.identifier && (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                ({vial.identifier})
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)]">
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
                        <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)] mt-2 pt-2 border-t border-[var(--border)]">
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
                        <div className="text-xs text-[var(--muted-foreground)] mt-2">
                          Reconstituted: {format(new Date(vial.dateReconstituted), 'MMM d, yyyy')}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Package className="w-12 h-12 mx-auto text-[var(--border)] mb-3" />
            <div className="text-[var(--muted-foreground)] mb-2">
              {typeFilter === 'all' ? 'No inventory' : `No ${typeFilter}s`}
            </div>
            <div className="text-sm text-[var(--muted-foreground)]">
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
