'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef(0)
  const startTime = useRef(0)

  // Handle escape key and scroll lock
  useEffect(() => {
    if (!isOpen) return

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    // Track scroll position before locking to prevent iOS jump
    const scrollY = window.scrollY
    document.addEventListener('keydown', handleEscape)
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [isOpen, onClose])

  // Touch handlers for drag to dismiss
  function handleTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY
    startTime.current = Date.now()
    setIsDragging(true)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    // Only allow dragging down
    if (diff > 0) {
      setDragY(diff)
    }
  }

  function handleTouchEnd() {
    setIsDragging(false)
    const elapsed = Date.now() - startTime.current
    const velocity = dragY / Math.max(elapsed, 1) // px/ms
    // Close if dragged far enough OR flicked fast enough
    if (dragY > 100 || (dragY > 20 && velocity > 0.5)) {
      onClose()
    }
    setDragY(0)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/40 z-50 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface-1)] rounded-t-2xl shadow-xl border-t border-[var(--border-subtle)]',
          'transform transition-transform duration-300',
          'max-h-[85vh] flex flex-col',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : undefined,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 bg-[var(--border-strong)] rounded-full opacity-60" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-lg text-[var(--foreground)]">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  )
}
