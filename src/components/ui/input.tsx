'use client'

import { forwardRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, onFocus, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    // Handle iOS keyboard - scroll input into view with a delay
    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      // Call original onFocus if provided
      onFocus?.(e)

      // On iOS, scroll the input into view after keyboard appears
      if (typeof window !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
      }
    }, [onFocus])

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-label block mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          onFocus={handleFocus}
          className={cn(
            'w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent',
            'disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)] disabled:cursor-not-allowed',
            'transition-all',
            error && 'border-[var(--error)] focus:ring-[var(--error)]',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-[var(--error)]">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
