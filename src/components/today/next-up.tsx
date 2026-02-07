/* Next Up — primary action for the next pending dose.
 * Uses accent left-border as divider (not a Card) to reduce visual weight.
 * Spacing: section header mb-3, content py-3 pl-4 (standard scale). */

import { Check, X, Clock, Syringe, Pill } from 'lucide-react'
import type { TodayDoseItem } from '@/types'

interface NextUpProps {
  item: TodayDoseItem
  onComplete: () => void
  onSkip: () => void
  onTap: () => void
}

export function NextUp({ item, onComplete, onSkip, onTap }: NextUpProps) {
  const isSupplement = item.itemType === 'supplement'

  return (
    <section>
      <h2 className="text-label mb-3">Next up</h2>
      <div className="border-l-4 border-l-[var(--accent)] pl-4 py-3">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onTap} className="flex-1 min-w-0 text-left">
            <div className="font-semibold text-[var(--foreground)] mb-1">
              {item.peptideName}
              {item.penUnits != null && (
                <span className="ml-2 text-sm font-normal text-[var(--accent)]">
                  {item.penUnits}u
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              {isSupplement
                ? <Pill className="w-4 h-4" />
                : <Syringe className="w-4 h-4" />}
              <span>
                {isSupplement && item.servingSize
                  ? `${item.servingSize} ${item.servingUnit || 'serving'}${item.servingSize > 1 ? 's' : ''}`
                  : `${item.doseAmount} ${item.doseUnit}`}
              </span>
              {item.timing && (
                <>
                  <span className="text-[var(--border)]">·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {item.timing}
                  </span>
                </>
              )}
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity active:scale-95"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
