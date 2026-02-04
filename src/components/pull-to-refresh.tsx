'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  className?: string
}

// SCROLL INVARIANT: This component does NOT create a scroll container.
// It attaches touch handlers to the nearest scroll ancestor (data-scroll-container)
// and only activates the pull gesture when that ancestor is scrolled to the top.

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<Element | null>(null)
  const startY = useRef(0)
  const isPulling = useRef(false)
  const isConfirmedPull = useRef(false)
  const pullDistanceRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)

  const THRESHOLD = 80
  const MAX_PULL = 120
  const DIRECTION_LOCK_THRESHOLD = 10

  onRefreshRef.current = onRefresh
  isRefreshingRef.current = isRefreshing

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    // Find the nearest scroll container — the app layout's <main>
    const scrollContainer = (wrapper.closest('[data-scroll-container]') || wrapper.parentElement) as HTMLElement | null
    scrollContainerRef.current = scrollContainer

    if (!scrollContainer) return

    function onTouchStart(e: TouchEvent) {
      if (isRefreshingRef.current) return
      // Only start pull detection when scroll container is at the top
      if (scrollContainerRef.current && scrollContainerRef.current.scrollTop <= 0) {
        startY.current = e.touches[0].clientY
        isPulling.current = true
        isConfirmedPull.current = false
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPulling.current || isRefreshingRef.current) return

      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current

      if (diff < 0) {
        isPulling.current = false
        isConfirmedPull.current = false
        pullDistanceRef.current = 0
        setPullDistance(0)
        return
      }

      if (!isConfirmedPull.current) {
        if (diff > DIRECTION_LOCK_THRESHOLD) {
          isConfirmedPull.current = true
        } else {
          return
        }
      }

      e.preventDefault()

      const resistance = 0.5
      const adjustedDiff = Math.min(diff * resistance, MAX_PULL)
      pullDistanceRef.current = adjustedDiff
      setPullDistance(adjustedDiff)
    }

    async function onTouchEnd() {
      if (!isPulling.current) return
      isPulling.current = false
      isConfirmedPull.current = false

      const currentPull = pullDistanceRef.current
      pullDistanceRef.current = 0

      if (currentPull >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true
        setPullDistance(60)

        try {
          await onRefreshRef.current()
        } finally {
          isRefreshingRef.current = false
          setPullDistance(0)
        }
      } else {
        setPullDistance(0)
      }
    }

    function onTouchCancel() {
      isPulling.current = false
      isConfirmedPull.current = false
      pullDistanceRef.current = 0
      if (!isRefreshingRef.current) {
        setPullDistance(0)
      }
    }

    // Attach to the scroll container so we detect gestures at the right level
    scrollContainer.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollContainer.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollContainer.addEventListener('touchend', onTouchEnd)
    scrollContainer.addEventListener('touchcancel', onTouchCancel)

    return () => {
      scrollContainer.removeEventListener('touchstart', onTouchStart)
      scrollContainer.removeEventListener('touchmove', onTouchMove)
      scrollContainer.removeEventListener('touchend', onTouchEnd)
      scrollContainer.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])

  useEffect(() => {
    isRefreshingRef.current = isRefreshing
  }, [isRefreshing])

  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const rotation = progress * 180

  return (
    <div
      ref={wrapperRef}
      className={cn('relative', className)}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center transition-opacity z-10"
        style={{
          top: pullDistance - 40,
          opacity: pullDistance > 10 ? 1 : 0,
        }}
      >
        <div
          className={cn(
            'w-10 h-10 rounded-full bg-[var(--background)] shadow-lg flex items-center justify-center',
            isRefreshing && 'animate-spin'
          )}
        >
          <RefreshCw
            className="w-5 h-5 text-[var(--muted-foreground)]"
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>
      </div>

      {/* Content — no overflow-auto, no scroll container */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}
