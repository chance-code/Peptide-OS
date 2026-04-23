import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { materializeScheduleForAllActive } from '@/lib/schedule-materializer'

/**
 * Nightly cron: extend the rolling 90-day DoseSchedule window for every active protocol.
 * Without this, the window shrinks by 1 day/day and eventually starves /api/today.
 *
 * Registered in src/lib/cron.ts. Idempotent — safe to run multiple times per day.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await prisma.$transaction(
      (tx) => materializeScheduleForAllActive(tx),
      { timeout: 60_000 }, // Up to 60s for large protocol counts
    )
    console.log(
      `[cron/schedule-materialize] touched=${result.protocolsTouched} created=${result.rowsCreated} deleted=${result.rowsDeleted}`,
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/schedule-materialize] error:', error)
    return NextResponse.json({ error: 'Materialization failed' }, { status: 500 })
  }
}
