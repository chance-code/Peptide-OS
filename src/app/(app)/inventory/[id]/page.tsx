'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { Peptide, InventoryVial } from '@/types'

const AMOUNT_UNITS = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
  { value: 'IU', label: 'IU' },
]

interface VialWithPeptide extends InventoryVial {
  peptide: Peptide
}

export default function EditInventoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [peptides, setPeptides] = useState<Peptide[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [peptideId, setPeptideId] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [totalUnit, setTotalUnit] = useState('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [dateReceived, setDateReceived] = useState('')
  const [dateReconstituted, setDateReconstituted] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [remainingAmount, setRemainingAmount] = useState('')
  const [isExhausted, setIsExhausted] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchPeptides()
    fetchVial()
  }, [id])

  async function fetchPeptides() {
    try {
      const res = await fetch('/api/peptides')
      if (res.ok) {
        const data = await res.json()
        setPeptides(data)
      }
    } catch (error) {
      console.error('Error fetching peptides:', error)
    }
  }

  async function fetchVial() {
    try {
      const res = await fetch(`/api/inventory/${id}`)
      if (res.ok) {
        const vial: VialWithPeptide = await res.json()
        setPeptideId(vial.peptideId)
        setIdentifier(vial.identifier || '')
        setTotalAmount(vial.totalAmount.toString())
        setTotalUnit(vial.totalUnit)
        setDiluentVolume(vial.diluentVolume?.toString() || '')
        setDateReceived(vial.dateReceived ? format(new Date(vial.dateReceived), 'yyyy-MM-dd') : '')
        setDateReconstituted(vial.dateReconstituted ? format(new Date(vial.dateReconstituted), 'yyyy-MM-dd') : '')
        setExpirationDate(vial.expirationDate ? format(new Date(vial.expirationDate), 'yyyy-MM-dd') : '')
        setRemainingAmount(vial.remainingAmount?.toString() || '')
        setIsExhausted(vial.isExhausted)
        setNotes(vial.notes || '')
      } else {
        router.push('/inventory')
      }
    } catch (error) {
      console.error('Error fetching vial:', error)
      router.push('/inventory')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!peptideId || !totalAmount) return

    setIsSaving(true)

    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peptideId,
          identifier: identifier || null,
          totalAmount: parseFloat(totalAmount),
          totalUnit,
          diluentVolume: diluentVolume ? parseFloat(diluentVolume) : null,
          dateReceived: dateReceived || null,
          dateReconstituted: dateReconstituted || null,
          expirationDate: expirationDate || null,
          remainingAmount: remainingAmount ? parseFloat(remainingAmount) : null,
          isExhausted,
          notes: notes || null,
        }),
      })

      if (res.ok) {
        router.push('/inventory')
      }
    } catch (error) {
      console.error('Error updating vial:', error)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)

    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        router.push('/inventory')
        router.refresh()
      } else {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Delete failed:', error)
        alert('Failed to delete vial. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting vial:', error)
      alert('Failed to delete vial. Please try again.')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Calculate concentration preview
  const concentration =
    totalAmount && diluentVolume
      ? (parseFloat(totalAmount) / parseFloat(diluentVolume)).toFixed(4)
      : null

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="text-center py-8 text-slate-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-20 pt-[calc(1rem+env(safe-area-inset-top))]">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Edit Vial</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Peptide Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peptide</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={peptideId}
              onChange={(e) => setPeptideId(e.target.value)}
              options={peptides.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select a peptide"
            />
          </CardContent>
        </Card>

        {/* Vial Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vial Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Identifier (optional)"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g., Vial #1, Batch ABC"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Total Amount"
                  type="number"
                  step="any"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="e.g., 5"
                />
              </div>
              <div className="w-24">
                <Select
                  label="Unit"
                  value={totalUnit}
                  onChange={(e) => setTotalUnit(e.target.value)}
                  options={AMOUNT_UNITS}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reconstitution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reconstitution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Diluent Volume (ml)"
              type="number"
              step="any"
              value={diluentVolume}
              onChange={(e) => setDiluentVolume(e.target.value)}
              placeholder="e.g., 2"
            />
            {concentration && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500">Concentration</div>
                <div className="font-mono text-lg font-semibold text-slate-900">
                  {concentration} {totalUnit}/ml
                </div>
              </div>
            )}
            <Input
              label="Date Reconstituted"
              type="date"
              value={dateReconstituted}
              onChange={(e) => setDateReconstituted(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Tracking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Date Received"
              type="date"
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
            />
            <Input
              label="Expiration Date"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
            <Input
              label="Remaining Amount"
              type="number"
              step="any"
              value={remainingAmount}
              onChange={(e) => setRemainingAmount(e.target.value)}
              placeholder="Amount left in vial"
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isExhausted"
                checked={isExhausted}
                onChange={(e) => setIsExhausted(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="isExhausted" className="text-sm text-slate-700">
                Vial is exhausted (empty)
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 min-h-[80px]"
              placeholder="Storage location, supplier, etc."
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isSaving || !peptideId || !totalAmount}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Delete Section */}
        <Card className="border-red-200">
          <CardContent className="pt-4">
            {!showDeleteConfirm ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Vial
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 text-center">
                  Are you sure you want to delete this vial? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
