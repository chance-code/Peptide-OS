'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'

/**
 * Fixes Safari toolbar persisting after OAuth in Capacitor iOS app.
 * When OAuth completes and redirects back, the webview can get stuck
 * showing the Safari toolbar. This component detects the OAuth completion
 * and forces a navigation reset to clear the toolbar.
 */
export function CapacitorOAuthFix() {
  const { status } = useSession()
  const pathname = usePathname()

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Check if we're in Capacitor
    const isCapacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.()

    if (!isCapacitor) return

    // Check if OAuth just completed (landing on app pages after being on login)
    const oauthInProgress = sessionStorage.getItem('oauth_in_progress')
    const hasFixedToolbar = sessionStorage.getItem('capacitor_toolbar_fixed')

    if (oauthInProgress && status === 'authenticated' && !hasFixedToolbar) {
      sessionStorage.removeItem('oauth_in_progress')
      sessionStorage.setItem('capacitor_toolbar_fixed', 'true')

      // Use location.replace to clear navigation history and reset webview
      setTimeout(() => {
        // Navigate to current path, clearing history
        window.location.replace(window.location.origin + pathname)
      }, 300)
    }

    // Clear the fixed flag when going to login page (starting fresh)
    if (pathname === '/login') {
      sessionStorage.removeItem('capacitor_toolbar_fixed')
    }
  }, [status, pathname])

  return null
}
