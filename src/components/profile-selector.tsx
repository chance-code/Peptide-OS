'use client'

import { useEffect, useState } from 'react'
import { User, Plus, Check } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import type { UserProfile } from '@/types'

interface ProfileSelectorProps {
  onSelect: () => void
}

export function ProfileSelector({ onSelect }: ProfileSelectorProps) {
  const { setCurrentUser } = useAppStore()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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

  async function handleSelectUser(user: UserProfile) {
    try {
      // Set as active
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })

      setCurrentUser(user)
      onSelect()
    } catch (error) {
      console.error('Error selecting user:', error)
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
      })

      if (res.ok) {
        const user = await res.json()
        setCurrentUser(user)
        onSelect()
      }
    } catch (error) {
      console.error('Error creating user:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)]">Loading profiles...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">Peptide OS</h1>
          <p className="text-[var(--muted-foreground)]">
            {users.length > 0 ? 'Select your profile' : 'Create your first profile'}
          </p>
        </div>

        {users.length > 0 && !isCreating && (
          <div className="space-y-3 mb-6">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                className="w-full flex items-center gap-3 p-4 bg-[var(--background)] rounded-xl border border-[var(--border)] hover:border-[var(--muted-foreground)] hover:shadow-sm transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center">
                  <User className="w-5 h-5 text-[var(--muted-foreground)]" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[var(--foreground)]">{user.name}</div>
                  {user.notes && (
                    <div className="text-sm text-[var(--muted-foreground)] truncate">{user.notes}</div>
                  )}
                </div>
                {user.isActive && (
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                )}
              </button>
            ))}
          </div>
        )}

        {(users.length === 0 || isCreating) && (
          <Card>
            <CardHeader>
              <CardTitle>Create Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <Input
                  label="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                />
                <Input
                  label="Notes (optional)"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any notes about this profile"
                />
                <div className="flex gap-2">
                  {users.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsCreating(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" className="flex-1" disabled={!newName.trim()}>
                    Create
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {users.length > 0 && !isCreating && (
          <Button
            variant="ghost"
            onClick={() => setIsCreating(true)}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Profile
          </Button>
        )}
      </div>
    </div>
  )
}
