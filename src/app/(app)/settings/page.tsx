'use client'

import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { User, Plus, Trash2, Edit2, LogOut, ArrowRightLeft, Crown, Zap, Sun, Moon, Monitor } from 'lucide-react'
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
import type { UserProfile } from '@/types'

export default function SettingsPage() {
  const { currentUser, setCurrentUser, isPremium, setIsPremium, showPaywall, setShowPaywall } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewProfile, setShowNewProfile] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<UserProfile | null>(null)

  // Form state
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSwitchProfile(user: UserProfile) {
    try {
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      setCurrentUser(user)
      fetchUsers()
    } catch (error) {
      console.error('Error switching profile:', error)
    }
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
      })

      if (res.ok) {
        setShowNewProfile(false)
        setNewName('')
        setNewNotes('')
        fetchUsers()
      }
    } catch (error) {
      console.error('Error creating profile:', error)
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser || !newName.trim()) return

    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
      })

      if (res.ok) {
        const updated = await res.json()
        if (currentUser?.id === editingUser.id) {
          setCurrentUser(updated)
        }
        setEditingUser(null)
        setNewName('')
        setNewNotes('')
        fetchUsers()
      }
    } catch (error) {
      console.error('Error updating profile:', error)
    }
  }

  async function handleDeleteProfile() {
    if (!showDeleteModal) return

    try {
      await fetch(`/api/users/${showDeleteModal.id}`, {
        method: 'DELETE',
      })

      // If deleting current user, switch to another
      if (currentUser?.id === showDeleteModal.id) {
        const remaining = users.filter((u) => u.id !== showDeleteModal.id)
        if (remaining.length > 0) {
          handleSwitchProfile(remaining[0])
        } else {
          setCurrentUser(null)
        }
      }

      setShowDeleteModal(null)
      fetchUsers()
    } catch (error) {
      console.error('Error deleting profile:', error)
    }
  }

  function startEditing(user: UserProfile) {
    setEditingUser(user)
    setNewName(user.name)
    setNewNotes(user.notes || '')
  }

  return (
    <div className="p-4 pb-20">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Settings</h2>

      {/* Current Profile */}
      {currentUser && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Current Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900 dark:text-white">{currentUser.name}</div>
                {currentUser.notes && (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{currentUser.notes}</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEditing(currentUser)}
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
                <div className="font-medium text-slate-900 dark:text-white">Premium Active</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">All features unlocked</div>
              </div>
              <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">PRO</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Zap className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-slate-900 dark:text-white">Free Plan</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Upgrade for all features</div>
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
                  'flex-1 flex flex-col items-center gap-2 p-3 rounded-xl transition-colors',
                  theme === value
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* All Profiles */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">All Profiles</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setShowNewProfile(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-center text-slate-500">Loading...</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map((user) => {
                const isActive = user.id === currentUser?.id
                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 p-4 transition-colors ${
                      isActive
                        ? 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isActive ? 'bg-green-500' : 'bg-slate-100'
                      }`}
                    >
                      <User className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{user.name}</span>
                        {isActive && (
                          <Badge variant="success">Active</Badge>
                        )}
                      </div>
                      {user.notes && (
                        <div className="text-sm text-slate-500 truncate">{user.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!isActive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSwitchProfile(user)}
                          className="text-xs"
                        >
                          <ArrowRightLeft className="w-3 h-3 mr-1" />
                          Switch
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(user)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {users.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteModal(user)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <div className="mb-6">
        <NotificationSettings />
      </div>

      {/* App Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
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

      {/* New Profile Modal */}
      <Modal
        isOpen={showNewProfile}
        onClose={() => {
          setShowNewProfile(false)
          setNewName('')
          setNewNotes('')
        }}
        title="New Profile"
      >
        <form onSubmit={handleCreateProfile} className="space-y-4">
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
                setShowNewProfile(false)
                setNewName('')
                setNewNotes('')
              }}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => {
          setEditingUser(null)
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
                setEditingUser(null)
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        title="Delete Profile"
      >
        <p className="text-slate-600 dark:text-slate-300 mb-4">
          Are you sure you want to delete {showDeleteModal?.name}&apos;s profile? All their
          protocols, inventory, and history will be permanently deleted.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDeleteModal(null)}
          >
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteProfile}>
            Delete
          </Button>
        </div>
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
