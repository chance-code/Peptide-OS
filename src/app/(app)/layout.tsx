'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAppStore } from '@/store'
import { BottomNav, TopHeader } from '@/components/nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status: sessionStatus } = useSession()
  const { setCurrentUser, setCurrentUserId, setUserHydrated } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (sessionStatus === 'loading') return

    async function bootstrap() {
      try {
        // Step 1: Get the profileId from the session (no DB query)
        const meRes = await fetch('/api/me')
        if (!meRes.ok) {
          console.error('[layout] /api/me failed:', meRes.status)
          setIsLoading(false)
          return
        }

        const { profileId, profileName } = await meRes.json()
        if (!profileId) {
          console.error('[layout] /api/me returned no profileId')
          setIsLoading(false)
          return
        }

        // Step 2: Set the userId in the store immediately so queries can start
        setCurrentUserId(profileId)

        // Step 3: Fetch full user profile for display purposes
        const usersRes = await fetch('/api/users')
        if (usersRes.ok) {
          const users = await usersRes.json()
          const user = users.find((u: { id: string }) => u.id === profileId)
          if (user) {
            setCurrentUser(user)
          }
        }

        setHydrated(true)
        setUserHydrated(true)
      } catch (error) {
        console.error('[layout] Bootstrap error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    bootstrap()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  if (isLoading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)] animate-blur-reveal">Loading...</div>
      </div>
    )
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)] animate-blur-reveal">Setting up your profile...</div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-[var(--background)]">
      <TopHeader />
      {/* SCROLL INVARIANT: This is the ONE vertical scroll container for the entire app.
          No child page or component may create a competing vertical scroll container.
          PullToRefresh, page content, and all tab views scroll through this element. */}
      <main
        data-scroll-container
        className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] max-w-lg mx-auto w-full overflow-auto overscroll-none animate-page-in"
      >{children}</main>
      <BottomNav />
    </div>
  )
}
