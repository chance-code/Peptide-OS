'use client'

/**
 * Capacitor Native Authentication Helper
 *
 * Google/Apple OAuth on iOS uses SFSafariViewController (via @capacitor/browser)
 * to avoid Google's embedded webview restriction. After OAuth completes,
 * a transfer token is passed back to the app via the arcprotocol:// URL scheme,
 * then exchanged for session cookies in the WKWebView.
 */

const BASE_URL = 'https://peptide-os-production.up.railway.app'

// Check if we're running in Capacitor
export function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return capacitor?.isNativePlatform?.() ?? false
}

// Google Sign-In user type
interface GoogleUser {
  email: string
  familyName: string | null
  givenName: string | null
  id: string
  imageUrl: string | null
  name: string | null
  authentication: {
    accessToken: string
    idToken: string
    refreshToken?: string
  }
}

// Apple Sign-In response type
interface AppleSignInResponse {
  response: {
    user: string | null
    email: string | null
    givenName: string | null
    familyName: string | null
    identityToken: string
    authorizationCode: string
  }
}

/**
 * Open OAuth in SFSafariViewController and wait for callback via URL scheme.
 * This avoids Google's embedded webview (WKWebView) restriction.
 *
 * Flow:
 * 1. Open NextAuth sign-in URL in SFSafariViewController
 * 2. User authenticates with provider
 * 3. NextAuth callback sets session cookies in SFSafariViewController
 * 4. Redirect to /api/auth/mobile-token which reads the session
 * 5. mobile-token creates a transfer JWT and redirects to arcprotocol://auth-callback?token=X
 * 6. Capacitor catches the URL scheme, Browser closes
 * 7. WKWebView calls /api/auth/mobile-exchange with the transfer token
 * 8. mobile-exchange sets session cookies in the WKWebView
 */
async function openOAuthInBrowser(
  provider: 'google' | 'apple'
): Promise<{ success: boolean; error?: string }> {
  if (!isCapacitor()) {
    return { success: false, error: 'Not in Capacitor' }
  }

  try {
    const [{ Browser }, { App }] = await Promise.all([
      import('@capacitor/browser'),
      import('@capacitor/app'),
    ])

    return new Promise((resolve) => {
      let resolved = false

      // Timeout after 2 minutes
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({ success: false, error: 'Authentication timed out' })
        }
      }, 120000)

      // Listen for the URL scheme callback
      const urlListener = App.addListener('appUrlOpen', async (event) => {
        if (!event.url.startsWith('arcprotocol://auth-callback')) return
        if (resolved) return
        resolved = true
        clearTimeout(timeout)

        try {
          // Close the browser
          await Browser.close()

          // Extract the transfer token
          const url = new URL(event.url)
          const transferToken = url.searchParams.get('token')

          if (!transferToken) {
            cleanup()
            resolve({ success: false, error: 'No token received' })
            return
          }

          // Exchange the transfer token for session cookies in the WKWebView
          const res = await fetch('/api/auth/mobile-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: transferToken }),
          })

          if (res.ok) {
            cleanup()
            // Navigate to the app
            window.location.href = '/today'
            resolve({ success: true })
          } else {
            const data = await res.json()
            cleanup()
            resolve({ success: false, error: data.error || 'Token exchange failed' })
          }
        } catch (err) {
          cleanup()
          resolve({
            success: false,
            error: err instanceof Error ? err.message : 'Auth callback error',
          })
        }
      })

      // Also listen for browser close (user cancelled)
      // Use a delay to avoid race condition: when the custom URL scheme fires,
      // iOS may close SFSafariViewController before appUrlOpen is dispatched.
      // Give appUrlOpen 1.5s to fire before treating browser close as cancellation.
      const browserListener = Browser.addListener('browserFinished', () => {
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            resolve({ success: false, error: 'Authentication cancelled' })
          }
        }, 1500)
      })

      function cleanup() {
        urlListener.then(h => h.remove()).catch(() => {})
        browserListener.then(h => h.remove()).catch(() => {})
      }

      // The callback URL after OAuth completes — goes to mobile-token which reads the
      // SFSafariViewController session and redirects to the arcprotocol:// URL scheme
      const callbackUrl = `${BASE_URL}/api/auth/mobile-token`
      const signInUrl = `${BASE_URL}/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`

      // Open in SFSafariViewController (not the WKWebView)
      Browser.open({ url: signInUrl, presentationStyle: 'popover' })
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open auth browser',
    }
  }
}

/**
 * Native Google Sign-In via SFSafariViewController
 * Opens Google OAuth in an in-app browser to avoid WKWebView restriction.
 */
export async function nativeGoogleSignIn(): Promise<{
  success: boolean
  user?: GoogleUser
  error?: string
  useWebAuth?: boolean
}> {
  if (!isCapacitor()) {
    // On web, use standard NextAuth flow
    return { success: false, useWebAuth: true }
  }

  // Use SFSafariViewController for OAuth
  const result = await openOAuthInBrowser('google')
  return {
    success: result.success,
    error: result.error,
    // Don't fall back to web auth — that's what was failing in the WKWebView
    useWebAuth: false,
  }
}

/**
 * Native Google Sign-Out
 */
export async function nativeGoogleSignOut(): Promise<boolean> {
  if (!isCapacitor()) return false

  try {
    const { GoogleAuth } = await import('@southdevs/capacitor-google-auth')
    await GoogleAuth.signOut()
    return true
  } catch (error) {
    console.error('Google Sign-Out error:', error)
    return false
  }
}

/**
 * Native Apple Sign-In via SFSafariViewController
 */
export async function nativeAppleSignIn(): Promise<{
  success: boolean
  response?: AppleSignInResponse['response']
  error?: string
  useWebAuth?: boolean
}> {
  if (!isCapacitor()) {
    return { success: false, useWebAuth: true }
  }

  const result = await openOAuthInBrowser('apple')
  return {
    success: result.success,
    error: result.error,
    useWebAuth: false,
  }
}

/**
 * Exchange native auth credentials for a session
 */
export async function exchangeNativeCredentials(
  provider: 'google' | 'apple',
  credentials: {
    idToken?: string
    accessToken?: string
    authorizationCode?: string
    user?: {
      email?: string | null
      name?: string | null
      givenName?: string | null
      familyName?: string | null
    }
  }
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const res = await fetch('/api/auth/native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        ...credentials,
      }),
    })

    if (res.ok) {
      // Reload the page to pick up the new session
      window.location.href = '/today'
      return { success: true }
    }

    const error = await res.json()
    return { success: false, error: error.error || 'Authentication failed' }
  } catch (error) {
    console.error('Error exchanging credentials:', error)
    return { success: false, error: 'Failed to authenticate' }
  }
}
