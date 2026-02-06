import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { BIOMARKER_REGISTRY, normalizeBiomarkerName } from '@/lib/lab-biomarker-contract'

interface LegacyMarker {
  name: string
  value: number
  unit: string
  rangeLow?: number | null
  rangeHigh?: number | null
  flag: string
}

function computeFlag(value: number, rangeLow?: number | null, rangeHigh?: number | null): 'normal' | 'high' | 'low' {
  if (rangeHigh != null && value > rangeHigh) return 'high'
  if (rangeLow != null && value < rangeLow) return 'low'
  return 'normal'
}

function uploadToLegacy(upload: {
  id: string
  userId: string
  testDate: Date
  labName: string | null
  notes: string | null
  createdAt: Date
  biomarkers: Array<{
    biomarkerKey: string
    rawName: string | null
    value: number
    unit: string
    rangeLow: number | null
    rangeHigh: number | null
    flag: string
  }>
}) {
  return {
    id: upload.id,
    userId: upload.userId,
    testDate: upload.testDate.toISOString(),
    labName: upload.labName,
    notes: upload.notes,
    markers: upload.biomarkers.map((bm): LegacyMarker => {
      const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
      return {
        name: def?.displayName || bm.rawName || bm.biomarkerKey,
        value: bm.value,
        unit: bm.unit,
        rangeLow: bm.rangeLow,
        rangeHigh: bm.rangeHigh,
        flag: bm.flag,
      }
    }),
    createdAt: upload.createdAt.toISOString(),
  }
}

// GET /api/labs/[id] - Get a single lab result (reads from enriched LabUpload)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const upload = await prisma.labUpload.findUnique({
      where: { id },
      include: { biomarkers: true },
    })

    if (!upload) {
      return NextResponse.json({ error: 'Lab result not found' }, { status: 404 })
    }

    if (upload.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(uploadToLegacy(upload))
  } catch (error) {
    console.error('Error fetching lab result:', error)
    return NextResponse.json({ error: 'Failed to fetch lab result' }, { status: 500 })
  }
}

// PUT /api/labs/[id] - Update a lab result (updates enriched LabUpload + LabBiomarker)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params
    const body = await request.json()
    const { testDate, labName, markers, notes } = body

    const existing = await prisma.labUpload.findUnique({
      where: { id },
      include: { biomarkers: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Lab result not found' }, { status: 404 })
    }

    if (existing.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build update data
    const data: Record<string, unknown> = {}
    if (testDate !== undefined) data.testDate = new Date(testDate)
    if (labName !== undefined) data.labName = labName || null
    if (notes !== undefined) data.notes = notes || null

    // If markers are updated, replace all biomarkers
    if (markers !== undefined && Array.isArray(markers)) {
      // Delete existing biomarkers
      await prisma.labBiomarker.deleteMany({ where: { uploadId: id } })

      // Create new ones
      const biomarkerData = markers.map((m: { name: string; value: number; unit: string; rangeLow?: number; rangeHigh?: number }) => {
        const biomarkerKey = normalizeBiomarkerName(m.name) || m.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        const def = BIOMARKER_REGISTRY[biomarkerKey]
        return {
          uploadId: id,
          biomarkerKey,
          rawName: m.name,
          value: m.value,
          unit: m.unit || def?.unit || '',
          rangeLow: m.rangeLow ?? null,
          rangeHigh: m.rangeHigh ?? null,
          flag: computeFlag(m.value, m.rangeLow, m.rangeHigh),
          confidence: 1.0,
          category: def?.category || null,
        }
      })

      // Deduplicate
      const seen = new Set<string>()
      const unique = biomarkerData.filter((bm: { biomarkerKey: string }) => {
        if (seen.has(bm.biomarkerKey)) return false
        seen.add(bm.biomarkerKey)
        return true
      })

      await prisma.labBiomarker.createMany({ data: unique })
    }

    const updated = await prisma.labUpload.update({
      where: { id },
      data,
      include: { biomarkers: true },
    })

    return NextResponse.json(uploadToLegacy(updated))
  } catch (error) {
    console.error('Error updating lab result:', error)
    return NextResponse.json({ error: 'Failed to update lab result' }, { status: 500 })
  }
}

// DELETE /api/labs/[id] - Delete a lab result (deletes enriched LabUpload, cascades to LabBiomarker + LabEventReview)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response

    const { id } = await params

    const upload = await prisma.labUpload.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!upload) {
      return NextResponse.json({ error: 'Lab result not found' }, { status: 404 })
    }

    if (upload.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete LabUpload — LabBiomarker cascades, LabEventReview cascades
    await prisma.labUpload.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting lab result:', error)
    return NextResponse.json({ error: 'Failed to delete lab result' }, { status: 500 })
  }
}
