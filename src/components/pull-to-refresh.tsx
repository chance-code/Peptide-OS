'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  className?: string
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const isPulling = useRef(false)
  const pullDistanceRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)

  const THRESHOLD = 80
  const MAX_PULL = 120

  // Keep refs in sync with latest values
  onRefreshRef.current = onRefresh
  isRefreshingRef.current = isRefreshing

  // Use native event listeners so we can set { passive: false }
  // and call preventDefault() to stop iOS native scroll bounce
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onTouchStart(e: TouchEvent) {
      if (!container || isRefreshingRef.current) return
      if (container.scrollTop <= 0) {
        startY.current = e.touches[0].clientY
        isPulling.current = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPulling.current || isRefreshingRef.current) return

      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current

      if (diff > 0) {
        // Prevent native scroll bounce — this is why we need { passive: false }
        e.preventDefault()

        const resistance = 0.5
        const adjustedDiff = Math.min(diff * resistance, MAX_PULL)
        pullDistanceRef.current = adjustedDiff
        setPullDistance(adjustedDiff)
      } else {
        // User scrolling up — cancel pull and let native scroll handle it
        isPulling.current = false
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
    }

    async function onTouchEnd() {
      if (!isPulling.current) return
      isPulling.current = false

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
      pullDistanceRef.current = 0
      if (!isRefreshingRef.current) {
        setPullDistance(0)
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)
    container.addEventListener('touchcancel', onTouchCancel)

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchCancel)
    }
  }, []) // Stable — all mutable state accessed via refs

  // Sync isRefreshing state to ref (for the spinner UI)
  useEffect(() => {
    isRefreshingRef.current = isRefreshing
  }, [isRefreshing])

  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const rotation = progress * 180

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full overflow-auto overscroll-none', className)}
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
            'w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg flex items-center justify-center',
            isRefreshing && 'animate-spin'
          )}
        >
          <RefreshCw
            className="w-5 h-5 text-slate-600 dark:text-slate-300"
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>
      </div>

      {/* Content */}
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
