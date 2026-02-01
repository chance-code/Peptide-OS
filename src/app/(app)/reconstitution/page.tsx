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
    <Card className="overflow-hidden">
      <button
        className="w-full text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-900 dark:text-white">{peptide.name}</span>
                <Badge className={cn('text-xs', categoryInfo.color)}>
                  <CategoryIcon className="w-3 h-3 mr-1" />
                  {categoryInfo.label}
                </Badge>
              </div>
              {peptide.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{peptide.description}</p>
              )}
            </div>
            <div className="ml-2 text-slate-400">
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/50">
          <div className="grid grid-cols-2 gap-3 pt-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Typical Dose</div>
              <div className="font-medium text-slate-900 dark:text-white">
                {peptide.typicalDose.min === peptide.typicalDose.max
                  ? `${peptide.typicalDose.min} ${peptide.typicalDose.unit}`
                  : `${peptide.typicalDose.min}-${peptide.typicalDose.max} ${peptide.typicalDose.unit}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Vial Sizes</div>
              <div className="font-medium text-slate-900 dark:text-white">
                {peptide.typicalVialSizes.map(v => `${v.amount}${v.unit}`).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">BAC Water</div>
              <div className="font-medium text-slate-900 dark:text-white">{peptide.recommendedDiluentMl} mL</div>
            </div>
            {peptide.aliases && peptide.aliases.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Also Known As</div>
                <div className="font-medium text-slate-900 dark:text-white text-sm">
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
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Peptide Library</h2>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="text-sm text-slate-500 dark:text-slate-400 mb-3">
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
              <p className="text-slate-500 dark:text-slate-400">No peptides found</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Try a different search term</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Info note */}
      <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        Tap a peptide for dosing details
      </div>
    </div>
  )
}
