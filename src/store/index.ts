import { create } from 'zustand'
import type { UserProfile } from '@/types'

interface AppState {
  // Current user
  currentUserId: string | null
  currentUser: UserProfile | null
  isUserHydrated: boolean

  // Premium state
  isPremium: boolean
  showPaywall: boolean

  // UI state
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentUser: (user: UserProfile | null) => void
  setCurrentUserId: (id: string | null) => void
  setUserHydrated: (hydrated: boolean) => void
  setIsPremium: (isPremium: boolean) => void
  setShowPaywall: (show: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAppStore = create<AppState>()(
  (set) => ({
    currentUserId: null,
    currentUser: null,
    isUserHydrated: false,
    isPremium: true,
    showPaywall: false,
    isLoading: false,
    error: null,

    setCurrentUser: (user) => set({ currentUser: user, currentUserId: user?.id ?? null }),
    setCurrentUserId: (id) => set({ currentUserId: id }),
    setUserHydrated: (hydrated) => set({ isUserHydrated: hydrated }),
    setIsPremium: (isPremium) => set({ isPremium }),
    setShowPaywall: (show) => set({ showPaywall: show }),
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),
  })
)

// Selector hooks for convenience
export const useCurrentUser = () => useAppStore((state) => state.currentUser)
export const useCurrentUserId = () => useAppStore((state) => state.currentUserId)
export const useIsUserHydrated = () => useAppStore((state) => state.isUserHydrated)
export const useIsLoading = () => useAppStore((state) => state.isLoading)
export const useError = () => useAppStore((state) => state.error)
