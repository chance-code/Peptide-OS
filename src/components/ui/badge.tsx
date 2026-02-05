'use client'

import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'evidence' | 'tier-1' | 'tier-2' | 'tier-3' | 'tier-4'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide',
        {
          'bg-[var(--muted)] text-[var(--muted-foreground)]': variant === 'default',
          'bg-[var(--success-muted)] text-[var(--success)]': variant === 'success',
          'bg-[var(--warning-muted)] text-[var(--warning)]': variant === 'warning',
          'bg-[var(--error-muted)] text-[var(--error)]': variant === 'danger',
          'bg-[var(--info-muted)] text-[var(--info)]': variant === 'info',
          'bg-[var(--accent-muted)] text-[var(--accent)]': variant === 'accent',
          'bg-[var(--evidence-muted)] text-[var(--evidence)]': variant === 'evidence',
          'bg-[rgba(139,158,124,0.12)] text-[var(--tier-1)]': variant === 'tier-1',
          'bg-[rgba(212,165,116,0.12)] text-[var(--tier-2)]': variant === 'tier-2',
          'bg-[rgba(155,125,212,0.12)] text-[var(--tier-3)]': variant === 'tier-3',
          'bg-[rgba(124,165,212,0.12)] text-[var(--tier-4)]': variant === 'tier-4',
        },
        className
      )}
      {...props}
    />
  )
}
