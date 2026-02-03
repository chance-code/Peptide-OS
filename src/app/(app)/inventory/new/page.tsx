'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import { Lightbulb, Camera, Loader2, CheckCircle2, AlertCircle, Syringe, Pill, X, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getReconstitutionDefaults, getRecommendedDiluent } from '@/lib/peptide-reference'
import type { Peptide, Protocol, ItemType } from '@/types'

interface ScanResult {
  peptideName: string | null
  amount: number | null
  unit: string | null
  manufacturer: string | null
  lotNumber: string | null
  expirationDate: string | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string | null
}

interface SupplementScanResult {
  name: string | null
  brand: string | null
  servingSize: number | null
  servingUnit: string | null
  totalCount: number | null
  dosage: string | null
  confidence: 'high' | 'medium' | 'low'
  rawText: string | null
}

interface ProtocolWithReconstitution extends Protocol {
  peptide: Peptide
}

const AMOUNT_UNITS = [
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg' },
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

export default function NewInventoryPage() {
  const router = useRouter()
  const { currentUserId } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [peptides, setPeptides] = useState<Peptide[]>([])
  const [protocols, setProtocols] = useState<ProtocolWithReconstitution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewPeptide, setShowNewPeptide] = useState(false)

  // Type selector state
  const [itemType, setItemType] = useState<ItemType>('peptide')

  // Peptide scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Supplement scan state (multi-photo)
  const [supplementImages, setSupplementImages] = useState<string[]>([])
  const [supplementScanResult, setSupplementScanResult] = useState<SupplementScanResult | null>(null)
  const supplementFileInputRef = useRef<HTMLInputElement>(null)

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
  const [dateReconstituted, setDateReconstituted] = useState(format(new Date(), 'yyyy-MM-dd'))

  // Supplement count state
  const [itemCount, setItemCount] = useState('')
  const [servingUnit, setServingUnit] = useState('capsule')
  // Default expiration to 28 days from today
  const [expirationDate, setExpirationDate] = useState(format(addDays(new Date(), 28), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchPeptides()
    if (currentUserId) {
      fetchProtocols()
    }
  }, [currentUserId])

  // Handle image capture and scanning
  async function handleImageCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanError(null)
    setScanResult(null)
    setIsScanning(true)

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Send to API
      const res = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })

      if (!res.ok) {
        throw new Error('Failed to analyze image')
      }

      const result: ScanResult = await res.json()
      setScanResult(result)

      // Auto-populate form fields
      if (result.peptideName) {
        // Try to find matching peptide
        const matchingPeptide = peptides.find(
          p => p.name.toLowerCase().replace(/[-\s]/g, '') ===
               result.peptideName!.toLowerCase().replace(/[-\s]/g, '')
        )
        if (matchingPeptide) {
          setPeptideId(matchingPeptide.id)
        } else {
          // Create new peptide
          setShowNewPeptide(true)
          setNewPeptideName(result.peptideName)
        }
      }

      if (result.amount) {
        setTotalAmount(result.amount.toString())
      }

      if (result.unit) {
        setTotalUnit(result.unit)
      }

      if (result.expirationDate) {
        setExpirationDate(result.expirationDate)
      }

      if (result.lotNumber) {
        setIdentifier(result.lotNumber)
      }

      if (result.manufacturer) {
        setNotes(prev => prev ? `${prev}\nManufacturer: ${result.manufacturer}` : `Manufacturer: ${result.manufacturer}`)
      }
    } catch (error) {
      console.error('Scan error:', error)
      setScanError('Failed to analyze image. Please try again or enter details manually.')
    } finally {
      setIsScanning(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle multi-photo capture for supplement scanning
  async function handleSupplementPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newImages: string[] = []
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      newImages.push(base64)
    }

    setSupplementImages((prev) => [...prev, ...newImages])
    if (supplementFileInputRef.current) {
      supplementFileInputRef.current.value = ''
    }
  }

  function removeSupplementImage(index: number) {
    setSupplementImages((prev) => prev.filter((_, i) => i !== index))
    setSupplementScanResult(null)
    setScanError(null)
  }

  async function handleScanSupplementImages() {
    if (supplementImages.length === 0) return

    setIsScanning(true)
    setScanError(null)
    setSupplementScanResult(null)

    try {
      const res = await fetch('/api/supplements/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: supplementImages }),
      })

      if (!res.ok) {
        throw new Error('Failed to analyze images')
      }

      const result: SupplementScanResult = await res.json()
      setSupplementScanResult(result)

      // Auto-populate form fields
      if (result.name) {
        const existingSupplement = peptides.find(
          (p) => p.name.toLowerCase() === result.name!.toLowerCase() && (p.type || 'peptide') === 'supplement'
        )
        if (existingSupplement) {
          setPeptideId(existingSupplement.id)
        } else {
          setNewPeptideName(result.name)
          setShowNewPeptide(true)
        }
      }

      if (result.totalCount) {
        setItemCount(result.totalCount.toString())
      }

      if (result.servingUnit) {
        const unitMap: Record<string, string> = {
          capsule: 'capsule', capsules: 'capsule',
          tablet: 'tablet', tablets: 'tablet',
          softgel: 'softgel', softgels: 'softgel',
          scoop: 'scoop', scoops: 'scoop',
          drop: 'drop', drops: 'drop',
          spray: 'spray', sprays: 'spray',
          gummy: 'capsule', gummies: 'capsule',
        }
        setServingUnit(unitMap[result.servingUnit.toLowerCase()] || 'capsule')
      }

      if (result.brand) {
        setIdentifier(result.brand)
      }
    } catch (error) {
      console.error('Scan error:', error)
      setScanError('Failed to analyze images. Please try again or enter manually.')
    } finally {
      setIsScanning(false)
    }
  }

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
        body: JSON.stringify({ name: newPeptideName.trim(), type: itemType }),
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

    // Validate based on item type
    if (!currentUserId) return
    if (itemType === 'peptide' && !totalAmount) return
    if (itemType === 'supplement' && !itemCount) return

    // Check if we need a peptide - either existing or new
    if (!peptideId && !newPeptideName.trim()) return

    setIsLoading(true)

    try {
      let finalPeptideId = peptideId

      // If no peptideId but we have a new peptide name, create it first
      if (!finalPeptideId && newPeptideName.trim()) {
        const createRes = await fetch('/api/peptides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newPeptideName.trim(), type: itemType }),
        })

        if (!createRes.ok) {
          throw new Error('Failed to create peptide')
        }

        const newPeptide = await createRes.json()
        finalPeptideId = newPeptide.id
        setPeptides([...peptides, newPeptide])
        setPeptideId(newPeptide.id)
        setShowNewPeptide(false)
        setNewPeptideName('')
      }

      if (!finalPeptideId) {
        throw new Error('No peptide selected')
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          peptideId: finalPeptideId,
          identifier: identifier || null,
          // For peptides: use totalAmount/totalUnit
          // For supplements: store itemCount as totalAmount with servingUnit
          totalAmount: itemType === 'peptide' ? parseFloat(totalAmount) : parseInt(itemCount),
          totalUnit: itemType === 'peptide' ? totalUnit : servingUnit,
          diluentVolume: itemType === 'peptide' && diluentVolume ? parseFloat(diluentVolume) : null,
          dateReceived: dateReceived || null,
          dateReconstituted: itemType === 'peptide' ? (dateReconstituted || null) : null,
          expirationDate: expirationDate || null,
          notes: notes || null,
          // Supplement count tracking
          itemCount: itemType === 'supplement' ? parseInt(itemCount) : null,
          remainingCount: itemType === 'supplement' ? parseInt(itemCount) : null,
        }),
      })

      if (res.ok) {
        router.push('/inventory')
      } else {
        const error = await res.json()
        console.error('Failed to create inventory:', error)
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

  // Filter peptides by selected type
  const filteredPeptides = peptides.filter(p => (p.type || 'peptide') === itemType)

  return (
    <div className="p-4 pb-24">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
        Add {itemType === 'peptide' ? 'Vial' : 'Supplement'}
      </h2>

      {/* Type Selector */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setItemType('peptide')
            setPeptideId('')
            setShowNewPeptide(false)
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

      {/* Scan Vial Button - Peptides only */}
      {itemType === 'peptide' && (
      <div className="mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageCapture}
          className="hidden"
          id="vial-camera"
        />
        <label
          htmlFor="vial-camera"
          className={`
            flex items-center justify-center gap-3 w-full p-4 rounded-2xl border-2 border-dashed
            transition-all cursor-pointer
            ${isScanning
              ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
              : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--muted)]'
            }
          `}
        >
          {isScanning ? (
            <>
              <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
              <span className="text-[var(--accent)] font-medium">Analyzing vial...</span>
            </>
          ) : (
            <>
              <Camera className="w-6 h-6 text-[var(--muted-foreground)]" />
              <span className="text-[var(--foreground)] font-medium">Scan Vial Label</span>
            </>
          )}
        </label>
        <p className="text-xs text-[var(--muted-foreground)] text-center mt-2">
          Take a photo of the vial label to auto-fill details
        </p>
      </div>
      )}

      {/* Scan Result Banner - Peptides only */}
      {itemType === 'peptide' && scanResult && (
        <div className={`
          mb-4 p-4 rounded-xl border
          ${scanResult.confidence === 'high'
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : scanResult.confidence === 'medium'
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              : 'bg-[var(--muted)] border-[var(--border)]'
          }
        `}>
          <div className="flex items-start gap-3">
            {scanResult.confidence === 'high' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-[var(--foreground)]">
                {scanResult.confidence === 'high'
                  ? 'Vial detected!'
                  : scanResult.confidence === 'medium'
                    ? 'Partial match - please verify'
                    : 'Could not read label clearly'}
              </div>
              {scanResult.peptideName && (
                <div className="text-sm text-[var(--muted-foreground)] mt-1">
                  {scanResult.peptideName}
                  {scanResult.amount && ` • ${scanResult.amount}${scanResult.unit || 'mg'}`}
                </div>
              )}
              {scanResult.confidence === 'low' && scanResult.rawText && (
                <div className="text-xs text-[var(--muted-foreground)] mt-1 truncate">
                  Text found: {scanResult.rawText}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan Error - Peptides only */}
      {itemType === 'peptide' && scanError && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{scanError}</span>
          </div>
        </div>
      )}

      {/* Scan Supplement - Supplements only */}
      {itemType === 'supplement' && (
        <div className="mb-6 p-4 bg-[var(--card)] rounded-xl border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="w-4 h-4" />
            <span className="font-medium text-sm">Scan Label (optional)</span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">
            Take photos of front and back to auto-fill details
          </p>

          <input
            ref={supplementFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleSupplementPhotoCapture}
            className="hidden"
          />

          {supplementImages.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {supplementImages.map((img, index) => (
                <div key={index} className="relative">
                  <img
                    src={img}
                    alt={`Scan ${index + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-[var(--border)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeSupplementImage(index)}
                    className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {supplementImages.length < 4 && (
                <button
                  type="button"
                  onClick={() => supplementFileInputRef.current?.click()}
                  className="w-16 h-16 border-2 border-dashed border-[var(--border)] rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:border-[var(--accent)]"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {supplementImages.length === 0 ? (
              <button
                type="button"
                onClick={() => supplementFileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <Camera className="w-4 h-4" />
                Take Photo
              </button>
            ) : (
              <button
                type="button"
                onClick={handleScanSupplementImages}
                disabled={isScanning}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[var(--accent)] text-white font-medium disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Analyze {supplementImages.length} Photo{supplementImages.length > 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>

          {supplementScanResult && (
            <div className={`mt-3 p-3 rounded-lg ${
              supplementScanResult.confidence === 'high'
                ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                : 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
            }`}>
              <div className="flex items-start gap-2">
                <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  supplementScanResult.confidence === 'high' ? 'text-green-600' : 'text-yellow-600'
                }`} />
                <div className="text-sm">
                  <div className="font-medium text-[var(--foreground)]">
                    {supplementScanResult.name || 'Unknown'}
                    {supplementScanResult.brand && <span className="text-[var(--muted-foreground)]"> by {supplementScanResult.brand}</span>}
                  </div>
                  {supplementScanResult.totalCount && (
                    <div className="text-[var(--muted-foreground)]">
                      {supplementScanResult.totalCount} {supplementScanResult.servingUnit || 'items'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {itemType === 'supplement' && scanError && (
            <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">
              {scanError}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder={`Select a ${itemType}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewPeptide(true)}
                >
                  + Add new {itemType}
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

        {/* Vial Details (Peptide) / Count (Supplement) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {itemType === 'peptide' ? 'Vial Details' : 'Item Details'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Identifier (optional)"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={itemType === 'peptide' ? 'e.g., Vial #1, Batch ABC' : 'e.g., Bottle #1, Brand'}
            />
            {itemType === 'peptide' ? (
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
            ) : (
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    label="Total Count"
                    type="number"
                    step="1"
                    min="1"
                    value={itemCount}
                    onChange={(e) => setItemCount(e.target.value)}
                    placeholder="e.g., 60"
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
          </CardContent>
        </Card>

        {/* Reconstitution - Peptides only */}
        {itemType === 'peptide' && (
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
              <div className="p-3 bg-[var(--muted)] rounded-lg">
                <div className="text-sm text-[var(--muted-foreground)]">Concentration</div>
                <div className="font-mono text-lg font-semibold text-[var(--foreground)]">
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
        )}

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
            {itemType === 'peptide' && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Tip: Most reconstituted peptides expire 28 days after reconstitution when
                refrigerated.
              </p>
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
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] min-h-[80px] placeholder:text-[var(--muted-foreground)]"
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
            disabled={isLoading || (!peptideId && !newPeptideName.trim()) || (itemType === 'peptide' ? !totalAmount : !itemCount)}
          >
            {isLoading ? 'Adding...' : itemType === 'peptide' ? 'Add Vial' : 'Add Supplement'}
          </Button>
        </div>
      </form>
    </div>
  )
}
