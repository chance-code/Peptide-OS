'use client'

import { Suspense, useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/today'
  const { setCurrentUser } = useAppStore()

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  async function handleOAuthSignIn(provider: 'google' | 'apple') {
    setError('')
    setOauthLoading(provider)

    try {
      await signIn(provider, { callbackUrl })
    } catch {
      setError('Something went wrong')
      setOauthLoading(null)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        password,
        redirect: false,
        callbackUrl,
      })

      if (result?.error) {
        setError('Incorrect password')
        setIsLoading(false)
      } else if (result?.ok) {
        const session = await getSession()
        const userName = session?.user?.name

        if (userName) {
          const usersRes = await fetch('/api/users')
          const users = await usersRes.json()

          let matchingUser = users.find((u: { name: string }) => u.name === userName)

          if (!matchingUser) {
            const createRes = await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: userName }),
            })
            if (createRes.ok) {
              matchingUser = await createRes.json()
            }
          }

          if (matchingUser) {
            setCurrentUser(matchingUser)
          }
        }

        router.push(callbackUrl)
        router.refresh()
      }
    } catch {
      setError('Something went wrong')
      setIsLoading(false)
    }
  }

  // Check if OAuth providers are available
  const hasGoogle = true // Will show button, fails gracefully if not configured
  const hasApple = true

  return (
    <div className="space-y-4">
      {/* OAuth Buttons */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {hasGoogle && (
            <Button
              type="button"
              variant="secondary"
              className="w-full h-12 text-base"
              onClick={() => handleOAuthSignIn('google')}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === 'google' ? (
                'Signing in...'
              ) : (
                <>
                  <GoogleIcon className="w-5 h-5 mr-3" />
                  Continue with Google
                </>
              )}
            </Button>
          )}

          {hasApple && (
            <Button
              type="button"
              variant="secondary"
              className="w-full h-12 text-base bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              onClick={() => handleOAuthSignIn('apple')}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === 'apple' ? (
                'Signing in...'
              ) : (
                <>
                  <AppleIcon className="w-5 h-5 mr-3" />
                  Continue with Apple
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            or
          </span>
        </div>
      </div>

      {/* Password Option (Collapsible) */}
      <Card>
        <CardContent className="pt-4">
          <button
            type="button"
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="w-full flex items-center justify-between py-2 text-slate-600 dark:text-slate-300"
          >
            <span className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Sign in with password
            </span>
            {showPasswordForm ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showPasswordForm && (
            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />

              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading || !password}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 dark:bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white dark:text-slate-900" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Peptide OS</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Sign in to continue</p>
        </div>

        <Suspense
          fallback={
            <div className="text-center text-slate-500 dark:text-slate-400">Loading...</div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
