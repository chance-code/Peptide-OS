import { NextRequest, NextResponse } from 'next/server'
import { verifyUserAccess } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { computePremiumEvidence } from '@/lib/health-evidence-engine'

// GET /api/health/evidence-history?userId=X&protocolId=X
// Returns evidence verdict snapshots for a protocol
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const protocolId = searchParams.get('protocolId')

    const authResult = await verifyUserAccess(userId)
    if (!authResult.success) {
      return authResult.response
    }

    if (!protocolId) {
      return NextResponse.json(
        { error: 'protocolId is required' },
        { status: 400 }
      )
    }

    // Verify the protocol exists and belongs to this user
    const protocol = await prisma.protocol.findFirst({
      where: {
        id: protocolId,
        userId: authResult.userId,
      },
      include: {
        peptide: { select: { name: true } },
      },
    })

    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocol not found' },
        { status: 404 }
      )
    }

    // Load stored evidence snapshot (the Note record with entityType 'evidence_snapshot')
    // This stores { [protocolId]: verdict } as JSON content
    const snapshotNote = await prisma.note.findFirst({
      where: {
        entityType: 'evidence_snapshot',
        entityId: authResult.userId,
      },
    })

    let storedVerdict: string | null = null
    let snapshotDate: string | null = null

    if (snapshotNote) {
      try {
        const verdicts = JSON.parse(snapshotNote.content) as Record<string, string>
        storedVerdict = verdicts[protocolId] || null
        snapshotDate = snapshotNote.updatedAt.toISOString()
      } catch {
        // Invalid JSON, skip
      }
    }

    // Compute the current live evidence for this specific protocol
    const evidence = await computePremiumEvidence(authResult.userId, protocolId)
    const protocolEvidence = evidence.find(e => e.protocolId === protocolId)

    // Build the snapshots array
    // We include the stored snapshot (if it differs from current) plus the current state
    const snapshots: Array<{
      date: string
      verdict: string
      score: number
      topSignals: Array<{ metric: string; change: number; direction: string }>
    }> = []

    // Add the stored snapshot if available and different from current
    if (storedVerdict && snapshotDate && protocolEvidence && storedVerdict !== protocolEvidence.verdict) {
      snapshots.push({
        date: snapshotDate,
        verdict: storedVerdict,
        score: 0, // Historical snapshots don't store the score
        topSignals: [],
      })
    }

    // Add the current live evidence as the latest snapshot
    if (protocolEvidence) {
      const topSignals: Array<{ metric: string; change: number; direction: string }> = []

      // Collect primary effect
      if (protocolEvidence.effects.primary) {
        const p = protocolEvidence.effects.primary
        topSignals.push({
          metric: p.metricName,
          change: p.change.percent,
          direction: p.change.direction,
        })
      }

      // Collect top supporting effects (up to 3 total)
      for (const s of protocolEvidence.effects.supporting.slice(0, 2)) {
        topSignals.push({
          metric: s.metricName,
          change: s.change.percent,
          direction: s.change.direction,
        })
      }

      snapshots.push({
        date: new Date().toISOString(),
        verdict: protocolEvidence.verdict,
        score: protocolEvidence.verdictScore,
        topSignals,
      })
    }

    return NextResponse.json({
      snapshots,
      protocolName: `${protocol.peptide.name} Protocol`,
      protocolId,
      daysOnProtocol: protocolEvidence?.daysOnProtocol ?? null,
      currentVerdict: protocolEvidence?.verdict ?? null,
      currentVerdictExplanation: protocolEvidence?.verdictExplanation ?? null,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('Error fetching evidence history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch evidence history' },
      { status: 500 }
    )
  }
}
