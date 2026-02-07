import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

interface TimelineEvent {
  id: string
  type: 'lab_upload' | 'protocol_start' | 'protocol_end' | 'changepoint' | 'milestone'
  date: string
  title: string
  subtitle: string | null
  metadata: Record<string, unknown>
}

// GET /api/health/timeline - Unified health event timeline
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '180', 10) || 180, 7), 365)
    const typesParam = searchParams.get('types')
    const typeFilter = typesParam ? typesParam.split(',') : null

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const events: TimelineEvent[] = []

    // Lab uploads
    if (!typeFilter || typeFilter.includes('lab_upload')) {
      const labUploads = await prisma.labUpload.findMany({
        where: { userId, testDate: { gte: since } },
        include: { biomarkers: { select: { biomarkerKey: true, flag: true } } },
        orderBy: { testDate: 'desc' },
      })

      for (const upload of labUploads) {
        const abnormalCount = upload.biomarkers.filter(b => b.flag !== 'normal' && b.flag !== 'optimal').length
        events.push({
          id: `lab_${upload.id}`,
          type: 'lab_upload',
          date: upload.testDate.toISOString(),
          title: `Lab results${upload.labName ? ` from ${upload.labName}` : ''}`,
          subtitle: `${upload.biomarkers.length} biomarkers${abnormalCount > 0 ? `, ${abnormalCount} flagged` : ''}`,
          metadata: {
            uploadId: upload.id,
            biomarkerCount: upload.biomarkers.length,
            abnormalCount,
            source: upload.source,
          },
        })
      }
    }

    // Protocol starts and ends
    if (!typeFilter || typeFilter.includes('protocol_start') || typeFilter.includes('protocol_end')) {
      const protocols = await prisma.protocol.findMany({
        where: {
          userId,
          OR: [
            { startDate: { gte: since } },
            { endDate: { gte: since } },
          ],
        },
        include: { peptide: true },
      })

      for (const proto of protocols) {
        if (!typeFilter || typeFilter.includes('protocol_start')) {
          if (new Date(proto.startDate) >= since) {
            events.push({
              id: `pstart_${proto.id}`,
              type: 'protocol_start',
              date: new Date(proto.startDate).toISOString(),
              title: `Started ${proto.peptide?.name ?? 'Protocol'}`,
              subtitle: `${proto.doseAmount} ${proto.doseUnit}, ${proto.frequency}`,
              metadata: { protocolId: proto.id, peptideName: proto.peptide?.name },
            })
          }
        }

        if (!typeFilter || typeFilter.includes('protocol_end')) {
          if (proto.endDate && new Date(proto.endDate) >= since) {
            events.push({
              id: `pend_${proto.id}`,
              type: 'protocol_end',
              date: new Date(proto.endDate).toISOString(),
              title: `Ended ${proto.peptide?.name ?? 'Protocol'}`,
              subtitle: `Status: ${proto.status}`,
              metadata: { protocolId: proto.id, peptideName: proto.peptide?.name },
            })
          }
        }
      }
    }

    // Bayesian changepoints
    if (!typeFilter || typeFilter.includes('changepoint')) {
      const changepoints = await prisma.bayesianChangepoint.findMany({
        where: { userId, detectedDate: { gte: since } },
        orderBy: { detectedDate: 'desc' },
      })

      for (const cp of changepoints) {
        events.push({
          id: `cp_${cp.id}`,
          type: 'changepoint',
          date: cp.detectedDate.toISOString(),
          title: `Effect detected: ${cp.metricType.replace(/_/g, ' ')}`,
          subtitle: `Confidence: ${cp.confidenceLevel}, effect size: ${cp.effectSize?.toFixed(2) ?? 'N/A'}`,
          metadata: {
            metricType: cp.metricType,
            protocolId: cp.protocolId,
            posteriorProb: cp.posteriorProb,
            effectSize: cp.effectSize,
            preMean: cp.preMean,
            postMean: cp.postMean,
          },
        })
      }
    }

    // Sort all events by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      events,
      totalCount: events.length,
      timeRange: { from: since.toISOString(), to: new Date().toISOString() },
    }, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    console.error('Timeline API error:', error)
    return NextResponse.json(
      { error: 'Failed to build timeline' },
      { status: 500 }
    )
  }
}
