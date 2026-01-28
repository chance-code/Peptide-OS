'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  CalendarCheck,
  FileText,
  Package,
  Calculator,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/today', label: 'Today', icon: CalendarCheck },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/protocols', label: 'Protocols', icon: FileText },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/reconstitution', label: 'Calc', icon: Calculator },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors',
                isActive ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function TopHeader({ title }: { title?: string }) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <h1 className="text-lg font-semibold text-slate-900">
          {title || 'Peptide OS'}
        </h1>
        <Link
          href="/settings"
          className={cn(
            'p-2 rounded-full transition-colors',
            pathname === '/settings'
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-500 hover:bg-slate-100'
          )}
        >
          <User className="w-5 h-5" />
        </Link>
      </div>
    </header>
  )
}
