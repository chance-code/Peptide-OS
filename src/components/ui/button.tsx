'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97]',
          {
            // Primary - Uses accent color
            'bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90 focus:ring-[var(--accent)] shadow-md hover:shadow-lg':
              variant === 'primary',
            // Secondary - Muted background
            'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)] focus:ring-[var(--ring)]':
              variant === 'secondary',
            // Ghost - Transparent
            'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:ring-[var(--ring)]':
              variant === 'ghost',
            // Danger - Error color
            'bg-[var(--error)] text-white hover:opacity-90 focus:ring-[var(--error)]':
              variant === 'danger',
            // Success - Success color
            'bg-[var(--success)] text-white hover:opacity-90 focus:ring-[var(--success)]':
              variant === 'success',
          },
          {
            'h-9 px-4 text-sm': size === 'sm',
            'h-11 px-5 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }
