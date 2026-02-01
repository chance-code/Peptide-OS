'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import { Lightbulb } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getReconstitutionDefaults, getRecommendedDiluent } from '@/lib/peptide-reference'
import type { Peptide, Protocol } from '@/types'

interface ProtocolWithReconstitution extends Protocol {
  peptide: Peptide
}

const AMOUNT_UNITS = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
  { value: 'IU', label: 'IU' },
]

export default function NewInventoryPage() {
  const router = useRouter()
  const { currentUserId } = useAppStore()

  const [peptides, setPeptides] = useState<Peptide[]>([])
  const [protocols, setProtocols] = useState<ProtocolWithReconstitution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewPeptide, setShowNewPeptide] = useState(false)
  const [recommendation, setRecommendation] = useState<{
    source: 'protocol' | 'reference'
    vialUnit: string
    typicalVialSizes?: { amount: number; unit: string }[]
    peptideName: string
  } | null>(null)

  // Form state
  const [peptideId, setPeptideId] = useState('')
  const [newPeptideName, setNewPeptideName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [totalUnit, setTotalUnit] = useState('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [dateReceived, setDateReceived] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [dateReconstituted, setDateReconstituted] = useState('')
  // Default expiration to 28 days from today
  const [expirationDate, setExpirationDate] = useState(format(addDays(new Date(), 28), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchPeptides()
    if (currentUserId) {
      fetchProtocols()
    }
  }, [currentUserId])

  // Check for recommendations when peptide is selected
  useEffect(() => {
    if (peptideId) {
      const selectedPeptide = peptides.find(p => p.id === peptideId)
      if (selectedPeptide) {
        checkForRecommendation(selectedPeptide)
      }
    } else {
      setRecommendation(null)
    }
  }, [peptideId, peptides, protocols])

  function checkForRecommendation(peptide: Peptide) {
    // First check if user has a protocol with reconstitution info for this peptide
    const userProtocol = protocols.find(
      p => p.peptideId === peptide.id && p.vialAmount && p.diluentVolume
    )

    if (userProtocol) {
      setRecommendation({
        source: 'protocol',
        vialUnit: userProtocol.vialUnit || 'mg',
        peptideName: peptide.name,
      })
      // Auto-fill from protocol since user already set this up
      setTotalAmount(userProtocol.vialAmount!.toString())
      setTotalUnit(userProtocol.vialUnit || 'mg')
      setDiluentVolume(userProtocol.diluentVolume!.toString())
      return
    }

    // Otherwise check reference database for info
    const defaults = getReconstitutionDefaults(peptide.name)
    if (defaults) {
      setRecommendation({
        source: 'reference',
        vialUnit: defaults.vialUnit,
        typicalVialSizes: defaults.typicalVialSizes,
        peptideName: peptide.name,
      })
      // Don't auto-fill vial amount - user enters their own
      setTotalUnit(defaults.vialUnit)
      return
    }

    setRecommendation(null)
  }

  // Auto-suggest BAC water when vial amount changes
  useEffect(() => {
    if (totalAmount && peptideId && !diluentVolume) {
      const selectedPeptide = peptides.find(p => p.id === peptideId)
      if (selectedPeptide) {
        const recommendedDiluent = getRecommendedDiluent(selectedPeptide.name, parseFloat(totalAmount), totalUnit)
        if (recommendedDiluent) {
          setDiluentVolume(recommendedDiluent.toString())
        }
      }
    }
  }, [totalAmount, totalUnit, peptideId, peptides])

  async function fetchProtocols() {
    try {
      const res = await fetch(`/api/protocols?userId=${currentUserId}`)
      if (res.ok) {
        const data = await res.json()
        setProtocols(data)
      }
    } catch (error) {
      console.error('Error fetching protocols:', error)
    }
  }

  // Auto-update expiration when reconstitution date changes
  useEffect(() => {
    if (dateReconstituted) {
      const reconDate = new Date(dateReconstituted)
      setExpirationDate(format(addDays(reconDate, 28), 'yyyy-MM-dd'))
    }
  }, [dateReconstituted])

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

  async function handleCreatePeptide() {
    if (!newPeptideName.trim()) return

    try {
      const res = await fetch('/api/peptides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPeptideName.trim() }),
      })

      if (res.ok) {
        const peptide = await res.json()
        setPeptides([...peptides, peptide])
        setPeptideId(peptide.id)
        setShowNewPeptide(false)
        setNewPeptideName('')
      }
    } catch (error) {
      console.error('Error creating peptide:', error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!currentUserId || !peptideId || !totalAmount) return

    setIsLoading(true)

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          peptideId,
          identifier: identifier || null,
          totalAmount: parseFloat(totalAmount),
          totalUnit,
          diluentVolume: diluentVolume ? parseFloat(diluentVolume) : null,
          dateReceived: dateReceived || null,
          dateReconstituted: dateReconstituted || null,
          expirationDate: expirationDate || null,
          notes: notes || null,
        }),
      })

      if (res.ok) {
        router.push('/inventory')
      }
    } catch (error) {
      console.error('Error creating vial:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate concentration preview
  const concentration =
    totalAmount && diluentVolume
      ? (parseFloat(totalAmount) / parseFloat(diluentVolume)).toFixed(4)
      : null

  return (
    <div className="p-4 pb-48">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Add Vial</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Peptide Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peptide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showNewPeptide ? (
              <>
                <Select
                  value={peptideId}
                  onChange={(e) => setPeptideId(e.target.value)}
                  options={peptides.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Select a peptide"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewPeptide(true)}
                >
                  + Add new peptide
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <Input
                  value={newPeptideName}
                  onChange={(e) => setNewPeptideName(e.target.value)}
                  placeholder="Peptide name"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowNewPeptide(false)
                      setNewPeptideName('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreatePeptide}
                    disabled={!newPeptideName.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommendation Banner */}
        {recommendation && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-blue-900 dark:text-blue-100 text-sm">
                  {recommendation.source === 'protocol'
                    ? `Using settings from your ${recommendation.peptideName} protocol`
                    : `Info for ${recommendation.peptideName}`}
                </div>
                {recommendation.source === 'reference' && recommendation.typicalVialSizes && (
                  <div className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                    Common vial sizes: {recommendation.typicalVialSizes.map(v => `${v.amount}${v.unit}`).join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
              <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="text-sm text-slate-500 dark:text-slate-400">Concentration</div>
                <div className="font-mono text-lg font-semibold text-slate-900 dark:text-white">
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

        {/* Dates */}
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tip: Most reconstituted peptides expire 28 days after reconstitution when
              refrigerated.
            </p>
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
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 min-h-[80px] placeholder:text-slate-400 dark:placeholder:text-slate-500"
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
            disabled={isLoading || !peptideId || !totalAmount}
          >
            {isLoading ? 'Adding...' : 'Add Vial'}
          </Button>
        </div>
      </form>
    </div>
  )
}
