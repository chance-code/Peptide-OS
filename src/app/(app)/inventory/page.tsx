'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { Plus, Package, AlertTriangle, Clock, Droplet } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { InventoryVial, Peptide } from '@/types'

interface VialWithPeptide extends InventoryVial {
  peptide: Peptide
}

export default function InventoryPage() {
  const { currentUserId } = useAppStore()
  const [vials, setVials] = useState<VialWithPeptide[]>([])
  const [showExpired, setShowExpired] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const fetchInventory = useCallback(async () => {
    if (!currentUserId) return

    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        userId: currentUserId,
        includeExpired: showExpired.toString(),
        includeExhausted: 'false',
      })
      const res = await fetch(`/api/inventory?${params}`)
      if (res.ok) {
        const data = await res.json()
        setVials(data)
      }
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId, showExpired])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  function getExpirationStatus(vial: VialWithPeptide) {
    if (vial.isExpired) return 'expired'
    if (!vial.expirationDate) return 'unknown'

    const daysUntilExpiry = differenceInDays(new Date(vial.expirationDate), new Date())
    if (daysUntilExpiry <= 7) return 'expiring-soon'
    return 'valid'
  }

  const activeVials = vials.filter((v) => !v.isExpired && !v.isExhausted)
  const expiredVials = vials.filter((v) => v.isExpired)

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-slate-900">Inventory</h2>
        <Link href="/inventory/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </Link>
      </div>

      {/* Summary */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-lg p-3 text-center border border-slate-100">
            <div className="text-2xl font-bold text-slate-900">{activeVials.length}</div>
            <div className="text-xs text-slate-500">Active</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
            <div className="text-2xl font-bold text-amber-700">
              {activeVials.filter((v) => getExpirationStatus(v) === 'expiring-soon').length}
            </div>
            <div className="text-xs text-amber-600">Expiring</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
            <div className="text-2xl font-bold text-red-700">{expiredVials.length}</div>
            <div className="text-xs text-red-600">Expired</div>
          </div>
        </div>
      )}

      {/* Toggle Expired */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          id="showExpired"
          checked={showExpired}
          onChange={(e) => setShowExpired(e.target.checked)}
          className="rounded border-slate-300"
        />
        <label htmlFor="showExpired" className="text-sm text-slate-700">
          Show expired vials
        </label>
      </div>

      {/* Vials List */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500">Loading...</div>
      ) : vials.length > 0 ? (
        <div className="space-y-3">
          {vials.map((vial) => {
            const status = getExpirationStatus(vial)
            const daysUntilExpiry = vial.expirationDate
              ? differenceInDays(new Date(vial.expirationDate), new Date())
              : null

            return (
              <Link key={vial.id} href={`/inventory/${vial.id}`}>
              <Card
                className={cn(
                  'transition-all cursor-pointer hover:shadow-md',
                  status === 'expired' && 'opacity-60 border-red-200 bg-red-50/30',
                  status === 'expiring-soon' && 'border-amber-200 bg-amber-50/30'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {vial.peptide.name}
                        </span>
                        {vial.identifier && (
                          <span className="text-xs text-slate-500">
                            ({vial.identifier})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500">
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
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
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
                    <div className="text-xs text-slate-400 mt-2">
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
            <Package className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <div className="text-slate-400 mb-2">No inventory</div>
            <div className="text-sm text-slate-500">
              Add your first vial to track your inventory
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
