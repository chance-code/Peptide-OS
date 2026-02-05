'use client'

import { useState } from 'react'
import { Heart, Circle, RefreshCw, Link2, Link2Off, AlertCircle, Check, Eye, EyeOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HealthProviderType } from '@/lib/health-providers'

interface HealthIntegration {
  id: string
  provider: string
  isConnected: boolean
  lastSyncAt: string | null
  syncError: string | null
  enabledMetrics: string | null
}

interface HealthIntegrationCardProps {
  provider: HealthProviderType
  displayName: string
  description: string
  supportedMetrics: string[]
  isNativeOnly: boolean
  requiresCredentials?: boolean
  integration: HealthIntegration | null
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  isConnecting?: boolean
  isSyncing?: boolean
  className?: string
}

const providerIcons: Record<HealthProviderType, React.ReactNode> = {
  apple_health: <Heart className="w-5 h-5" />,
  oura: <Circle className="w-5 h-5" />
}

const providerColors: Record<HealthProviderType, string> = {
  apple_health: 'from-red-500/20 to-pink-500/10 border-red-500/30',
  oura: 'from-teal-500/20 to-cyan-500/10 border-teal-500/30'
}

const providerAccentColors: Record<HealthProviderType, string> = {
  apple_health: 'text-red-400',
  oura: 'text-teal-400'
}

export function HealthIntegrationCard({
  provider,
  displayName,
  description,
  supportedMetrics,
  isNativeOnly,
  requiresCredentials = false,
  integration,
  onConnect,
  onDisconnect,
  onSync,
  isConnecting = false,
  isSyncing = false,
  className
}: HealthIntegrationCardProps) {
  const isConnected = integration?.isConnected ?? false
  const hasError = !!integration?.syncError
  const isAuthExpired = hasError && /expired|reconnect/i.test(integration?.syncError || '')

  // Credentials login state
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  function formatLastSync(dateStr: string | null): string {
    if (!dateStr) return 'Never synced'

    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    setIsLoggingIn(true)

    try {
      const res = await fetch(`/api/health/integrations/${provider.replace('_', '-')}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Login failed')
      }

      // Success - trigger refresh
      setShowLoginForm(false)
      setEmail('')
      setPassword('')
      onConnect() // This will trigger a refetch
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed')
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handleConnectClick() {
    if (requiresCredentials) {
      setShowLoginForm(true)
      setLoginError(null)
    } else {
      onConnect()
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl p-4 border bg-gradient-to-br transition-all',
        providerColors[provider],
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-xl bg-[var(--muted)]', providerAccentColors[provider])}>
            {providerIcons[provider]}
          </div>
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">{displayName}</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {isConnected ? formatLastSync(integration?.lastSyncAt ?? null) : 'Not connected'}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
          isConnected
            ? hasError
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-green-500/20 text-green-400'
            : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
        )}>
          {isConnected ? (
            hasError ? (
              <>
                <AlertCircle className="w-3 h-3" />
                Error
              </>
            ) : (
              <>
                <Check className="w-3 h-3" />
                Connected
              </>
            )
          ) : (
            <>
              <Link2Off className="w-3 h-3" />
              Disconnected
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--muted-foreground)] mb-3">
        {description}
      </p>

      {/* Error message */}
      {hasError && (
        <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-400">{integration?.syncError}</p>
        </div>
      )}

      {/* Login Form for credentials-based providers */}
      {showLoginForm && (!isConnected || isAuthExpired) && (
        <form onSubmit={handleCredentialsLogin} className="mb-4 p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-[var(--foreground)]">{isAuthExpired ? 'Re-authenticate' : 'Sign in to'} {displayName}</span>
            <button
              type="button"
              onClick={() => setShowLoginForm(false)}
              className="p-1 rounded-md hover:bg-[var(--muted)]"
            >
              <X className="w-4 h-4 text-[var(--muted-foreground)]" />
            </button>
          </div>

          {loginError && (
            <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{loginError}</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 pr-10 text-sm rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isLoggingIn || !email || !password}
              className="w-full"
            >
              {isLoggingIn ? 'Signing in...' : 'Sign In'}
            </Button>
          </div>

          <p className="mt-2 text-[10px] text-[var(--muted-foreground)] text-center">
            Your credentials are used only to connect and are not stored permanently.
          </p>
        </form>
      )}

      {/* Supported metrics */}
      {!showLoginForm && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {supportedMetrics.map(metric => (
            <span
              key={metric}
              className="px-2 py-0.5 rounded-md bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide"
            >
              {metric.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {!showLoginForm && (
        <div className="flex gap-2">
          {isConnected ? (
            isAuthExpired && requiresCredentials ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setShowLoginForm(true); setLoginError(null) }}
                className="w-full"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Re-authenticate
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onSync}
                  disabled={isSyncing}
                  className="flex-1"
                >
                  <RefreshCw className={cn('w-4 h-4 mr-2', isSyncing && 'animate-spin')} />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDisconnect}
                  className="text-[var(--error)]"
                >
                  <Link2Off className="w-4 h-4" />
                </Button>
              </>
            )
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConnectClick}
              disabled={isConnecting}
              className="w-full"
            >
              <Link2 className={cn('w-4 h-4 mr-2', isConnecting && 'animate-pulse')} />
              {isConnecting ? 'Connecting...' : isNativeOnly ? 'Enable Access' : 'Connect'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
