import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { resolveDose } from '@/lib/schedule'
import type { DayOfWeek, FrequencyType } from '@/types'

// GET /api/protocols/[id]/phase?date=yyyy-MM-dd
// Returns current phase info: on/off (cycled), titration_step_N (titrated), or null (continuous).
// Phase 1 refocus — consumed by iOS Today + Calendar for phase-awareness banners.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const dateParam = request.nextUrl.searchParams.get('date')

    let targetDate: Date
    if (dateParam) {
      const [y, m, d] = dateParam.split('-').map(Number)
      targetDate = new Date(y, m - 1, d)
    } else {
      targetDate = new Date()
    }

    const protocol = await prisma.protocol.findUnique({
      where: { id },
      include: {
        cycle: true,
        titrationSteps: { orderBy: { weekOffset: 'asc' } },
      },
    })

    if (!protocol) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 })
    }
    if (protocol.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let customDays: DayOfWeek[] | undefined
    if (protocol.customDays) {
      try {
        customDays = JSON.parse(protocol.customDays) as DayOfWeek[]
      } catch {
        customDays = undefined
      }
    }

    const resolved = resolveDose(targetDate, {
      startDate: protocol.startDate,
      frequency: protocol.frequency as FrequencyType,
      customDays,
      cycleMode: protocol.cycleMode as 'continuous' | 'cycled' | 'titrated',
      cycle: protocol.cycle,
      titrationSteps: protocol.titrationSteps,
      doseAmount: protocol.doseAmount,
      doseUnit: protocol.doseUnit,
    })

    return NextResponse.json({
      protocolId: protocol.id,
      date: targetDate.toISOString().slice(0, 10),
      cycleMode: protocol.cycleMode,
      isDue: resolved.isDue,
      doseAmount: resolved.doseAmount,
      doseUnit: resolved.doseUnit,
      phase: resolved.phase,
      dayInPhase: resolved.dayInPhase ?? null,
      daysUntilNextPhaseBoundary: resolved.daysUntilNextPhaseBoundary ?? null,
      cycleFinished: resolved.cycleFinished ?? false,
    })
  } catch (error) {
    console.error('Error resolving protocol phase:', error)
    return NextResponse.json({ error: 'Failed to resolve protocol phase' }, { status: 500 })
  }
}
