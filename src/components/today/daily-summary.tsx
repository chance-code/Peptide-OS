import type { TodayDoseItem } from '@/types'

interface DailySummaryProps {
  items: TodayDoseItem[]
  summary: { total: number; completed: number; pending: number; skipped: number }
}

export function DailySummary({ items, summary }: DailySummaryProps) {
  const nextPending = items.find(i => i.status === 'pending')

  let sentence: string
  if (summary.total === 0) {
    sentence = 'Rest day — nothing scheduled.'
  } else if (summary.pending === 0) {
    sentence = `All done — ${summary.total} dose${summary.total !== 1 ? 's' : ''} completed.`
  } else {
    const prefix = summary.completed > 0
      ? `${summary.completed} of ${summary.total} done`
      : `${summary.total} scheduled`
    if (nextPending) {
      const timing = nextPending.timing
        ? ` at ${nextPending.timing.toLowerCase()}`
        : ''
      sentence = `${prefix}, next is ${nextPending.peptideName}${timing}.`
    } else {
      sentence = `${prefix}.`
    }
  }

  return (
    <p className="text-base text-[var(--muted-foreground)] leading-relaxed">
      {sentence}
    </p>
  )
}
