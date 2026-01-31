import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types'

interface AppState {
  // Current user
  currentUserId: string | null
  currentUser: UserProfile | null

  // Premium state
  isPremium: boolean
  showPaywall: boolean

  // UI state
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentUser: (user: UserProfile | null) => void
  setCurrentUserId: (id: string | null) => void
  setIsPremium: (isPremium: boolean) => void
  setShowPaywall: (show: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUserId: null,
      currentUser: null,
      isPremium: true, // Default to true for now (no paywall until configured)
      showPaywall: false,
      isLoading: false,
      error: null,

      setCurrentUser: (user) => set({ currentUser: user, currentUserId: user?.id ?? null }),
      setCurrentUserId: (id) => set({ currentUserId: id }),
      setIsPremium: (isPremium) => set({ isPremium }),
      setShowPaywall: (show) => set({ showPaywall: show }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'peptide-os-storage',
      partialize: (state) => ({ currentUserId: state.currentUserId }),
    }
  )
)

// Selector hooks for convenience
export const useCurrentUser = () => useAppStore((state) => state.currentUser)
export const useCurrentUserId = () => useAppStore((state) => state.currentUserId)
export const useIsLoading = () => useAppStore((state) => state.isLoading)
export const useError = () => useAppStore((state) => state.error)
