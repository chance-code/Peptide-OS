'use client'

import { Suspense, useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArcLogo } from '@/components/arc-logo'
import {
  isCapacitor as checkIsCapacitor,
  nativeGoogleSignIn,
  nativeAppleSignIn,
} from '@/lib/capacitor-auth'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/today'

  const [password, setPassword] = useState('')
  const [error, setError] = useState(() => {
    const urlError = searchParams.get('error')
    if (urlError === 'no_session') return 'Your session expired. Please sign in again.'
    if (urlError) return urlError
    return ''
  })
  const [loading, setLoading] = useState(false)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    // Check if running in Capacitor
    setIsNative(checkIsCapacitor())
  }, [])

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        password,
        redirect: false,
        callbackUrl,
      })

      if (result?.error) {
        setError('Invalid password')
        setLoading(false)
      } else if (result?.ok) {
        window.location.href = callbackUrl
      }
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    setLoadingProvider('google')

    if (isNative) {
      // Opens SFSafariViewController for OAuth (avoids Google's WKWebView block)
      // Handles the full flow: auth → transfer token → session cookies → redirect
      const result = await nativeGoogleSignIn()

      if (result.useWebAuth) {
        // Web fallback (only on non-Capacitor platforms)
        await signIn('google', { callbackUrl })
        return
      }

      if (!result.success) {
        setError(result.error || 'Sign in failed')
        setLoadingProvider(null)
      }
      // If successful, nativeGoogleSignIn already redirected to /today
    } else {
      // Standard NextAuth flow for web
      await signIn('google', { callbackUrl })
    }
  }

  async function handleAppleSignIn() {
    setError('')
    setLoadingProvider('apple')

    if (isNative) {
      // Opens SFSafariViewController for OAuth (same flow as Google)
      const result = await nativeAppleSignIn()

      if (result.useWebAuth) {
        await signIn('apple', { callbackUrl })
        return
      }

      if (!result.success) {
        setError(result.error || 'Sign in failed')
        setLoadingProvider(null)
      }
    } else {
      // Standard NextAuth flow for web
      await signIn('apple', { callbackUrl })
    }
  }

  const isLoading = loading || !!loadingProvider

  return (
    <Card className="border-[var(--border)] bg-[var(--card)]">
      <CardContent className="pt-6 space-y-4">
        {/* Password login - works everywhere */}
        <form onSubmit={handlePasswordSignIn} className="space-y-3">
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 text-base"
            autoFocus
          />
          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={isLoading || !password}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        {/* OAuth login options */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--border)]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">or</span>
          </div>
        </div>

        {/* Google Sign-In - Native on Capacitor, Web otherwise */}
        <Button
          type="button"
          variant="secondary"
          className="w-full h-12 text-base"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          {loadingProvider === 'google' ? (
            <>
              <Loader2 className="w-5 h-5 mr-3 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <GoogleIcon className="w-5 h-5 mr-3" />
              Continue with Google
            </>
          )}
        </Button>

        {/* Apple Sign-In - Native on Capacitor, Web otherwise */}
        <Button
          type="button"
          variant="secondary"
          className="w-full h-12 text-base"
          onClick={handleAppleSignIn}
          disabled={isLoading}
        >
          {loadingProvider === 'apple' ? (
            <>
              <Loader2 className="w-5 h-5 mr-3 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <AppleIcon className="w-5 h-5 mr-3" />
              Continue with Apple
            </>
          )}
        </Button>

        {error && (
          <div className="text-[var(--error)] text-sm text-center">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4"
      style={{
        // Safe area padding for iOS Dynamic Island and notch
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4">
            <ArcLogo size={72} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Arc Protocol</h1>
          <p className="text-[var(--muted-foreground)] mt-1">Sign in to continue</p>
        </div>

        <Suspense
          fallback={
            <div className="text-center text-[var(--muted-foreground)]">Loading...</div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
