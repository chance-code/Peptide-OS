'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronUp, Pill, Sparkles, Scale, Heart, Zap, Beaker, BookOpen, FlaskConical, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PEPTIDE_REFERENCE, type PeptideReference } from '@/lib/peptide-reference'
import { calculateReconstitution, mlToUnits } from '@/lib/reconstitution'
import type { DoseUnit, ReconstitutionResult } from '@/types'

const CATEGORY_INFO: Record<string, { label: string; icon: typeof Pill; color: string }> = {
  healing: { label: 'Healing', icon: Heart, color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  'growth-hormone': { label: 'Growth Hormone', icon: Zap, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
  'weight-loss': { label: 'Weight Loss', icon: Scale, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  cosmetic: { label: 'Cosmetic', icon: Sparkles, color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300' },
  other: { label: 'Other', icon: Pill, color: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300' },
}

function PeptideCard({ peptide }: { peptide: PeptideReference }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const categoryInfo = CATEGORY_INFO[peptide.category] || CATEGORY_INFO.other
  const CategoryIcon = categoryInfo.icon

  return (
    <Card className="overflow-hidden" interactive>
      <button
        type="button"
        className="w-full text-left cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-[var(--foreground)]">{peptide.name}</span>
                <Badge className={cn('text-xs', categoryInfo.color)}>
                  <CategoryIcon className="w-3 h-3 mr-1" />
                  {categoryInfo.label}
                </Badge>
              </div>
              {peptide.description && !isExpanded && (
                <p className="text-sm text-[var(--muted-foreground)] line-clamp-1">{peptide.description}</p>
              )}
            </div>
            <div className="ml-2 text-[var(--muted-foreground)]">
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--border)] bg-[var(--muted)]/50">
          {/* Full description */}
          {peptide.description && (
            <p className="text-sm text-[var(--muted-foreground)] pt-3 pb-2">
              {peptide.description}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Typical Dose</div>
              <div className="font-medium text-[var(--foreground)]">
                {peptide.typicalDose.min === peptide.typicalDose.max
                  ? `${peptide.typicalDose.min} ${peptide.typicalDose.unit}`
                  : `${peptide.typicalDose.min}-${peptide.typicalDose.max} ${peptide.typicalDose.unit}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Vial Sizes</div>
              <div className="font-medium text-[var(--foreground)]">
                {peptide.typicalVialSizes.map(v => `${v.amount}${v.unit}`).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">BAC Water</div>
              <div className="font-medium text-[var(--foreground)]">{peptide.recommendedDiluentMl} mL</div>
            </div>
            {peptide.aliases && peptide.aliases.length > 0 && (
              <div>
                <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Also Known As</div>
                <div className="font-medium text-[var(--foreground)] text-sm">
                  {peptide.aliases.slice(0, 2).join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

const UNIT_OPTIONS: DoseUnit[] = ['mcg', 'mg', 'IU']

function ReconstitutionCalculator() {
  const [vialAmount, setVialAmount] = useState('')
  const [vialUnit, setVialUnit] = useState<DoseUnit>('mg')
  const [diluentVolume, setDiluentVolume] = useState('')
  const [targetDose, setTargetDose] = useState('')
  const [targetUnit, setTargetUnit] = useState<DoseUnit>('mcg')
  const [result, setResult] = useState<ReconstitutionResult | null>(null)

  // Auto-select a peptide to prefill
  const [selectedPeptide, setSelectedPeptide] = useState<string>('')

  function handlePeptideSelect(name: string) {
    const peptide = PEPTIDE_REFERENCE.find(p => p.name === name)
    if (!peptide) {
      setSelectedPeptide('')
      return
    }
    setSelectedPeptide(name)
    const vial = peptide.typicalVialSizes[0]
    setVialAmount(String(vial.amount))
    setVialUnit(vial.unit as DoseUnit)
    setDiluentVolume(String(peptide.recommendedDiluentMl))
    setTargetDose(String(peptide.typicalDose.min))
    setTargetUnit(peptide.typicalDose.unit as DoseUnit)
    setResult(null)
  }

  function handleCalculate() {
    const va = parseFloat(vialAmount)
    const dv = parseFloat(diluentVolume)
    const td = targetDose ? parseFloat(targetDose) : undefined
    if (!va || !dv || va <= 0 || dv <= 0) return

    const res = calculateReconstitution({
      vialAmount: va,
      vialUnit,
      diluentVolume: dv,
      targetDose: td && td > 0 ? td : undefined,
      targetUnit: td && td > 0 ? targetUnit : undefined,
    })
    setResult(res)
  }

  const canCalculate = parseFloat(vialAmount) > 0 && parseFloat(diluentVolume) > 0

  return (
    <div className="space-y-4">
      {/* Peptide quick-select */}
      <Card>
        <CardContent className="p-4">
          <label className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-2 block">
            Quick-fill from peptide
          </label>
          <select
            value={selectedPeptide}
            onChange={(e) => handlePeptideSelect(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          >
            <option value="">Select a peptide...</option>
            {PEPTIDE_REFERENCE.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Input fields */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
            Vial Details
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Peptide Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 5"
                value={vialAmount}
                onChange={(e) => { setVialAmount(e.target.value); setResult(null) }}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Unit</label>
              <select
                value={vialUnit}
                onChange={(e) => { setVialUnit(e.target.value as DoseUnit); setResult(null) }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              >
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--muted-foreground)] block mb-1">BAC Water (mL)</label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 2"
              value={diluentVolume}
              onChange={(e) => { setDiluentVolume(e.target.value); setResult(null) }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Target dose (optional) */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Beaker className="w-4 h-4 text-[var(--accent)]" />
            Target Dose (optional)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Dose Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 250"
                value={targetDose}
                onChange={(e) => { setTargetDose(e.target.value); setResult(null) }}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] block mb-1">Unit</label>
              <select
                value={targetUnit}
                onChange={(e) => { setTargetUnit(e.target.value as DoseUnit); setResult(null) }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              >
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calculate button */}
      <button
        onClick={handleCalculate}
        disabled={!canCalculate}
        className={cn(
          'w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2',
          canCalculate
            ? 'bg-[var(--accent)] text-[var(--accent-foreground)] active:scale-[0.98]'
            : 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed'
        )}
      >
        Calculate
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* Results */}
      {result && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-sm font-semibold text-[var(--foreground)]">Results</div>

            {/* Key numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                <div className="text-xs text-[var(--muted-foreground)] mb-1">Concentration</div>
                <div className="text-lg font-bold text-[var(--foreground)]">
                  {result.concentration >= 1
                    ? result.concentration.toFixed(2)
                    : result.concentration.toFixed(4)}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">{result.concentrationUnit}</div>
              </div>

              {result.volumePerDose != null && (
                <div className="p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <div className="text-xs text-[var(--muted-foreground)] mb-1">Draw per Dose</div>
                  <div className="text-lg font-bold text-[var(--foreground)]">
                    {mlToUnits(result.volumePerDose).toFixed(1)}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    units ({result.volumePerDose.toFixed(3)} mL)
                  </div>
                </div>
              )}

              {result.totalDoses != null && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="text-xs text-[var(--muted-foreground)] mb-1">Doses per Vial</div>
                  <div className="text-lg font-bold text-green-400">
                    {result.totalDoses}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">approximately</div>
                </div>
              )}
            </div>

            {/* Step-by-step math */}
            <div>
              <div className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
                Step-by-step
              </div>
              <div className="space-y-2">
                {result.steps.map((step, i) => (
                  <div key={i} className="p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
                    <div className="text-xs text-[var(--muted-foreground)] mb-1">
                      Step {i + 1}: {step.description}
                    </div>
                    <div className="text-sm font-mono text-[var(--foreground)]">
                      {step.formula}
                    </div>
                    <div className="text-sm font-semibold text-[var(--accent)] mt-1">
                      = {step.result}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-[var(--muted-foreground)] pb-4">
        Always verify calculations before injection. 1 mL = 100 insulin syringe units.
      </div>
    </div>
  )
}

type LibraryTab = 'reference' | 'calculator'

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('reference')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filteredPeptides = useMemo(() => {
    let peptides = PEPTIDE_REFERENCE

    if (selectedCategory) {
      peptides = peptides.filter(p => p.category === selectedCategory)
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase().trim()
      peptides = peptides.filter(p => {
        if (p.name.toLowerCase().includes(searchLower)) return true
        if (p.description?.toLowerCase().includes(searchLower)) return true
        if (p.aliases?.some(a => a.toLowerCase().includes(searchLower))) return true
        return false
      })
    }

    return peptides
  }, [search, selectedCategory])

  const categories = Object.entries(CATEGORY_INFO)

  const tabs: { key: LibraryTab; label: string; icon: typeof BookOpen }[] = [
    { key: 'reference', label: 'Reference', icon: BookOpen },
    { key: 'calculator', label: 'Calculator', icon: Beaker },
  ]

  return (
    <div className="p-4 pb-4">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">Library</h2>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--muted)] mb-4">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)]'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'reference' ? (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <Input
              placeholder="Search peptides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category filters */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                selectedCategory === null
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
              )}
            >
              All
            </button>
            {categories.map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  selectedCategory === key
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Results count */}
          <div className="text-sm text-[var(--muted-foreground)] mb-3">
            {filteredPeptides.length} peptide{filteredPeptides.length !== 1 ? 's' : ''}
          </div>

          {/* Peptide list */}
          <div className="space-y-3">
            {filteredPeptides.map((peptide, index) => (
              <div key={peptide.name} className={cn('animate-card-in', `stagger-${Math.min(index + 1, 10)}`)}>
                <PeptideCard peptide={peptide} />
              </div>
            ))}

            {filteredPeptides.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-[var(--muted-foreground)]">No peptides found</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">Try a different search term</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Info note */}
          <div className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
            Tap a peptide for dosing details
          </div>
        </>
      ) : (
        <ReconstitutionCalculator />
      )}
    </div>
  )
}
