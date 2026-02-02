'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  CalendarCheck,
  FileText,
  Package,
  BookOpen,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

const navItems = [
  { href: '/today', label: 'Today', icon: CalendarCheck },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/protocols', label: 'Protocols', icon: FileText },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/reconstitution', label: 'Library', icon: BookOpen },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 nav-premium z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
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
      </div>
    </nav>
  )
}

export function TopHeader({ title }: { title?: string }) {
  const pathname = usePathname()
  const { currentUser } = useAppStore()
  const initials = currentUser?.name ? getInitials(currentUser.name) : '?'

  return (
    <header className="sticky top-0 z-40 glass border-b border-[var(--border)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-12 px-4 max-w-lg mx-auto">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {title || 'Arc Protocol'}
        </h1>
        <Link
          href="/settings"
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
            pathname === '/settings'
              ? 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-lg'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
          )}
        >
          {initials}
        </Link>
      </div>
    </header>
  )
}
