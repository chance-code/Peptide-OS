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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import type { Protocol, Peptide, DoseLog, ProtocolHistory } from '@/types'

interface ProtocolDetail extends Protocol {
  peptide: Peptide
  doseLogs: DoseLog[]
  history: ProtocolHistory[]
}

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

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {protocol.status !== 'completed' && (
          <div className="flex gap-2">
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
          {protocol.doseAmount} {protocol.doseUnit} • {protocol.frequency}
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
