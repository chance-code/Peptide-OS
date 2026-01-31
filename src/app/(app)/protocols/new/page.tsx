'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Lightbulb } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getReconstitutionDefaults, getRecommendedDiluent } from '@/lib/peptide-reference'
import type { Peptide, DayOfWeek } from '@/types'

const DOSE_UNITS = [
  { value: 'mcg', label: 'mcg' },
  { value: 'mg', label: 'mg' },
  { value: 'IU', label: 'IU' },
]

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom Days' },
]

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

export default function NewProtocolPage() {
  const router = useRouter()
  const { currentUserId } = useAppStore()

  const [peptides, setPeptides] = useState<Peptide[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewPeptide, setShowNewPeptide] = useState(false)

  // Form state
  const [peptideId, setPeptideId] = useState('')
  const [newPeptideName, setNewPeptideName] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState('')
  const [indefinite, setIndefinite] = useState(false)
  const [frequency, setFrequency] = useState('daily')
  const [customDays, setCustomDays] = useState<DayOfWeek[]>([])
  const [doseAmount, setDoseAmount] = useState('')
  const [doseUnit, setDoseUnit] = useState('mcg')
  const [timing, setTiming] = useState('')
  const [notes, setNotes] = useState('')

  // Reconstitution state
  const [vialAmount, setVialAmount] = useState('')
  const [vialUnit, setVialUnit] = useState('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [showReconstitution, setShowReconstitution] = useState(false)
  const [recommendation, setRecommendation] = useState<{
    vialUnit: string
    doseAmount: number
    doseUnit: string
    doseMin: number
    doseMax: number
    typicalVialSizes: { amount: number; unit: string }[]
    peptideName: string
  } | null>(null)

  useEffect(() => {
    fetchPeptides()
  }, [])

  // Check for recommendations when peptide is selected
  useEffect(() => {
    if (peptideId) {
      const selectedPeptide = peptides.find(p => p.id === peptideId)
      if (selectedPeptide) {
        checkForRecommendation(selectedPeptide.name)
      }
    } else {
      setRecommendation(null)
    }
  }, [peptideId, peptides])

  function checkForRecommendation(peptideName: string) {
    const defaults = getReconstitutionDefaults(peptideName)
    if (defaults) {
      setRecommendation({ ...defaults, peptideName })
    } else {
      setRecommendation(null)
    }
  }

  function applyRecommendation() {
    if (!recommendation) return
    setDoseAmount(recommendation.doseAmount.toString())
    setDoseUnit(recommendation.doseUnit)
    setVialUnit(recommendation.vialUnit)
    setShowReconstitution(true) // Auto-expand the section
    setRecommendation(null) // Clear after applying
  }

  // Auto-suggest BAC water when vial amount changes
  useEffect(() => {
    if (vialAmount && peptideId) {
      const selectedPeptide = peptides.find(p => p.id === peptideId)
      if (selectedPeptide) {
        const recommendedDiluent = getRecommendedDiluent(selectedPeptide.name, parseFloat(vialAmount), vialUnit)
        if (recommendedDiluent && !diluentVolume) {
          setDiluentVolume(recommendedDiluent.toString())
        }
      }
    }
  }, [vialAmount, vialUnit, peptideId, peptides])

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
        // Check for recommendations for the new peptide
        checkForRecommendation(newPeptideName.trim())
        setNewPeptideName('')
      }
    } catch (error) {
      console.error('Error creating peptide:', error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!currentUserId || !peptideId || !doseAmount) return

    setIsLoading(true)

    try {
      const res = await fetch('/api/protocols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          peptideId,
          startDate,
          endDate: indefinite ? null : endDate || null,
          frequency,
          customDays: frequency === 'custom' ? customDays : null,
          doseAmount: parseFloat(doseAmount),
          doseUnit,
          timing: timing || null,
          notes: notes || null,
          // Reconstitution info
          vialAmount: vialAmount ? parseFloat(vialAmount) : null,
          vialUnit: vialAmount ? vialUnit : null,
          diluentVolume: diluentVolume ? parseFloat(diluentVolume) : null,
        }),
      })

      if (res.ok) {
        router.push('/protocols')
      }
    } catch (error) {
      console.error('Error creating protocol:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function toggleCustomDay(day: DayOfWeek) {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  return (
    <div className="p-4 pb-20">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">New Protocol</h2>

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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-blue-900 text-sm">
                  Info for {recommendation.peptideName}
                </div>
                <div className="text-blue-700 text-sm mt-1">
                  Typical dose: {recommendation.doseMin}-{recommendation.doseMax} {recommendation.doseUnit}
                </div>
                <div className="text-blue-600 text-xs mt-1">
                  Common vial sizes: {recommendation.typicalVialSizes.map(v => `${v.amount}${v.unit}`).join(', ')}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={applyRecommendation}
                >
                  Use Typical Dose
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Dosing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dosing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Amount"
                  type="number"
                  step="any"
                  value={doseAmount}
                  onChange={(e) => setDoseAmount(e.target.value)}
                  placeholder="e.g., 100"
                />
              </div>
              <div className="w-24">
                <Select
                  label="Unit"
                  value={doseUnit}
                  onChange={(e) => setDoseUnit(e.target.value)}
                  options={DOSE_UNITS}
                />
              </div>
            </div>
            <Input
              label="Timing (optional)"
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              placeholder="e.g., morning, before bed"
            />
          </CardContent>
        </Card>

        {/* Reconstitution */}
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowReconstitution(!showReconstitution)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-base">
                Reconstitution Info {!showReconstitution && '(optional)'}
              </CardTitle>
              <span className="text-slate-400 text-sm">
                {showReconstitution ? '−' : '+'}
              </span>
            </button>
          </CardHeader>
          {showReconstitution && (
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    label="Vial Amount"
                    type="number"
                    step="any"
                    value={vialAmount}
                    onChange={(e) => setVialAmount(e.target.value)}
                    placeholder="e.g., 10"
                  />
                </div>
                <div className="w-24">
                  <Select
                    label="Unit"
                    value={vialUnit}
                    onChange={(e) => setVialUnit(e.target.value)}
                    options={DOSE_UNITS}
                  />
                </div>
              </div>
              <Input
                label="BAC Water (mL)"
                type="number"
                step="any"
                value={diluentVolume}
                onChange={(e) => setDiluentVolume(e.target.value)}
                placeholder="e.g., 2"
              />
              {vialAmount && diluentVolume && doseAmount && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-sm text-green-700">
                    <strong>Concentration:</strong>{' '}
                    {(parseFloat(vialAmount) / parseFloat(diluentVolume)).toFixed(2)} {vialUnit}/mL
                  </div>
                  <div className="text-sm text-green-700 mt-1">
                    <strong>Per dose:</strong>{' '}
                    {(() => {
                      const concentration = parseFloat(vialAmount) / parseFloat(diluentVolume)
                      let doseInVialUnits = parseFloat(doseAmount)
                      // Convert dose to vial units if different
                      if (doseUnit === 'mcg' && vialUnit === 'mg') {
                        doseInVialUnits = doseInVialUnits / 1000
                      } else if (doseUnit === 'mg' && vialUnit === 'mcg') {
                        doseInVialUnits = doseInVialUnits * 1000
                      }
                      const volumeMl = doseInVialUnits / concentration
                      const units = Math.round(volumeMl * 100)
                      return `${units} units (${volumeMl.toFixed(3)} mL)`
                    })()}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="indefinite"
                checked={indefinite}
                onChange={(e) => setIndefinite(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="indefinite" className="text-sm text-slate-700">
                Run indefinitely (no end date)
              </label>
            </div>

            {!indefinite && (
              <Input
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            )}

            <Select
              label="Frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              options={FREQUENCIES}
            />

            {frequency === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Days
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleCustomDay(day.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        customDays.includes(day.value)
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              placeholder="Any additional notes..."
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
            disabled={isLoading || !peptideId || !doseAmount}
          >
            {isLoading ? 'Creating...' : 'Create Protocol'}
          </Button>
        </div>
      </form>
    </div>
  )
}
