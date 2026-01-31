'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { format, differenceInDays } from 'date-fns'
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  Infinity,
  Clock,
  Calendar,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { Protocol, Peptide, DoseLog, ProtocolHistory, DayOfWeek } from '@/types'

interface ProtocolDetail extends Protocol {
  peptide: Peptide
  doseLogs: DoseLog[]
  history: ProtocolHistory[]
}

const DOSE_UNITS = [
  { value: 'mcg', label: 'mcg' },
  { value: 'mg', label: 'mg' },
  { value: 'IU', label: 'IU' },
]

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom Days' },
]

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

export default function ProtocolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [protocol, setProtocol] = useState<ProtocolDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Edit form state
  const [editDoseAmount, setEditDoseAmount] = useState('')
  const [editDoseUnit, setEditDoseUnit] = useState('mcg')
  const [editFrequency, setEditFrequency] = useState('daily')
  const [editCustomDays, setEditCustomDays] = useState<DayOfWeek[]>([])
  const [editTiming, setEditTiming] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editIndefinite, setEditIndefinite] = useState(false)
  const [editNotes, setEditNotes] = useState('')

  const fetchProtocol = useCallback(async () => {
    try {
      const res = await fetch(`/api/protocols/${id}`)
      if (res.ok) {
        const data = await res.json()
        setProtocol(data)
      }
    } catch (error) {
      console.error('Error fetching protocol:', error)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchProtocol()
  }, [fetchProtocol])

  function startEditing() {
    if (!protocol) return

    // Pre-fill form with current values
    setEditDoseAmount(protocol.doseAmount.toString())
    setEditDoseUnit(protocol.doseUnit)
    setEditFrequency(protocol.frequency)
    setEditTiming(protocol.timing || '')
    setEditStartDate(format(new Date(protocol.startDate), 'yyyy-MM-dd'))
    setEditEndDate(protocol.endDate ? format(new Date(protocol.endDate), 'yyyy-MM-dd') : '')
    setEditIndefinite(!protocol.endDate)
    setEditNotes(protocol.notes || '')

    // Parse custom days
    if (protocol.customDays) {
      try {
        setEditCustomDays(JSON.parse(protocol.customDays))
      } catch {
        setEditCustomDays([])
      }
    } else {
      setEditCustomDays([])
    }

    setIsEditing(true)
  }

  async function handleSaveEdit() {
    if (!protocol) return

    setIsSaving(true)

    try {
      const res = await fetch(`/api/protocols/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doseAmount: parseFloat(editDoseAmount),
          doseUnit: editDoseUnit,
          frequency: editFrequency,
          customDays: editFrequency === 'custom' ? editCustomDays : null,
          timing: editTiming || null,
          startDate: editStartDate,
          endDate: editIndefinite ? null : editEndDate || null,
          notes: editNotes || null,
        }),
      })

      if (res.ok) {
        await fetchProtocol()
        setIsEditing(false)
      }
    } catch (error) {
      console.error('Error saving protocol:', error)
    } finally {
      setIsSaving(false)
    }
  }

  function toggleCustomDay(day: DayOfWeek) {
    setEditCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  async function handleToggleStatus() {
    if (!protocol) return

    const newStatus = protocol.status === 'active' ? 'paused' : 'active'

    try {
      await fetch(`/api/protocols/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      fetchProtocol()
    } catch (error) {
      console.error('Error updating protocol:', error)
    }
  }

  async function handleComplete() {
    try {
      await fetch(`/api/protocols/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      fetchProtocol()
    } catch (error) {
      console.error('Error completing protocol:', error)
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/protocols/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete protocol')
        setShowDeleteModal(false)
        return
      }

      router.push('/protocols')
    } catch (error) {
      console.error('Error deleting protocol:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="text-center py-8 text-slate-500">Loading...</div>
      </div>
    )
  }

  if (!protocol) {
    return (
      <div className="p-4">
        <div className="text-center py-8 text-slate-500">Protocol not found</div>
      </div>
    )
  }

  const startDate = new Date(protocol.startDate)
  const endDate = protocol.endDate ? new Date(protocol.endDate) : null
  const today = new Date()

  const daysCompleted = Math.max(0, differenceInDays(today, startDate) + 1)
  const daysRemaining = endDate ? Math.max(0, differenceInDays(endDate, today)) : null
  const totalDays = endDate ? differenceInDays(endDate, startDate) + 1 : null
  const totalWeeks = totalDays ? Math.round(totalDays / 7) : null
  const progress = totalDays ? Math.min(100, (daysCompleted / totalDays) * 100) : null

  // Calculate adherence - assume 100% for completed protocols
  const completedDoses = protocol.doseLogs.filter((d) => d.status === 'completed').length
  const totalDoses = protocol.doseLogs.length
  const adherenceRate = protocol.status === 'completed'
    ? 100
    : totalDoses > 0
      ? Math.round((completedDoses / totalDoses) * 100)
      : 100

  // Calculate expected doses for completed protocols
  const calculateExpectedDoses = () => {
    if (!totalDays) return completedDoses
    if (protocol.frequency === 'daily') return totalDays
    if (protocol.frequency === 'weekly') return Math.ceil(totalDays / 7)
    if (protocol.frequency === 'custom' && protocol.customDays) {
      try {
        const days = JSON.parse(protocol.customDays) as string[]
        return Math.ceil(totalDays / 7) * days.length
      } catch {
        return completedDoses
      }
    }
    return completedDoses
  }
  const expectedDoses = protocol.status === 'completed' ? calculateExpectedDoses() : completedDoses

  // Format days for display
  const formatDays = () => {
    if (protocol.frequency === 'daily') return 'Every day'
    if (protocol.frequency === 'weekly') return 'Weekly'
    if (protocol.frequency === 'custom' && protocol.customDays) {
      try {
        const days = JSON.parse(protocol.customDays) as string[]
        const dayLabels: Record<string, string> = {
          mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
        }
        return days.map(d => dayLabels[d] || d).join(', ')
      } catch {
        return protocol.frequency
      }
    }
    return protocol.frequency
  }

  // Edit mode UI
  if (isEditing) {
    return (
      <div className="p-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Edit Protocol</h2>
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Peptide (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Peptide</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-medium text-slate-900">{protocol.peptide.name}</div>
              <p className="text-xs text-slate-500 mt-1">Peptide cannot be changed. Create a new protocol instead.</p>
            </CardContent>
          </Card>

          {/* Dosing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dosing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    label="Amount"
                    type="number"
                    step="any"
                    value={editDoseAmount}
                    onChange={(e) => setEditDoseAmount(e.target.value)}
                  />
                </div>
                <div className="w-24">
                  <Select
                    label="Unit"
                    value={editDoseUnit}
                    onChange={(e) => setEditDoseUnit(e.target.value)}
                    options={DOSE_UNITS}
                  />
                </div>
              </div>
              <Input
                label="Timing (optional)"
                value={editTiming}
                onChange={(e) => setEditTiming(e.target.value)}
                placeholder="e.g., morning, before bed"
              />
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                label="Start Date"
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="indefinite"
                  checked={editIndefinite}
                  onChange={(e) => setEditIndefinite(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="indefinite" className="text-sm text-slate-700">
                  Run indefinitely (no end date)
                </label>
              </div>

              {!editIndefinite && (
                <Input
                  label="End Date"
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                />
              )}

              <Select
                label="Frequency"
                value={editFrequency}
                onChange={(e) => setEditFrequency(e.target.value)}
                options={FREQUENCIES}
              />

              {editFrequency === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select Days
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleCustomDay(day.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          editCustomDays.includes(day.value)
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 min-h-[80px]"
                placeholder="Any additional notes..."
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsEditing(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="flex-1"
              disabled={isSaving || !editDoseAmount}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Normal view mode
  return (
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {protocol.status !== 'completed' && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={startEditing}>
              <Edit2 className="w-4 h-4 text-slate-600" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteModal(true)}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {protocol.peptide.name}
          </h1>
          <Badge
            variant={
              protocol.status === 'active'
                ? 'success'
                : protocol.status === 'paused'
                ? 'warning'
                : 'default'
            }
          >
            {protocol.status}
          </Badge>
        </div>
        <p className="text-slate-500">
          {protocol.doseAmount} {protocol.doseUnit} • {formatDays()}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{daysCompleted}</div>
            <div className="text-xs text-slate-500">Days Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            {daysRemaining !== null && totalWeeks !== null ? (
              <>
                <div className="text-2xl font-bold text-slate-900">{daysRemaining}</div>
                <div className="text-xs text-slate-500">Days Left ({totalWeeks}wk cycle)</div>
              </>
            ) : (
              <>
                <Infinity className="w-6 h-6 mx-auto text-slate-900" />
                <div className="text-xs text-slate-500 mt-1">Ongoing</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{adherenceRate}%</div>
            <div className="text-xs text-slate-500">Adherence</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{expectedDoses}</div>
            <div className="text-xs text-slate-500">
              {protocol.status === 'completed' ? 'Total Doses' : 'Doses Logged'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      {progress !== null && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex justify-between text-sm text-slate-500 mb-2">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-sm text-slate-500">Start Date</div>
              <div className="font-medium">{format(startDate, 'MMMM d, yyyy')}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-sm text-slate-500">End Date</div>
              <div className="font-medium">
                {endDate && totalWeeks
                  ? `${format(endDate, 'MMMM d, yyyy')} (${totalWeeks} week cycle)`
                  : 'Ongoing'}
              </div>
            </div>
          </div>
          {protocol.timing && (
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-sm text-slate-500">Timing</div>
                <div className="font-medium">{protocol.timing}</div>
              </div>
            </div>
          )}
          {protocol.notes && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-sm text-slate-500 mb-1">Notes</div>
              <div className="text-sm">{protocol.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {protocol.status !== 'completed' && (
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleToggleStatus}
          >
            {protocol.status === 'active' ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Resume
              </>
            )}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={handleComplete}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Complete
          </Button>
        </div>
      )}

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Protocol"
      >
        <p className="text-slate-600 mb-4">
          Are you sure you want to delete this protocol? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
