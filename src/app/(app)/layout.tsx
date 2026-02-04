'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAppStore } from '@/store'
import { BottomNav, TopHeader } from '@/components/nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const { currentUserId: storedUserId, setCurrentUser } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [currentUserId, setLocalCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    // Wait for session to finish loading before making decisions
    if (sessionStatus === 'loading') {
      return
    }

    async function loadUser() {
      try {
        // Get the logged-in user's info from the session
        const sessionUserName = session?.user?.name
        const sessionUserEmail = session?.user?.email

        // Fetch all users
        const usersRes = await fetch('/api/users')
        if (!usersRes.ok) {
          setIsLoading(false)
          return
        }

        const users = await usersRes.json()
        let userToUse = null

        // Try to find user by name (mapped from email in auth callback)
        if (sessionUserName) {
          userToUse = users.find((u: { name: string }) => u.name === sessionUserName)
        }

        // If session user doesn't exist in database, create them
        if (!userToUse && (sessionUserName || sessionUserEmail)) {
          const userName = sessionUserName || sessionUserEmail?.split('@')[0] || 'User'
          const createRes = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: userName }),
          })
          if (createRes.ok) {
            userToUse = await createRes.json()
          }
        }

        // Fallback: check stored user ID
        if (!userToUse && storedUserId) {
          userToUse = users.find((u: { id: string }) => u.id === storedUserId)
        }

        // If still no user, use the first user (shouldn't happen with proper auth)
        if (!userToUse && users.length > 0) {
          userToUse = users[0]
        }

        if (userToUse) {
          setCurrentUser(userToUse)
          setLocalCurrentUserId(userToUse.id)
        }
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  // Only re-run when session status changes (authenticated/unauthenticated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  if (isLoading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)]">Loading...</div>
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)]">Setting up your profile...</div>
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
