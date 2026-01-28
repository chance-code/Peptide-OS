'use client'

import { useState } from 'react'
import {
  Calculator,
  Copy,
  Check,
  Printer,
  Syringe,
  Droplets,
  Thermometer,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReconstitutionResult } from '@/types'

const DOSE_UNITS = [
  { value: 'mcg', label: 'mcg' },
  { value: 'mg', label: 'mg' },
  { value: 'IU', label: 'IU' },
]

const COMMON_PRESETS = [
  { name: 'BPC-157', vialAmount: 10, vialUnit: 'mg', suggestedDiluent: 2, typicalDose: 500, doseUnit: 'mcg', notes: '10 units' },
  { name: 'Tirzepatide', vialAmount: 10, vialUnit: 'mg', suggestedDiluent: 1, typicalDose: 1.25, doseUnit: 'mg', notes: '13 units' },
  { name: 'Ipamorelin', vialAmount: 10, vialUnit: 'mg', suggestedDiluent: 2, typicalDose: 300, doseUnit: 'mcg', notes: '6 units' },
  { name: 'GHK-Cu', vialAmount: 50, vialUnit: 'mg', suggestedDiluent: 3.4, typicalDose: 1.0, doseUnit: 'mg', notes: '7 units' },
]

export default function ReconstitutionPage() {
  const [vialAmount, setVialAmount] = useState('')
  const [vialUnit, setVialUnit] = useState('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [targetDose, setTargetDose] = useState('')
  const [targetUnit, setTargetUnit] = useState('mcg')
  const [result, setResult] = useState<ReconstitutionResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInstructions, setShowInstructions] = useState(true)
  const [showPresets, setShowPresets] = useState(false)

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

  function applyPreset(preset: typeof COMMON_PRESETS[0]) {
    setVialAmount(preset.vialAmount.toString())
    setVialUnit(preset.vialUnit)
    setDiluentVolume(preset.suggestedDiluent.toString())
    setTargetDose(preset.typicalDose.toString())
    setTargetUnit(preset.doseUnit)
    setShowPresets(false)
  }

  function handleCopy() {
    if (!result) return

    let text = `Reconstitution Calculation\n`
    text += `========================\n\n`
    text += `Vial: ${vialAmount} ${vialUnit}\n`
    text += `Diluent: ${diluentVolume} ml BAC water\n`
    text += `Concentration: ${result.concentration.toFixed(4)} ${result.concentrationUnit}\n`

    if (result.volumePerDose) {
      text += `\nTarget dose: ${targetDose} ${targetUnit}\n`
      text += `Volume to draw: ${result.volumePerDose.toFixed(4)} ml\n`
      text += `Syringe units: ${(result.volumePerDose * 100).toFixed(1)} units\n`
      if (result.totalDoses) {
        text += `Total doses per vial: ~${result.totalDoses}\n`
      }
    }

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handlePrint() {
    window.print()
  }

  function handleReset() {
    setVialAmount('')
    setVialUnit('mg')
    setDiluentVolume('')
    setTargetDose('')
    setTargetUnit('mcg')
    setResult(null)
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">
        Reconstitution Guide
      </h2>

      {/* Step-by-Step Instructions */}
      <Card>
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4" />
              Reconstitution Instructions
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
                    Wash hands thoroughly. Clean work surface with alcohol. Gather all supplies.
                  </p>
                </li>
                <li>
                  <strong>Let vials reach room temperature</strong>
                  <p className="text-slate-500 mt-0.5">
                    Remove peptide vial from refrigerator 15-20 minutes before reconstitution. Cold vials can cause the powder to clump.
                  </p>
                </li>
                <li>
                  <strong>Clean vial tops</strong>
                  <p className="text-slate-500 mt-0.5">
                    Wipe the rubber stopper of both the peptide vial and BAC water vial with alcohol swabs. Let dry completely.
                  </p>
                </li>
                <li>
                  <strong>Draw bacteriostatic water</strong>
                  <p className="text-slate-500 mt-0.5">
                    Using an insulin syringe, draw your calculated amount of BAC water. Remove any air bubbles by flicking the syringe and pushing them out.
                  </p>
                </li>
                <li>
                  <strong>Inject water slowly along vial wall</strong>
                  <p className="text-slate-500 mt-0.5">
                    Insert needle into peptide vial at an angle. Let the water trickle down the inside wall of the vial - <strong>do not spray directly onto the powder</strong>. This prevents damaging the peptide.
                  </p>
                </li>
                <li>
                  <strong>Swirl gently - never shake</strong>
                  <p className="text-slate-500 mt-0.5">
                    Gently roll the vial between your palms or swirl in a circular motion. <strong>Never shake</strong> - this can denature the peptide. Continue until powder is fully dissolved (solution should be clear).
                  </p>
                </li>
                <li>
                  <strong>Label and store</strong>
                  <p className="text-slate-500 mt-0.5">
                    Write the reconstitution date and concentration on the vial. Store in refrigerator immediately.
                  </p>
                </li>
              </ol>
            </div>

            {/* Storage Guidelines */}
            <div>
              <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                <Thermometer className="w-4 h-4" />
                Storage Guidelines
              </h4>
              <ul className="text-sm text-slate-600 space-y-1 ml-6 list-disc">
                <li>Store reconstituted peptides in <strong>refrigerator (36-46°F / 2-8°C)</strong></li>
                <li>Keep away from light - store in original box or wrap in foil</li>
                <li>Use within <strong>28 days</strong> of reconstitution</li>
                <li><strong>Never freeze</strong> reconstituted peptides</li>
                <li>Discard if solution becomes cloudy or discolored</li>
              </ul>
            </div>

            {/* Safety Notes */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Important Safety Notes
              </h4>
              <ul className="text-sm text-amber-700 space-y-1 ml-6 list-disc">
                <li>Always use <strong>bacteriostatic water</strong>, not sterile water (sterile water has no preservative)</li>
                <li>Use a new needle for each injection</li>
                <li>Rotate injection sites to prevent lipodystrophy</li>
                <li>If you see particles or cloudiness, do not use</li>
                <li>Keep track of expiration dates</li>
              </ul>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Quick Presets */}
      <Card>
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-base">Common Peptide Presets</CardTitle>
            {showPresets ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </CardHeader>
        {showPresets && (
          <CardContent className="pt-2">
            <div className="grid grid-cols-2 gap-2">
              {COMMON_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className="p-3 text-left rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <div className="font-medium text-slate-900 text-sm">{preset.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {preset.typicalDose} {preset.doseUnit} = {preset.notes}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Tap a preset to auto-fill typical values. Always verify with your specific product.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Dose Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                placeholder="e.g., 5"
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
              Bacteriostatic Water to Add (ml)
            </label>
            <Input
              type="number"
              step="any"
              value={diluentVolume}
              onChange={(e) => setDiluentVolume(e.target.value)}
              placeholder="e.g., 2"
            />
            <p className="text-xs text-slate-500 mt-1">
              Tip: More water = easier to measure small doses accurately
            </p>
          </div>

          {/* Target Dose */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Your Target Dose (per injection)
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="any"
                value={targetDose}
                onChange={(e) => setTargetDose(e.target.value)}
                placeholder="e.g., 250"
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
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Quick Reference Card */}
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="text-sm text-green-700 mb-1">Your Concentration</div>
              <div className="text-2xl font-bold text-green-900 font-mono">
                {result.concentration.toFixed(4)} {result.concentrationUnit}
              </div>

              {result.volumePerDose && (
                <div className="mt-4 pt-4 border-t border-green-200">
                  <div className="text-sm text-green-700 mb-1">
                    To get {targetDose} {targetUnit}, draw:
                  </div>
                  <div className="text-3xl font-bold text-green-900 font-mono">
                    {(result.volumePerDose * 100).toFixed(1)} units
                  </div>
                  <div className="text-sm text-green-600 mt-1">
                    ({result.volumePerDose.toFixed(4)} ml on insulin syringe)
                  </div>
                  {result.totalDoses && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <Badge variant="success" className="text-sm">
                        ~{result.totalDoses} doses per vial
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Syringe Visual Guide */}
          {result.volumePerDose && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Syringe Guide</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-sm text-slate-600 mb-3">
                    On a standard <strong>100-unit insulin syringe</strong> (1ml = 100 units):
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="h-8 bg-slate-200 rounded relative">
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-green-500 rounded-l"
                          style={{
                            width: `${Math.min(100, result.volumePerDose * 100)}%`,
                          }}
                        />
                        {/* Tick marks */}
                        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((tick) => (
                          <div
                            key={tick}
                            className="absolute top-0 bottom-0 w-px bg-slate-400"
                            style={{ left: `${tick}%` }}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">
                        {(result.volumePerDose * 100).toFixed(1)}
                      </div>
                      <div className="text-xs text-slate-500">units</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step-by-Step Math */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calculation Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.steps.map((step, index) => (
                <div
                  key={index}
                  className="pb-4 border-b border-slate-100 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {step.description}
                    </span>
                  </div>
                  <div className="font-mono text-sm bg-slate-50 p-2 rounded ml-8">
                    <div className="text-slate-600">{step.formula}</div>
                    <div className="text-slate-900 font-semibold">= {step.result}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2" data-print-hidden>
            <Button variant="secondary" onClick={handleCopy} className="flex-1">
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={handlePrint} className="flex-1">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
