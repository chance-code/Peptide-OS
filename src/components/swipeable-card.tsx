'use client'

import { useState, useRef, useCallback } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SwipeableCardProps {
  children: React.ReactNode
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  rightLabel?: string
  leftLabel?: string
  disabled?: boolean
  className?: string
}

export function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Done',
  leftLabel = 'Skip',
  disabled = false,
  className,
}: SwipeableCardProps) {
  const [offsetX, setOffsetX] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isDragging = useRef(false)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  const THRESHOLD = 100
  const MAX_OFFSET = 150

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isDragging.current = true
    isHorizontalSwipe.current = null
    setIsAnimating(false)
  }, [disabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || disabled) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const diffX = currentX - startX.current
    const diffY = currentY - startY.current

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      const absX = Math.abs(diffX)
      const absY = Math.abs(diffY)
      if (absX > 15 || absY > 15) {
        // Require horizontal movement to be clearly dominant (1.5x vertical)
        // to avoid capturing near-diagonal touches that are meant for scroll
        isHorizontalSwipe.current = absX > absY * 1.5
        if (!isHorizontalSwipe.current) {
          // Vertical scroll — stop tracking this touch entirely
          isDragging.current = false
          return
        }
      } else {
        // Not enough movement to determine direction yet
        return
      }
    }

    // Confirmed horizontal swipe — prevent vertical scroll interference
    if (isHorizontalSwipe.current) {
      e.preventDefault()

      // Apply resistance at edges
      let adjustedOffset = diffX
      if (Math.abs(diffX) > MAX_OFFSET) {
        const overflow = Math.abs(diffX) - MAX_OFFSET
        adjustedOffset = Math.sign(diffX) * (MAX_OFFSET + overflow * 0.2)
      }

      // Only allow swipe if handler exists
      if ((diffX > 0 && !onSwipeRight) || (diffX < 0 && !onSwipeLeft)) {
        adjustedOffset = adjustedOffset * 0.2
      }

      setOffsetX(adjustedOffset)
    }
  }, [disabled, onSwipeRight, onSwipeLeft])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    isHorizontalSwipe.current = null
    setIsAnimating(true)

    if (offsetX > THRESHOLD && onSwipeRight) {
      // Swipe right - complete
      setOffsetX(300) // Animate out
      setTimeout(() => {
        onSwipeRight()
        setOffsetX(0)
        setIsAnimating(false)
      }, 200)
    } else if (offsetX < -THRESHOLD && onSwipeLeft) {
      // Swipe left - skip
      setOffsetX(-300) // Animate out
      setTimeout(() => {
        onSwipeLeft()
        setOffsetX(0)
        setIsAnimating(false)
      }, 200)
    } else {
      // Return to center
      setOffsetX(0)
    }
  }, [offsetX, onSwipeRight, onSwipeLeft])

  const progress = Math.abs(offsetX) / THRESHOLD
  const isRight = offsetX > 0

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background indicators */}
      <div
        className={cn(
          'absolute inset-0 flex items-center px-6 transition-opacity',
          isRight ? 'justify-start bg-[var(--success)]' : 'justify-end bg-[var(--muted-foreground)]'
        )}
        style={{ opacity: Math.min(progress * 0.8, 0.8) }}
      >
        {isRight ? (
          <div className="flex items-center gap-2 text-white font-medium">
            <Check className="w-6 h-6" />
            <span>{rightLabel}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white font-medium">
            <span>{leftLabel}</span>
            <X className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Card content */}
      <div
        className={cn('relative bg-[var(--background)]', className)}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isAnimating ? 'transform 0.2s ease-out' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
