/* Dose Plan — time-grouped list of remaining doses.
 * Calm, list-based. No cards.
 * Spacing: section header mb-3, group label mb-2, item py-3 px-3 (standard scale). */

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TodayDoseItem } from '@/types'

interface DosePlanProps {
  items: TodayDoseItem[]
  nextUpId?: string
  onComplete: (item: TodayDoseItem) => void
  onSkip: (item: TodayDoseItem) => void
  onUndo: (item: TodayDoseItem) => void
  onTap: (item: TodayDoseItem) => void
  justCompleted: Set<string>
}

const TIME_ORDER = ['Morning', 'Afternoon', 'Evening']

function getTimeGroup(timing: string | null | undefined): string {
  if (!timing) return 'Anytime'
  const t = timing.toLowerCase()
  if (t.includes('morning') || t === 'am' || t.includes('fasted') || t.includes('breakfast') || t.includes('wake'))
    return 'Morning'
  if (t.includes('afternoon') || t.includes('lunch') || t.includes('midday') || t.includes('noon'))
    return 'Afternoon'
  if (t.includes('evening') || t === 'pm' || t.includes('night') || t.includes('bed') || t.includes('dinner'))
    return 'Evening'
  return timing
}

export function DosePlan({ items, nextUpId, onComplete, onSkip, onUndo, onTap, justCompleted }: DosePlanProps) {
  const planItems = nextUpId ? items.filter(i => i.id !== nextUpId) : items
  if (planItems.length === 0) return null

  const groups = new Map<string, TodayDoseItem[]>()
  for (const item of planItems) {
    const group = getTimeGroup(item.timing)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(item)
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    const ai = TIME_ORDER.indexOf(a)
    const bi = TIME_ORDER.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  return (
    <section>
      <h2 className="text-label mb-3">Plan</h2>
      <div className="space-y-4">
        {sortedGroups.map(([group, groupItems]) => (
          <div key={group}>
            <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
              {group}
            </div>
            <div className="space-y-1">
              {groupItems.map(item => (
                <PlanItem
                  key={item.id}
                  item={item}
                  justCompleted={justCompleted.has(item.id)}
                  onComplete={() => onComplete(item)}
                  onSkip={() => onSkip(item)}
                  onUndo={() => onUndo(item)}
                  onTap={() => onTap(item)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PlanItem({
  item,
  justCompleted,
  onComplete,
  onSkip,
  onUndo,
  onTap,
}: {
  item: TodayDoseItem
  justCompleted: boolean
  onComplete: () => void
  onSkip: () => void
  onUndo: () => void
  onTap: () => void
}) {
  const isSupplement = item.itemType === 'supplement'
  const isCompleted = item.status === 'completed'
  const isSkipped = item.status === 'skipped'
  const isPending = item.status === 'pending'

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-3 px-3 rounded-lg transition-colors',
        isPending && 'hover:bg-[var(--muted)]',
        (isCompleted || isSkipped) && 'opacity-50',
      )}
    >
      {/* Status dot — animates on completion */}
      <div
        className={cn(
          'w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200',
          isCompleted && 'bg-[var(--success)]',
          isPending && 'bg-[var(--accent)]',
          isSkipped && 'bg-[var(--muted-foreground)]',
        )}
        style={justCompleted ? { animation: 'checkPop 0.4s cubic-bezier(0.16, 1, 0.3, 1)' } : undefined}
      />

      {/* Content */}
      <button type="button" onClick={onTap} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium',
              (isCompleted || isSkipped) && 'line-through text-[var(--muted-foreground)]',
              isPending && 'text-[var(--foreground)]',
            )}
          >
            {item.peptideName}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {isSupplement && item.servingSize
              ? `${item.servingSize} ${item.servingUnit || 'serving'}${item.servingSize > 1 ? 's' : ''}`
              : `${item.doseAmount} ${item.doseUnit}`}
          </span>
        </div>
      </button>

      {/* Actions */}
      {isPending ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onSkip}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--success)] hover:text-[var(--success)] transition-all active:scale-95"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onUndo}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2 py-1"
        >
          {isCompleted ? 'Undo' : 'Unskip'}
        </button>
      )}
    </div>
  )
}
