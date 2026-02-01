'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { BottomNav, TopHeader } from '@/components/nav'
import { ProfileSelector } from '@/components/profile-selector'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUserId: storedUserId, setCurrentUser } = useAppStore()
  const [showProfileSelector, setShowProfileSelector] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentUserId, setLocalCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    async function loadUser() {
      try {
        // Fetch all users
        const usersRes = await fetch('/api/users')
        if (!usersRes.ok) {
          setIsLoading(false)
          return
        }

        const users = await usersRes.json()
        if (users.length === 0) {
          setShowProfileSelector(true)
          setIsLoading(false)
          return
        }

        // Check if we have a stored user ID from localStorage (via Zustand)
        // This allows each browser/device to have its own independent profile
        let userToUse = null

        if (storedUserId) {
          // Try to find the stored user
          userToUse = users.find((u: { id: string }) => u.id === storedUserId)
        }

        // If no stored user or stored user not found, show profile selector
        if (!userToUse) {
          setShowProfileSelector(true)
          setIsLoading(false)
          return
        }

        setCurrentUser(userToUse)
        setLocalCurrentUserId(userToUse.id)
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [setCurrentUser, storedUserId])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)]">Loading...</div>
      </div>
    )
  }

  if (showProfileSelector || !currentUserId) {
    return (
      <ProfileSelector
        onSelect={() => setShowProfileSelector(false)}
      />
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
