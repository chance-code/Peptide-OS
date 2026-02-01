'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Lightbulb, History } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getReconstitutionDefaults, getRecommendedDiluent } from '@/lib/peptide-reference'
import { SyringeVisual } from '@/components/syringe-visual'
import type { Peptide, DayOfWeek, Protocol } from '@/types'

interface ProtocolWithPeptide extends Protocol {
  peptide: Peptide
}

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
  const [existingProtocols, setExistingProtocols] = useState<ProtocolWithPeptide[]>([])
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
    source: 'previous' | 'reference'
    vialUnit: string
    doseAmount: number
    doseUnit: string
    doseMin?: number
    doseMax?: number
    typicalVialSizes?: { amount: number; unit: string }[]
    typicalDurationWeeks?: number | null
    peptideName: string
    // Previous protocol details
    vialAmount?: number
    diluentVolume?: number
  } | null>(null)

  useEffect(() => {
    fetchPeptides()
    if (currentUserId) {
      fetchExistingProtocols()
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
  }, [peptideId, peptides, existingProtocols])

  async function fetchExistingProtocols() {
    try {
      const res = await fetch(`/api/protocols?userId=${currentUserId}`)
      if (res.ok) {
        const data = await res.json()
        setExistingProtocols(data)
      }
    } catch (error) {
      console.error('Error fetching protocols:', error)
    }
  }

  function checkForRecommendation(peptide: Peptide) {
    // First check if user has a previous protocol for this peptide
    const previousProtocol = existingProtocols.find(p => p.peptideId === peptide.id)

    if (previousProtocol) {
      // Use user's previous settings
      setRecommendation({
        source: 'previous',
        peptideName: peptide.name,
        doseAmount: previousProtocol.doseAmount,
        doseUnit: previousProtocol.doseUnit,
        vialUnit: previousProtocol.vialUnit || 'mg',
        vialAmount: previousProtocol.vialAmount || undefined,
        diluentVolume: previousProtocol.diluentVolume || undefined,
      })
      // Auto-fill from previous protocol
      if (!doseAmount) {
        setDoseAmount(previousProtocol.doseAmount.toString())
        setDoseUnit(previousProtocol.doseUnit)
      }
      if (previousProtocol.vialAmount) {
        setVialAmount(previousProtocol.vialAmount.toString())
        setVialUnit(previousProtocol.vialUnit || 'mg')
      }
      if (previousProtocol.diluentVolume) {
        setDiluentVolume(previousProtocol.diluentVolume.toString())
      }
      if (previousProtocol.vialAmount && previousProtocol.diluentVolume) {
        setShowReconstitution(true)
      }
      return
    }

    // Fall back to reference database
    const defaults = getReconstitutionDefaults(peptide.name)
    if (defaults) {
      setRecommendation({
        source: 'reference',
        ...defaults,
        peptideName: peptide.name
      })
      // Auto-fill dose and expand reconstitution section
      if (!doseAmount) {
        setDoseAmount(defaults.doseAmount.toString())
        setDoseUnit(defaults.doseUnit)
      }
      setVialUnit(defaults.vialUnit)
      setShowReconstitution(true)

      // Auto-populate end date if peptide has a typical duration
      if (defaults.typicalDurationWeeks !== undefined) {
        if (defaults.typicalDurationWeeks === null) {
          // Ongoing protocol - set indefinite
          setIndefinite(true)
          setEndDate('')
        } else {
          // Fixed duration - calculate end date
          setIndefinite(false)
          const start = new Date(startDate)
          const end = new Date(start)
          end.setDate(end.getDate() + defaults.typicalDurationWeeks * 7)
          setEndDate(format(end, 'yyyy-MM-dd'))
        }
      }
    } else {
      setRecommendation(null)
    }
  }

  // Auto-suggest BAC water when vial amount changes
  useEffect(() => {
    if (vialAmount && peptideId) {
      const selectedPeptide = peptides.find(p => p.id === peptideId)
      if (selectedPeptide) {
        const recommendedDiluent = getRecommendedDiluent(selectedPeptide.name, parseFloat(vialAmount), vialUnit)
        if (recommendedDiluent) {
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
        setNewPeptideName('')
        // Note: checkForRecommendation will be called by the useEffect
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
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">New Protocol</h2>

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
        {recommendation && recommendation.source === 'previous' && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <History className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-green-900 dark:text-green-100 text-sm">
                  Using your previous {recommendation.peptideName} settings
                </div>
                <div className="text-green-700 dark:text-green-300 text-sm mt-1">
                  Your dose: {recommendation.doseAmount} {recommendation.doseUnit}
                  {recommendation.vialAmount && recommendation.diluentVolume && (
                    <span className="text-green-600 dark:text-green-400 ml-2">
                      ({recommendation.vialAmount}{recommendation.vialUnit} + {recommendation.diluentVolume}mL)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {recommendation && recommendation.source === 'reference' && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-blue-900 dark:text-blue-100 text-sm">
                  {recommendation.peptideName} - Enter your vial size below
                </div>
                <div className="text-blue-700 dark:text-blue-300 text-sm mt-1">
                  Recommended dose: {recommendation.doseAmount} {recommendation.doseUnit}
                </div>
                {recommendation.typicalVialSizes && (
                  <div className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                    Common vial sizes: {recommendation.typicalVialSizes.map(v => `${v.amount}${v.unit}`).join(', ')}
                  </div>
                )}
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
              <p className="text-sm text-slate-500 dark:text-slate-400">Enter your vial size - BAC water will be suggested automatically</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    label="Your Vial Size"
                    type="number"
                    step="any"
                    value={vialAmount}
                    onChange={(e) => setVialAmount(e.target.value)}
                    placeholder="e.g., 5, 10"
                    autoFocus
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
                label="BAC Water (mL) - auto-suggested"
                type="number"
                step="any"
                value={diluentVolume}
                onChange={(e) => setDiluentVolume(e.target.value)}
                placeholder="auto-filled when you enter vial size"
              />
              {vialAmount && diluentVolume && doseAmount && (
                (() => {
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
                  const dosesPerVial = Math.floor(parseFloat(vialAmount) / doseInVialUnits)
                  const concentrationStr = `${concentration.toFixed(2)} ${vialUnit}/mL`

                  return (
                    <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="text-green-800 dark:text-green-100 font-medium mb-3">Your Reconstitution Summary</div>

                      {/* Key Info */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-2 text-center">
                          <div className="text-slate-500 dark:text-slate-400 text-xs">Concentration</div>
                          <div className="font-semibold text-slate-900 dark:text-white">{concentrationStr}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-2 text-center">
                          <div className="text-slate-500 dark:text-slate-400 text-xs">Doses per vial</div>
                          <div className="font-semibold text-slate-900 dark:text-white">~{dosesPerVial}</div>
                        </div>
                      </div>

                      {/* Syringe Visual */}
                      <SyringeVisual
                        units={units}
                        dose={`${doseAmount}${doseUnit}`}
                        concentration={concentrationStr}
                      />
                    </div>
                  )
                })()
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
                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              <label htmlFor="indefinite" className="text-sm text-slate-700 dark:text-slate-300">
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 min-h-[80px] placeholder:text-slate-400 dark:placeholder:text-slate-500"
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
