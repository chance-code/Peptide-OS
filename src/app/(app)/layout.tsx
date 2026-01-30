'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { BottomNav, TopHeader } from '@/components/nav'
import { ProfileSelector } from '@/components/profile-selector'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { setCurrentUser } = useAppStore()
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

        // Always use the active user from the database
        const activeUser = users.find((u: { isActive: boolean }) => u.isActive) || users[0]
        setCurrentUser(activeUser)
        setLocalCurrentUserId(activeUser.id)
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [setCurrentUser])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
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
    <div className="h-dvh flex flex-col bg-slate-50">
      <TopHeader />
      <main className="flex-1 pb-14 max-w-lg mx-auto w-full overflow-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
