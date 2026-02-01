'use client'

import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200': variant === 'default',
          'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300': variant === 'success',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300': variant === 'warning',
          'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300': variant === 'danger',
          'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300': variant === 'info',
        },
        className
      )}
      {...props}
    />
  )
}
