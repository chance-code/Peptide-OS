'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Lightbulb, History, Syringe, Pill, Camera, X, Loader2, Plus, CheckCircle, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getReconstitutionDefaults, getRecommendedDiluent } from '@/lib/peptide-reference'
import { SyringeVisual } from '@/components/syringe-visual'
import type { Peptide, DayOfWeek, Protocol, ItemType } from '@/types'

interface ProtocolWithPeptide extends Protocol {
  peptide: Peptide
}

const DOSE_UNITS = [
  { value: 'mcg', label: 'mcg' },
  { value: 'mg', label: 'mg' },
  { value: 'IU', label: 'IU' },
]

const SERVING_UNITS = [
  { value: 'capsule', label: 'Capsule(s)' },
  { value: 'tablet', label: 'Tablet(s)' },
  { value: 'softgel', label: 'Softgel(s)' },
  { value: 'scoop', label: 'Scoop(s)' },
  { value: 'drop', label: 'Drop(s)' },
  { value: 'spray', label: 'Spray(s)' },
]

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'every_other_day', label: 'Every Other Day' },
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

const TIMING_PRESETS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'before bed', label: 'Before Bed' },
]

export default function NewProtocolPage() {
  const router = useRouter()
  const { currentUserId } = useAppStore()

  const [peptides, setPeptides] = useState<Peptide[]>([])
  const [existingProtocols, setExistingProtocols] = useState<ProtocolWithPeptide[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewPeptide, setShowNewPeptide] = useState(false)

  // Type selector state
  const [itemType, setItemType] = useState<ItemType>('peptide')

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
  const [timingMode, setTimingMode] = useState<'single' | 'twice-daily' | 'custom'>('single')
  const [selectedTimings, setSelectedTimings] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  // Supplement serving state
  const [servingSize, setServingSize] = useState('')
  const [servingUnit, setServingUnit] = useState('capsule')

  // Reconstitution state
  const [vialAmount, setVialAmount] = useState('')
  const [vialUnit, setVialUnit] = useState('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [showReconstitution, setShowReconstitution] = useState(false)

  // Supplement scan state (multi-photo)
  const [scanImages, setScanImages] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    name: string | null
    brand: string | null
    servingSize: number | null
    servingUnit: string | null
    totalCount: number | null
    dosage: string | null
    confidence: 'high' | 'medium' | 'low'
  } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Peptide scan state
  const [peptideScanResult, setPeptideScanResult] = useState<{
    peptideName: string | null
    amount: number | null
    unit: string | null
    confidence: 'high' | 'medium' | 'low'
  } | null>(null)
  const peptideFileInputRef = useRef<HTMLInputElement>(null)

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
        body: JSON.stringify({ name: newPeptideName.trim(), type: itemType }),
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

    // Validation
    if (!currentUserId || !peptideId) return
    if (itemType === 'peptide' && !doseAmount) return
    if (itemType === 'supplement' && !servingSize) return

    setIsLoading(true)

    try {
      // Determine timing/timings based on mode
      let timingValue: string | null = null
      let timingsValue: string | null = null

      if (itemType === 'supplement' && timingMode === 'twice-daily') {
        // Multi-timing: store as JSON array in timings field
        timingsValue = JSON.stringify(selectedTimings)
      } else {
        // Single timing
        timingValue = timing || null
      }

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
          // For peptides: use doseAmount/doseUnit
          // For supplements: store servingSize in doseAmount for compatibility
          doseAmount: itemType === 'peptide' ? parseFloat(doseAmount) : parseInt(servingSize),
          doseUnit: itemType === 'peptide' ? doseUnit : servingUnit,
          timing: timingValue,
          timings: timingsValue,
          notes: notes || null,
          // Reconstitution info (peptides only)
          vialAmount: itemType === 'peptide' && vialAmount ? parseFloat(vialAmount) : null,
          vialUnit: itemType === 'peptide' && vialAmount ? vialUnit : null,
          diluentVolume: itemType === 'peptide' && diluentVolume ? parseFloat(diluentVolume) : null,
          // Serving info (supplements only)
          servingSize: itemType === 'supplement' ? parseInt(servingSize) : null,
          servingUnit: itemType === 'supplement' ? servingUnit : null,
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

  // Handle photo capture for supplement scanning
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Convert files to base64
    const newImages: string[] = []
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      newImages.push(base64)
    }

    setScanImages((prev) => [...prev, ...newImages])
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function removeImage(index: number) {
    setScanImages((prev) => prev.filter((_, i) => i !== index))
    setScanResult(null)
    setScanError(null)
  }

  async function handleScanImages() {
    if (scanImages.length === 0) return

    setIsScanning(true)
    setScanError(null)
    setScanResult(null)

    try {
      const res = await fetch('/api/supplements/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: scanImages }),
      })

      if (!res.ok) {
        throw new Error('Failed to analyze images')
      }

      const result = await res.json()
      setScanResult(result)

      // Auto-populate form fields
      if (result.name) {
        // Check if supplement already exists
        const existingSupplement = peptides.find(
          (p) => p.name.toLowerCase() === result.name.toLowerCase() && (p.type || 'peptide') === 'supplement'
        )

        if (existingSupplement) {
          setPeptideId(existingSupplement.id)
        } else {
          // Create new supplement
          setNewPeptideName(result.name)
          setShowNewPeptide(true)
        }
      }

      if (result.servingSize) {
        setServingSize(result.servingSize.toString())
      }

      if (result.servingUnit) {
        // Map to our serving units
        const unitMap: Record<string, string> = {
          capsule: 'capsule',
          capsules: 'capsule',
          tablet: 'tablet',
          tablets: 'tablet',
          softgel: 'softgel',
          softgels: 'softgel',
          scoop: 'scoop',
          scoops: 'scoop',
          drop: 'drop',
          drops: 'drop',
          spray: 'spray',
          sprays: 'spray',
          gummy: 'capsule', // Map gummy to capsule as closest option
          gummies: 'capsule',
        }
        const mappedUnit = unitMap[result.servingUnit.toLowerCase()] || 'capsule'
        setServingUnit(mappedUnit)
      }
    } catch (error) {
      console.error('Scan error:', error)
      setScanError('Failed to analyze images. Please try again or enter manually.')
    } finally {
      setIsScanning(false)
    }
  }

  // Handle peptide vial scanning
  async function handlePeptideImageCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanError(null)
    setPeptideScanResult(null)
    setIsScanning(true)

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      if (!res.ok) {
        throw new Error('Failed to analyze image')
      }

      const result = await res.json()
      setPeptideScanResult(result)

      // Auto-populate form fields
      if (result.peptideName) {
        const matchingPeptide = peptides.find(
          p => p.name.toLowerCase().replace(/[-\s]/g, '') ===
               result.peptideName.toLowerCase().replace(/[-\s]/g, '') &&
               (p.type || 'peptide') === 'peptide'
        )
        if (matchingPeptide) {
          setPeptideId(matchingPeptide.id)
        } else {
          setShowNewPeptide(true)
          setNewPeptideName(result.peptideName)
        }
      }

      if (result.amount) {
        setVialAmount(result.amount.toString())
        setShowReconstitution(true)
      }

      if (result.unit) {
        setVialUnit(result.unit)
      }
    } catch (error) {
      console.error('Scan error:', error)
      setScanError('Failed to analyze image. Please try again or enter manually.')
    } finally {
      setIsScanning(false)
      if (peptideFileInputRef.current) {
        peptideFileInputRef.current.value = ''
      }
    }
  }

  // Filter peptides by selected type
  const filteredPeptides = peptides.filter(p => (p.type || 'peptide') === itemType)

  return (
    <div className="p-4 pb-48">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">New Protocol</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type Selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setItemType('peptide')
              setPeptideId('')
              setShowNewPeptide(false)
              setScanImages([])
              setScanResult(null)
              setScanError(null)
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all ${
              itemType === 'peptide'
                ? 'bg-[var(--accent)] text-white shadow-lg'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
            }`}
          >
            <Syringe className="w-4 h-4" />
            Peptide
          </button>
          <button
            type="button"
            onClick={() => {
              setItemType('supplement')
              setPeptideId('')
              setShowNewPeptide(false)
              setShowReconstitution(false)
              setPeptideScanResult(null)
              setScanError(null)
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all ${
              itemType === 'supplement'
                ? 'bg-[var(--success)] text-white shadow-lg'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
            }`}
          >
            <Pill className="w-4 h-4" />
            Supplement
          </button>
        </div>

        {/* Photo Scan - Peptides */}
        {itemType === 'peptide' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Scan Vial Label (optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Take a photo of your peptide vial to auto-fill peptide name and vial size.
              </p>

              <input
                ref={peptideFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePeptideImageCapture}
                className="hidden"
              />

              <Button
                type="button"
                variant="secondary"
                onClick={() => peptideFileInputRef.current?.click()}
                disabled={isScanning}
                className="w-full"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo of Vial
                  </>
                )}
              </Button>

              {peptideScanResult && (
                <div className={`rounded-lg p-3 ${
                  peptideScanResult.confidence === 'high'
                    ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                    : 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
                }`}>
                  <div className="flex items-start gap-2">
                    {peptideScanResult.confidence === 'high' ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 text-sm">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {peptideScanResult.peptideName || 'Unknown peptide'}
                      </div>
                      {peptideScanResult.amount && (
                        <div className="text-slate-600 dark:text-slate-300">
                          {peptideScanResult.amount} {peptideScanResult.unit || 'mg'} vial
                        </div>
                      )}
                      {peptideScanResult.confidence !== 'high' && (
                        <div className="text-xs mt-1 text-slate-500 dark:text-slate-400">
                          Review and edit the details below if needed
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {itemType === 'peptide' && scanError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                  {scanError}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Photo Scan - Supplements only */}
        {itemType === 'supplement' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Scan Label (optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Take photos of your supplement bottle to auto-fill the form. Add front and back for best results.
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
              />

              {/* Image previews */}
              {scanImages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {scanImages.map((img, index) => (
                    <div key={index} className="relative">
                      <img
                        src={img}
                        alt={`Scan ${index + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {scanImages.length < 4 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {scanImages.length === 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleScanImages}
                    disabled={isScanning}
                    className="flex-1"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 mr-2" />
                        Analyze {scanImages.length} Photo{scanImages.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Scan result */}
              {scanResult && (
                <div className={`rounded-lg p-3 ${
                  scanResult.confidence === 'high'
                    ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                    : scanResult.confidence === 'medium'
                      ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
                      : 'bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800'
                }`}>
                  <div className="flex items-start gap-2">
                    {scanResult.confidence === 'high' ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                        scanResult.confidence === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-orange-600 dark:text-orange-400'
                      }`} />
                    )}
                    <div className="flex-1 text-sm">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {scanResult.name || 'Unknown supplement'}
                        {scanResult.brand && <span className="text-slate-500 dark:text-slate-400"> by {scanResult.brand}</span>}
                      </div>
                      {scanResult.servingSize && scanResult.servingUnit && (
                        <div className="text-slate-600 dark:text-slate-300">
                          {scanResult.servingSize} {scanResult.servingUnit}{scanResult.servingSize > 1 ? 's' : ''} per serving
                        </div>
                      )}
                      {scanResult.dosage && (
                        <div className="text-slate-500 dark:text-slate-400">{scanResult.dosage}</div>
                      )}
                      {scanResult.confidence !== 'high' && (
                        <div className="text-xs mt-1 text-slate-500 dark:text-slate-400">
                          Review and edit the details below if needed
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Scan error */}
              {scanError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                  {scanError}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Item Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{itemType === 'peptide' ? 'Peptide' : 'Supplement'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showNewPeptide ? (
              <>
                <Select
                  value={peptideId}
                  onChange={(e) => setPeptideId(e.target.value)}
                  options={filteredPeptides.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder={itemType === 'peptide' ? 'Select a peptide' : 'Select a supplement'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewPeptide(true)}
                >
                  + Add new {itemType === 'peptide' ? 'peptide' : 'supplement'}
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <Input
                  value={newPeptideName}
                  onChange={(e) => setNewPeptideName(e.target.value)}
                  placeholder={itemType === 'peptide' ? 'Peptide name' : 'Supplement name'}
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

        {/* Dosing (Peptide) / Serving (Supplement) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{itemType === 'peptide' ? 'Dosing' : 'Serving'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {itemType === 'peptide' ? (
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
            ) : (
              <div className="flex gap-3">
                <div className="w-24">
                  <Input
                    label="Count"
                    type="number"
                    step="1"
                    min="1"
                    value={servingSize}
                    onChange={(e) => setServingSize(e.target.value)}
                    placeholder="e.g., 2"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    label="Unit"
                    value={servingUnit}
                    onChange={(e) => setServingUnit(e.target.value)}
                    options={SERVING_UNITS}
                  />
                </div>
              </div>
            )}
            {/* Timing - different UI for peptides vs supplements */}
            {itemType === 'peptide' ? (
              <Input
                label="Timing (optional)"
                value={timing}
                onChange={(e) => setTiming(e.target.value)}
                placeholder="e.g., morning, before bed"
              />
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  When to take
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTimingMode('single')
                      setSelectedTimings([])
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      timingMode === 'single'
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                    }`}
                  >
                    Once Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimingMode('twice-daily')
                      setSelectedTimings(['morning', 'night'])
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      timingMode === 'twice-daily'
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                    }`}
                  >
                    Twice Daily
                  </button>
                </div>
                {timingMode === 'single' && (
                  <Select
                    value={timing}
                    onChange={(e) => setTiming(e.target.value)}
                    options={[
                      { value: '', label: 'Any time' },
                      ...TIMING_PRESETS,
                    ]}
                  />
                )}
                {timingMode === 'twice-daily' && (
                  <div className="bg-[var(--success-muted)] border border-[var(--success)] rounded-lg p-3 text-sm text-[var(--success)]">
                    Morning and Night - you&apos;ll check off each dose separately
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reconstitution - Peptides only */}
        {itemType === 'peptide' && (
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
        )}

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
            disabled={isLoading || !peptideId || (itemType === 'peptide' ? !doseAmount : !servingSize)}
          >
            {isLoading ? 'Creating...' : 'Create Protocol'}
          </Button>
        </div>
      </form>
    </div>
  )
}
