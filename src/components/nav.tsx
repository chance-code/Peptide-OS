'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  CalendarCheck,
  FileText,
  Package,
  BookOpen,
  MessageCircle,
  Activity,
  MoreHorizontal,
  Settings,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Primary navigation items (always visible)
const primaryNavItems = [
  { href: '/today', label: 'Today', icon: CalendarCheck },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/health', label: 'Health', icon: Activity },
  { href: '/protocols', label: 'Protocols', icon: FileText },
]

// Hub items (in More menu)
const hubItems = [
  { href: '/inventory', label: 'Inventory', icon: Package, description: 'Track your supplies' },
  { href: '/chat', label: 'Chat', icon: MessageCircle, description: 'AI assistant' },
  { href: '/library', label: 'Library', icon: BookOpen, description: 'Peptide reference guide' },
  { href: '/settings', label: 'Settings', icon: Settings, description: 'Preferences & account' },
]

export function BottomNav() {
  const pathname = usePathname()
  const [showHub, setShowHub] = useState(false)

  // Check if any hub item is active
  const hubItemActive = hubItems.some(item => pathname.startsWith(item.href))

  return (
    <>
      {/* Hub Modal */}
      {showHub && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowHub(false)}
          />

          {/* Hub Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface-1)] rounded-t-2xl border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom)] animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-display text-[var(--foreground)]">More</h2>
              <button
                onClick={() => setShowHub(false)}
                className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[var(--muted-foreground)]" />
              </button>
            </div>

            <div className="p-3 space-y-1">
              {hubItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowHub(false)}
                    className={cn(
                      'flex items-center gap-4 p-3 rounded-xl transition-colors',
                      isActive
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                        : 'hover:bg-[var(--muted)] text-[var(--foreground)]'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      isActive ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]'
                    )}>
                      <Icon className={cn(
                        'w-5 h-5',
                        isActive ? 'text-[var(--accent-foreground)]' : 'text-[var(--muted-foreground)]'
                      )} />
                    </div>
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-sm text-[var(--muted-foreground)]">{item.description}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 nav-premium z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {primaryNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  'nav-item flex-1 max-w-[72px]',
                  isActive && 'nav-item-active'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-all',
                    isActive
                      ? 'stroke-[2.5] text-[var(--accent)]'
                      : 'text-[var(--muted-foreground)]'
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium transition-colors',
                    isActive
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--muted-foreground)]'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* More Button */}
          <button
            onClick={() => setShowHub(true)}
            className={cn(
              'nav-item flex-1 max-w-[72px]',
              (showHub || hubItemActive) && 'nav-item-active'
            )}
          >
            <MoreHorizontal
              className={cn(
                'w-5 h-5 transition-all',
                (showHub || hubItemActive)
                  ? 'stroke-[2.5] text-[var(--accent)]'
                  : 'text-[var(--muted-foreground)]'
              )}
            />
            <span
              className={cn(
                'text-[10px] font-medium transition-colors',
                (showHub || hubItemActive)
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--muted-foreground)]'
              )}
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  )
}

export function TopHeader({
  title,
  showSettings = false,
  rightAction,
  transparent = false
}: {
  title?: string
  showSettings?: boolean
  rightAction?: React.ReactNode
  transparent?: boolean
}) {
  const pathname = usePathname()

  // Always render safe area spacer, but only show header content if there's something to display
  const hasContent = title || showSettings || rightAction

  return (
    <header className={cn(
      "sticky top-0 z-40 pt-[env(safe-area-inset-top)]",
      hasContent && !transparent && "glass border-b border-[var(--border)]"
    )}>
      {hasContent && (
        <div className="flex items-center justify-between h-12 px-4 max-w-lg mx-auto">
          <h1 className="text-title text-[var(--foreground)]">
            {title}
          </h1>
          <div className="flex items-center gap-2">
            {rightAction}
            {showSettings && (
              <Link
                href="/settings"
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  pathname === '/settings'
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                )}
              >
                <Settings className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
