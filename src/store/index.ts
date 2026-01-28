import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types'

interface AppState {
  // Current user
  currentUserId: string | null
  currentUser: UserProfile | null

  // UI state
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentUser: (user: UserProfile | null) => void
  setCurrentUserId: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUserId: null,
      currentUser: null,
      isLoading: false,
      error: null,

      setCurrentUser: (user) => set({ currentUser: user, currentUserId: user?.id ?? null }),
      setCurrentUserId: (id) => set({ currentUserId: id }),
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
