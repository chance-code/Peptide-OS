'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { BottomNav, TopHeader } from '@/components/nav'
import { ProfileSelector } from '@/components/profile-selector'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUserId, setCurrentUser } = useAppStore()
  const [showProfileSelector, setShowProfileSelector] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadUser() {
      try {
        // First, check if we have a stored user ID
        if (currentUserId) {
          const res = await fetch(`/api/users/${currentUserId}`)
          if (res.ok) {
            const user = await res.json()
            setCurrentUser(user)
            setIsLoading(false)
            return
          }
        }

        // If no stored user, check for any users
        const usersRes = await fetch('/api/users')
        if (usersRes.ok) {
          const users = await usersRes.json()
          if (users.length > 0) {
            // Find active user or use first
            const activeUser = users.find((u: { isActive: boolean }) => u.isActive) || users[0]
            setCurrentUser(activeUser)
          } else {
            // No users, show profile selector
            setShowProfileSelector(true)
          }
        }
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [currentUserId, setCurrentUser])

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
    <div className="min-h-screen bg-slate-50">
      <TopHeader />
      <main className="pb-20 max-w-lg mx-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
