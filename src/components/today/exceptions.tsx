/* Exceptions — conditional alerts section.
 * Only renders when something is wrong (expired vials).
 * Spacing: section header mb-3, alert rows py-3 px-3 (standard scale). */

import { AlertTriangle } from 'lucide-react'
import type { TodayDoseItem } from '@/types'

interface ExceptionsProps {
  items: TodayDoseItem[]
}

export function Exceptions({ items }: ExceptionsProps) {
  const expiredItems = items.filter(i => i.vialExpired)
  if (expiredItems.length === 0) return null

  return (
    <section>
      <h2 className="text-label mb-3">Attention</h2>
      <div className="space-y-2">
        {expiredItems.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-3 py-3 px-3 rounded-lg bg-[var(--muted)]"
          >
            <AlertTriangle className="w-4 h-4 text-[var(--warning)] flex-shrink-0" />
            <span className="text-sm text-[var(--foreground)]">
              {item.peptideName} vial is expired
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
