'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { User, Edit2, LogOut, Crown, Zap, Sun, Moon, Monitor, Activity, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store'
import { useTheme } from '@/components/theme-provider'
import { Paywall } from '@/components/paywall'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { NotificationSettings } from '@/components/notification-settings'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { currentUser, setCurrentUser, isPremium, setIsPremium, showPaywall, setShowPaywall } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [editingUser, setEditingUser] = useState(false)

  // Form state
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUser || !newName.trim()) return

    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
      })

      if (res.ok) {
        const updated = await res.json()
        setCurrentUser(updated)
        setEditingUser(false)
        setNewName('')
        setNewNotes('')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
    }
  }

  function startEditing() {
    if (!currentUser) return
    setEditingUser(true)
    setNewName(currentUser.name)
    setNewNotes(currentUser.notes || '')
  }

  return (
    <div className="p-4 pb-20">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">Settings</h2>

      {/* Current Profile */}
      {currentUser && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[var(--foreground)] flex items-center justify-center">
                <User className="w-6 h-6 text-[var(--background)]" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-[var(--foreground)]">{currentUser.name}</div>
                {currentUser.notes && (
                  <div className="text-sm text-[var(--muted-foreground)]">{currentUser.notes}</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={startEditing}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription Status */}
      <Card className="mb-6">
        <CardContent className="p-4">
          {isPremium ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-[var(--foreground)]">Premium Active</div>
                <div className="text-sm text-[var(--muted-foreground)]">All features unlocked</div>
              </div>
              <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">PRO</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center">
                <Zap className="w-5 h-5 text-[var(--muted-foreground)]" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-[var(--foreground)]">Free Plan</div>
                <div className="text-sm text-[var(--muted-foreground)]">Upgrade for all features</div>
              </div>
              <Button size="sm" onClick={() => setShowPaywall(true)}>
                Upgrade
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {[
              { value: 'light' as const, icon: Sun, label: 'Light' },
              { value: 'dark' as const, icon: Moon, label: 'Dark' },
              { value: 'system' as const, icon: Monitor, label: 'System' },
            ].map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
                  theme === value
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)] border-[var(--accent)] shadow-lg'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-transparent hover:border-[var(--border)]'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <div className="mb-6">
        <NotificationSettings />
      </div>

      {/* Connected Health Services */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Connected Health Services</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/health"
            className="flex items-center justify-between p-3 -m-3 rounded-xl hover:bg-[var(--muted)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <div className="font-medium text-[var(--foreground)]">Health Integrations</div>
                <div className="text-sm text-[var(--muted-foreground)]">Manage connections on the Health tab</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />
          </Link>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)] space-y-1">
          <div>Peptide OS v1.0.0</div>
          <div>Local-first personal protocol management</div>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => signOut({ callbackUrl: '/login' })}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={editingUser}
        onClose={() => {
          setEditingUser(false)
          setNewName('')
          setNewNotes('')
        }}
        title="Edit Profile"
      >
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <Input
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter name"
            autoFocus
          />
          <Input
            label="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Any notes"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setEditingUser(false)
                setNewName('')
                setNewNotes('')
              }}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!newName.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Paywall */}
      <Paywall
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchaseSuccess={() => setIsPremium(true)}
      />
    </div>
  )
}
