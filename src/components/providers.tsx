'use client'

import { SessionProvider } from 'next-auth/react'
import { QueryProvider } from './query-provider'
import { ThemeProvider } from './theme-provider'
import { CapacitorOAuthFix } from './capacitor-oauth-fix'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <QueryProvider>
          <CapacitorOAuthFix />
          {children}
        </QueryProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
