import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

// POST /api/health/labs/pre-draw-context - Save pre-draw context for a lab upload
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const body = await request.json()
    const { labUploadId, exercisedWithin24h, fastingHours, recentIllness, illnessType, drawTime, newSupplements, unusualStress, notes } = body

    if (!labUploadId) {
      return NextResponse.json({ error: 'labUploadId is required' }, { status: 400 })
    }

    // Verify the lab upload belongs to this user
    const upload = await prisma.labUpload.findFirst({
      where: { id: labUploadId, userId },
    })

    if (!upload) {
      return NextResponse.json({ error: 'Lab upload not found' }, { status: 404 })
    }

    // Upsert pre-draw context
    const context = await prisma.preDrawContext.upsert({
      where: { labUploadId },
      create: {
        labUploadId,
        exercisedWithin24h: exercisedWithin24h ?? false,
        fastingHours: fastingHours ?? null,
        recentIllness: recentIllness ?? false,
        illnessType: illnessType ?? null,
        drawTime: drawTime ?? null,
        newSupplements: newSupplements ?? null,
        unusualStress: unusualStress ?? false,
        notes: notes ?? null,
      },
      update: {
        exercisedWithin24h: exercisedWithin24h ?? false,
        fastingHours: fastingHours ?? null,
        recentIllness: recentIllness ?? false,
        illnessType: illnessType ?? null,
        drawTime: drawTime ?? null,
        newSupplements: newSupplements ?? null,
        unusualStress: unusualStress ?? false,
        notes: notes ?? null,
      },
    })

    return NextResponse.json({ context })
  } catch (error) {
    console.error('Pre-draw context POST error:', error)
    return NextResponse.json({ error: 'Failed to save pre-draw context' }, { status: 500 })
  }
}

// GET /api/health/labs/pre-draw-context?labUploadId=xxx - Get pre-draw context
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const labUploadId = searchParams.get('labUploadId')

    if (!labUploadId) {
      return NextResponse.json({ error: 'labUploadId query param is required' }, { status: 400 })
    }

    // Verify the lab upload belongs to this user
    const upload = await prisma.labUpload.findFirst({
      where: { id: labUploadId, userId },
    })

    if (!upload) {
      return NextResponse.json({ error: 'Lab upload not found' }, { status: 404 })
    }

    const context = await prisma.preDrawContext.findUnique({
      where: { labUploadId },
    })

    return NextResponse.json({ context })
  } catch (error) {
    console.error('Pre-draw context GET error:', error)
    return NextResponse.json({ error: 'Failed to get pre-draw context' }, { status: 500 })
  }
}
