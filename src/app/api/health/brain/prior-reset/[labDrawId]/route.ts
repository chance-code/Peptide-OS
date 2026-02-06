import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/health/brain/prior-reset/[labDrawId] — What changed when labs arrived
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ labDrawId: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { labDrawId } = await params

    const resetEvent = await prisma.labPriorResetEvent.findFirst({
      where: { userId, labUploadId: labDrawId },
      orderBy: { createdAt: 'desc' },
    })

    if (!resetEvent) {
      return NextResponse.json(
        { error: 'No prior-reset event found for this lab draw' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: resetEvent.id,
      labUploadId: resetEvent.labUploadId,
      baselinesUpdated: resetEvent.baselinesUpdated,
      hypothesesResolved: resetEvent.hypothesesResolved,
      domainsReweighted: resetEvent.domainsReweighted,
      protocolsReassessed: resetEvent.protocolsReassessed,
      wearableSignalsQuieted: resetEvent.wearableSignalsQuieted,
      summaryNarrative: resetEvent.summaryNarrative,
      createdAt: resetEvent.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Brain prior-reset API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prior-reset event' },
      { status: 500 }
    )
  }
}
