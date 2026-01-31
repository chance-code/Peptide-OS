'use client'

import { useState, useEffect } from 'react'
import {
  Calculator,
  Copy,
  Check,
  Syringe,
  Droplets,
  Thermometer,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Beaker,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store'
import { SyringeVisual } from '@/components/syringe-visual'
import type { ReconstitutionResult, Protocol, Peptide } from '@/types'

const DOSE_UNITS = [
  { value: 'mcg', label: 'mcg' },
  { value: 'mg', label: 'mg' },
  { value: 'IU', label: 'IU' },
]

interface ProtocolWithPeptide extends Protocol {
  peptide: Peptide
}

// Color palette for peptides
const COLORS = ['blue', 'purple', 'green', 'amber', 'rose', 'cyan', 'orange', 'teal']

export default function ReconstitutionPage() {
  const { currentUserId } = useAppStore()
  const [protocols, setProtocols] = useState<ProtocolWithPeptide[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [vialAmount, setVialAmount] = useState('')
  const [vialUnit, setVialUnit] = useState('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [targetDose, setTargetDose] = useState('')
  const [targetUnit, setTargetUnit] = useState('mcg')
  const [result, setResult] = useState<ReconstitutionResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (currentUserId) {
      fetchProtocols()
    }
  }, [currentUserId])

  async function fetchProtocols() {
    try {
      const res = await fetch(`/api/protocols?userId=${currentUserId}&status=active`)
      if (res.ok) {
        const data = await res.json()
        // Filter to only protocols with reconstitution info
        setProtocols(data.filter((p: ProtocolWithPeptide) => p.vialAmount && p.diluentVolume))
      }
    } catch (error) {
      console.error('Error fetching protocols:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Generate cheat sheet from user's protocols
  const cheatSheet = protocols.map((protocol, index) => {
    const concentration = protocol.vialAmount! / protocol.diluentVolume!
    let doseInVialUnits = protocol.doseAmount

    // Convert dose to vial units if different
    if (protocol.doseUnit === 'mcg' && protocol.vialUnit === 'mg') {
      doseInVialUnits = protocol.doseAmount / 1000
    } else if (protocol.doseUnit === 'mg' && protocol.vialUnit === 'mcg') {
      doseInVialUnits = protocol.doseAmount * 1000
    }

    const volumeMl = doseInVialUnits / concentration
    const penUnits = Math.round(volumeMl * 100)

    return {
      name: protocol.peptide.name,
      vialAmount: `${protocol.vialAmount} ${protocol.vialUnit}`,
      bacWater: `${protocol.diluentVolume} mL`,
      concentration: `${concentration.toFixed(2)} ${protocol.vialUnit}/mL`,
      dose: `${protocol.doseAmount} ${protocol.doseUnit}`,
      injectionVolume: `${volumeMl.toFixed(3)} mL`,
      penUnits: `${penUnits} units`,
      penUnitsNum: penUnits, // numeric for syringe visual
      color: COLORS[index % COLORS.length],
    }
  })

  async function handleCalculate() {
    if (!vialAmount || !diluentVolume) return

    try {
      const res = await fetch('/api/reconstitution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vialAmount: parseFloat(vialAmount),
          vialUnit,
          diluentVolume: parseFloat(diluentVolume),
          targetDose: targetDose ? parseFloat(targetDose) : undefined,
          targetUnit: targetDose ? targetUnit : undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setResult(data.calculation)
      }
    } catch (error) {
      console.error('Error calculating:', error)
    }
  }

  function handleCopy() {
    let text = "PEPTIDE RECONSTITUTION CHEAT SHEET\n"
    text += "================================\n\n"

    for (const p of cheatSheet) {
      text += `${p.name}\n`
      text += `  Vial: ${p.vialAmount} + ${p.bacWater} BAC water\n`
      text += `  Concentration: ${p.concentration}\n`
      text += `  Dose: ${p.dose} = ${p.penUnits}\n\n`
    }

    text += "Storage: Refrigerate reconstituted vials\n"
    text += "Use within 28 days of reconstitution"

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleReset() {
    setVialAmount('')
    setVialUnit('mg')
    setDiluentVolume('')
    setTargetDose('')
    setTargetUnit('mcg')
    setResult(null)
  }

  const colorStyles: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-800' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-800' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', badge: 'bg-green-100 text-green-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-800' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', badge: 'bg-rose-100 text-rose-800' },
    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-900', badge: 'bg-cyan-100 text-cyan-800' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', badge: 'bg-orange-100 text-orange-800' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-900', badge: 'bg-teal-100 text-teal-800' },
  }

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          Reconstitution Guide
        </h2>
        {cheatSheet.length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* Quick Reference Cheat Sheet */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500">Loading...</div>
      ) : cheatSheet.length > 0 ? (
        <div className="space-y-3">
          {cheatSheet.map((peptide) => {
            const styles = colorStyles[peptide.color] || colorStyles.blue
            return (
              <Card key={peptide.name} className={`${styles.bg} ${styles.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className={`font-semibold text-lg ${styles.text}`}>{peptide.name}</h3>
                    <Badge className={styles.badge}>{peptide.penUnits}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Reconstitution</div>
                      <div className={`font-medium ${styles.text}`}>
                        {peptide.vialAmount} + {peptide.bacWater}
                      </div>
                      <div className="text-slate-600 text-xs mt-0.5">
                        = {peptide.concentration}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Your Dose</div>
                      <div className={`font-medium ${styles.text}`}>
                        {peptide.dose}
                      </div>
                      <div className="text-slate-600 text-xs mt-0.5">
                        = {peptide.injectionVolume}
                      </div>
                    </div>
                  </div>

                  {/* Syringe Visual */}
                  <SyringeVisual
                    units={peptide.penUnitsNum}
                    dose={peptide.dose}
                    concentration={peptide.concentration}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-6 text-center">
            <Beaker className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-600 mb-2">No reconstitution info yet</p>
            <p className="text-sm text-slate-500">
              Add reconstitution details to your protocols to see your personal cheat sheet here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Storage Quick Reference */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-slate-600" />
            <span className="font-medium text-slate-900">Storage</span>
          </div>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>Reconstituted vials & pens: <strong>Refrigerator</strong></li>
            <li>BAC water & needles: <strong>Room temperature</strong></li>
            <li>Use within <strong>28 days</strong> of reconstitution</li>
          </ul>
        </CardContent>
      </Card>

      {/* Pen Calibration Note */}
      <div className="text-center text-sm text-slate-500 py-2">
        Pen calibration: 1 unit = 0.01 mL
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
        <strong>Disclaimer:</strong> This calculator is a mathematical tool only. Always verify
        calculations and consult a healthcare provider before use. Information shown is user-entered
        and not medical advice.
      </div>

      {/* Step-by-Step Instructions */}
      <Card>
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4" />
              How to Reconstitute
            </CardTitle>
            {showInstructions ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </CardHeader>
        {showInstructions && (
          <CardContent className="pt-2 space-y-4">
            {/* Supplies Needed */}
            <div>
              <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                <Syringe className="w-4 h-4" />
                Supplies Needed
              </h4>
              <ul className="text-sm text-slate-600 space-y-1 ml-6 list-disc">
                <li>Peptide vial (lyophilized powder)</li>
                <li>Bacteriostatic water (BAC water)</li>
                <li>Alcohol swabs</li>
                <li>Insulin syringe (29-31 gauge)</li>
                <li>Clean work surface</li>
              </ul>
            </div>

            {/* Step by Step Process */}
            <div>
              <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                <Droplets className="w-4 h-4" />
                Step-by-Step Process
              </h4>
              <ol className="text-sm text-slate-600 space-y-3 ml-6 list-decimal">
                <li>
                  <strong>Prepare your workspace</strong>
                  <p className="text-slate-500 mt-0.5">
                    Wash hands thoroughly. Clean work surface with alcohol.
                  </p>
                </li>
                <li>
                  <strong>Let vials reach room temperature</strong>
                  <p className="text-slate-500 mt-0.5">
                    Remove peptide vial from refrigerator 15-20 minutes before.
                  </p>
                </li>
                <li>
                  <strong>Clean vial tops</strong>
                  <p className="text-slate-500 mt-0.5">
                    Wipe rubber stoppers with alcohol swabs. Let dry.
                  </p>
                </li>
                <li>
                  <strong>Draw bacteriostatic water</strong>
                  <p className="text-slate-500 mt-0.5">
                    Draw your calculated amount of BAC water.
                  </p>
                </li>
                <li>
                  <strong>Inject water slowly along vial wall</strong>
                  <p className="text-slate-500 mt-0.5">
                    Let water trickle down inside wall - <strong>never spray directly on powder</strong>.
                  </p>
                </li>
                <li>
                  <strong>Swirl gently - never shake</strong>
                  <p className="text-slate-500 mt-0.5">
                    Roll between palms until dissolved. <strong>Never shake</strong>.
                  </p>
                </li>
                <li>
                  <strong>Label and store</strong>
                  <p className="text-slate-500 mt-0.5">
                    Write date and concentration. Store in refrigerator.
                  </p>
                </li>
              </ol>
            </div>

            {/* Safety Notes */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Important Safety Notes
              </h4>
              <ul className="text-sm text-amber-700 space-y-1 ml-6 list-disc">
                <li>Always use <strong>bacteriostatic water</strong>, not sterile water</li>
                <li>Use a new needle for each injection</li>
                <li>Rotate injection sites</li>
                <li>If you see particles or cloudiness, do not use</li>
              </ul>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Custom Calculator */}
      <Card>
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Custom Calculator
            </CardTitle>
            {showCalculator ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </CardHeader>
        {showCalculator && (
          <CardContent className="pt-2 space-y-4">
            {/* Vial Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Total Peptide in Vial
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="any"
                  value={vialAmount}
                  onChange={(e) => setVialAmount(e.target.value)}
                  placeholder="e.g., 10"
                  className="flex-1"
                />
                <Select
                  value={vialUnit}
                  onChange={(e) => setVialUnit(e.target.value)}
                  options={DOSE_UNITS}
                  className="w-24"
                />
              </div>
            </div>

            {/* Diluent Volume */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                BAC Water to Add (mL)
              </label>
              <Input
                type="number"
                step="any"
                value={diluentVolume}
                onChange={(e) => setDiluentVolume(e.target.value)}
                placeholder="e.g., 2"
              />
            </div>

            {/* Target Dose */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Target Dose (per injection)
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="any"
                  value={targetDose}
                  onChange={(e) => setTargetDose(e.target.value)}
                  placeholder="e.g., 500"
                  className="flex-1"
                />
                <Select
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value)}
                  options={DOSE_UNITS}
                  className="w-24"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCalculate}
                disabled={!vialAmount || !diluentVolume}
                className="flex-1"
              >
                Calculate
              </Button>
              <Button variant="secondary" onClick={handleReset}>
                Reset
              </Button>
            </div>

            {/* Results */}
            {result && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="text-sm text-green-700 mb-1">Concentration</div>
                  <div className="text-xl font-bold text-green-900 font-mono">
                    {result.concentration.toFixed(4)} {result.concentrationUnit}
                  </div>

                  {result.volumePerDose && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <div className="text-sm text-green-700 mb-1">
                        To get {targetDose} {targetUnit}, draw:
                      </div>
                      <div className="text-2xl font-bold text-green-900 font-mono">
                        {(result.volumePerDose * 100).toFixed(1)} units
                      </div>
                      <div className="text-sm text-green-600">
                        ({result.volumePerDose.toFixed(4)} mL)
                      </div>
                      {result.totalDoses && (
                        <div className="mt-2">
                          <Badge variant="success">~{result.totalDoses} doses per vial</Badge>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
