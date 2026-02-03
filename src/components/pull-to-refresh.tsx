'use client'

import { useState, useRef, useCallback } from 'react'
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

  const THRESHOLD = 80
  const MAX_PULL = 120

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current
    if (!container || isRefreshing) return

    // Only allow pull-to-refresh when scrolled to top
    if (container.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      isPulling.current = true
    }
  }, [isRefreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return

    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current

    if (diff > 0) {
      // Apply resistance as we pull further
      const resistance = 0.5
      const adjustedDiff = Math.min(diff * resistance, MAX_PULL)
      setPullDistance(adjustedDiff)
    }
  }, [isRefreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return
    isPulling.current = false

    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(60) // Hold at refresh position

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, isRefreshing, onRefresh])

  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const rotation = progress * 180

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full overflow-auto', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
