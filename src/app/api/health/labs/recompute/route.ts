// Recompute lab intelligence for all existing uploads.
// Re-runs the compute pipeline (which upserts LabEventReview) so that
// updated PROTOCOL_MARKER_MAP entries and attribution logic take effect
// without requiring users to re-upload their labs.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { runComputePipeline } from '@/lib/labs/lab-compute-pipeline'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // Support admin recompute via query param (for CLI/deploy scripts)
  const adminSecret = request.nextUrl.searchParams.get('secret')
  const adminUserId = request.nextUrl.searchParams.get('userId')

  let userId: string

  if (adminSecret && adminUserId && adminSecret === process.env.NEXTAUTH_SECRET) {
    userId = adminUserId
  } else {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    userId = auth.userId
  }

  const uploads = await prisma.labUpload.findMany({
    where: { userId },
    orderBy: { testDate: 'asc' },
    select: { id: true, testDate: true },
  })

  if (uploads.length === 0) {
    return NextResponse.json({ message: 'No lab uploads found', recomputed: 0 })
  }

  const results: Array<{ uploadId: string; testDate: Date; success: boolean; verdict?: string }> = []

  // Recompute in chronological order (oldest first) so deltas are correct
  for (const upload of uploads) {
    try {
      const result = await runComputePipeline(userId, upload.id)
      results.push({
        uploadId: upload.id,
        testDate: upload.testDate,
        success: true,
        verdict: result.verdictHeadline,
      })
    } catch (err) {
      console.error(`Recompute failed for upload ${upload.id}:`, err)
      results.push({
        uploadId: upload.id,
        testDate: upload.testDate,
        success: false,
      })
    }
  }

  return NextResponse.json({
    message: `Recomputed ${results.filter(r => r.success).length}/${uploads.length} lab uploads`,
    recomputed: results.filter(r => r.success).length,
    total: uploads.length,
    results,
  })
}
