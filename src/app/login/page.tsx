'use client'

import { Suspense, useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/today'
  const { setCurrentUser } = useAppStore()

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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
        // Get the session to find out which user logged in
        const session = await getSession()
        const userName = session?.user?.name

        if (userName) {
          // Fetch users and find/create the matching profile
          const usersRes = await fetch('/api/users')
          const users = await usersRes.json()

          let matchingUser = users.find((u: { name: string }) => u.name === userName)

          // If user doesn't exist in database, create them
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
            // Set the user in the store - this persists to localStorage
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

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
          />

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm text-center">{error}</div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </CardContent>
    </Card>
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
          <p className="text-slate-500 dark:text-slate-400 mt-1">Enter your password</p>
        </div>

        <Suspense fallback={<div className="text-center text-slate-500 dark:text-slate-400">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
