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
    <nav className="fixed bottom-0 left-0 right-0 glass border-t border-slate-200/50 dark:border-slate-700/50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'flex items-center justify-center flex-1 h-full transition-colors',
                isActive
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              )}
            >
              <Icon className={cn('w-6 h-6', isActive && 'stroke-[2.5]')} />
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
    <header className="sticky top-0 z-40 glass border-b border-slate-200/50 dark:border-slate-700/50">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          {title || 'Peptide OS'}
        </h1>
        <Link
          href="/settings"
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
            pathname === '/settings'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
          )}
        >
          {initials}
        </Link>
      </div>
    </header>
  )
}
