'use client'

import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
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
        },
        className
      )}
      {...props}
    />
  )
}
