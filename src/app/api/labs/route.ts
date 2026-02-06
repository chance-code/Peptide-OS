import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyUserAccess } from '@/lib/api-auth'
import { BIOMARKER_REGISTRY, normalizeBiomarkerName } from '@/lib/lab-biomarker-contract'
import { runComputePipeline } from '@/lib/labs/lab-compute-pipeline'

// Legacy response shape for iOS compatibility
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

// GET /api/labs - List all lab results (reads from enriched LabUpload + LabBiomarker)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

    const [uploads, total] = await Promise.all([
      prisma.labUpload.findMany({
        where: { userId },
        orderBy: { testDate: 'desc' },
        take: limit,
        skip: offset,
        include: { biomarkers: true },
      }),
      prisma.labUpload.count({ where: { userId } }),
    ])

    // Convert enriched format to legacy response shape
    const results = uploads.map((upload) => ({
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
    }))

    return NextResponse.json({ results, total })
  } catch (error) {
    console.error('Error fetching lab results:', error)
    return NextResponse.json({ error: 'Failed to fetch lab results' }, { status: 500 })
  }
}

// POST /api/labs - Create a new lab result (writes to enriched LabUpload + LabBiomarker)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, testDate, labName, markers, notes } = body

    if (!userId || !testDate || !markers || !Array.isArray(markers)) {
      return NextResponse.json(
        { error: 'userId, testDate, and markers array are required' },
        { status: 400 }
      )
    }

    const auth = await verifyUserAccess(userId)
    if (!auth.success) return auth.response

    // Normalize markers and create enriched records
    const biomarkerData = markers.map((m: { name: string; value: number; unit: string; rangeLow?: number; rangeHigh?: number }) => {
      const biomarkerKey = normalizeBiomarkerName(m.name) || m.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      const def = BIOMARKER_REGISTRY[biomarkerKey]
      const flag = computeFlag(m.value, m.rangeLow, m.rangeHigh)
      return {
        biomarkerKey,
        rawName: m.name,
        value: m.value,
        unit: m.unit || def?.unit || '',
        rangeLow: m.rangeLow ?? null,
        rangeHigh: m.rangeHigh ?? null,
        flag,
        confidence: 1.0,
        category: def?.category || null,
      }
    })

    // Deduplicate by biomarkerKey
    const seen = new Set<string>()
    const uniqueBiomarkers = biomarkerData.filter((bm: { biomarkerKey: string }) => {
      if (seen.has(bm.biomarkerKey)) return false
      seen.add(bm.biomarkerKey)
      return true
    })

    const upload = await prisma.labUpload.create({
      data: {
        userId,
        testDate: new Date(testDate),
        labName: labName || null,
        source: 'manual',
        notes: notes || null,
        confidence: 1.0,
        biomarkers: {
          create: uniqueBiomarkers,
        },
      },
      include: { biomarkers: true },
    })

    // Run compute pipeline in background (non-blocking)
    runComputePipeline(userId, upload.id).catch((err) => {
      console.error('[Labs] Compute pipeline error for manual entry:', err)
    })

    // Return legacy response shape
    const legacyMarkers: LegacyMarker[] = upload.biomarkers.map((bm) => {
      const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
      return {
        name: def?.displayName || bm.rawName || bm.biomarkerKey,
        value: bm.value,
        unit: bm.unit,
        rangeLow: bm.rangeLow,
        rangeHigh: bm.rangeHigh,
        flag: bm.flag,
      }
    })

    return NextResponse.json(
      {
        id: upload.id,
        userId: upload.userId,
        testDate: upload.testDate.toISOString(),
        labName: upload.labName,
        notes: upload.notes,
        markers: legacyMarkers,
        createdAt: upload.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating lab result:', error)
    return NextResponse.json({ error: 'Failed to create lab result' }, { status: 500 })
  }
}
