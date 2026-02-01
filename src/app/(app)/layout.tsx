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
        const sessionUserEmail = session?.user?.email // Used as fallback for name

        console.log('Session info:', { name: sessionUserName, email: sessionUserEmail })

        // Fetch all users
        const usersRes = await fetch('/api/users')
        if (!usersRes.ok) {
          console.error('Failed to fetch users:', usersRes.status)
          setIsLoading(false)
          return
        }

        const users = await usersRes.json()
        console.log('Found users:', users.length)
        let userToUse = null

        // Try to find user by name
        if (sessionUserName) {
          userToUse = users.find((u: { name: string }) => u.name === sessionUserName)
          console.log('Found by name:', !!userToUse)
        }

        // If session user doesn't exist in database, create them
        if (!userToUse && (sessionUserName || sessionUserEmail)) {
          const userName = sessionUserName || sessionUserEmail?.split('@')[0] || 'User'
          console.log('Creating user with name:', userName)
          const createRes = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: userName }),
          })
          console.log('Create response:', createRes.status)
          if (createRes.ok) {
            userToUse = await createRes.json()
            console.log('Created user:', userToUse)
          } else {
            const errorText = await createRes.text()
            console.error('Create failed:', errorText)
          }
        }

        // Fallback: check stored user ID
        if (!userToUse && storedUserId) {
          userToUse = users.find((u: { id: string }) => u.id === storedUserId)
          console.log('Found by stored ID:', !!userToUse)
        }

        // If still no user, use the first user (shouldn't happen with proper auth)
        if (!userToUse && users.length > 0) {
          userToUse = users[0]
          console.log('Using first user as fallback')
        }

        if (userToUse) {
          setCurrentUser(userToUse)
          setLocalCurrentUserId(userToUse.id)
          console.log('Set current user:', userToUse.id)
        } else {
          console.error('No user found or created!')
        }
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [setCurrentUser, storedUserId, session?.user?.name, sessionStatus])

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
      <main className="flex-1 pb-16 max-w-lg mx-auto w-full overflow-auto animate-page-in">{children}</main>
      <BottomNav />
    </div>
  )
}
