'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronUp, Pill, Sparkles, Scale, Heart, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PEPTIDE_REFERENCE, type PeptideReference } from '@/lib/peptide-reference'

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

export default function LibraryPage() {
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

  return (
    <div className="p-4 pb-20">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">Peptide Library</h2>

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
    </div>
  )
}
