import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { BIOMARKER_REGISTRY, computeOptimalScore } from '@/lib/lab-biomarker-contract'

// GET /api/health/labs/results — Fetch structured lab results
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (uploadId) {
      // Single upload with full details
      const upload = await prisma.labUpload.findFirst({
        where: { id: uploadId, userId },
        include: { biomarkers: true },
      })

      if (!upload) {
        return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
      }

      return NextResponse.json({
        upload: formatUpload(upload),
      })
    }

    // All uploads for user (latest first)
    const uploads = await prisma.labUpload.findMany({
      where: { userId },
      orderBy: { testDate: 'desc' },
      take: limit,
      include: { biomarkers: true },
    })

    return NextResponse.json({
      uploads: uploads.map(formatUpload),
      total: uploads.length,
    })
  } catch (error) {
    console.error('Error fetching lab results:', error)
    return NextResponse.json({ error: 'Failed to fetch lab results' }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUpload(upload: {
  id: string
  testDate: Date
  labName: string | null
  source: string
  confidence: number | null
  fileName: string | null
  biomarkers: Array<{
    id: string
    biomarkerKey: string
    rawName: string | null
    value: number
    unit: string
    originalValue: number | null
    originalUnit: string | null
    rangeLow: number | null
    rangeHigh: number | null
    flag: string
    confidence: number | null
    category: string | null
  }>
}) {
  // Group biomarkers by category
  const byCategory: Record<string, Array<{
    key: string
    displayName: string
    value: number
    unit: string
    flag: string
    optimalScore: number | null
    rangeLow: number | null
    rangeHigh: number | null
    confidence: number | null
  }>> = {}

  let optimalCount = 0
  let totalScored = 0

  for (const bm of upload.biomarkers) {
    const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
    const category = bm.category || def?.category || 'Other'
    const optScore = computeOptimalScore(bm.biomarkerKey, bm.value)

    if (!byCategory[category]) byCategory[category] = []

    byCategory[category].push({
      key: bm.biomarkerKey,
      displayName: def?.displayName || bm.rawName || bm.biomarkerKey,
      value: bm.value,
      unit: bm.unit,
      flag: bm.flag,
      optimalScore: optScore !== null ? Math.round(optScore * 100) : null,
      rangeLow: bm.rangeLow,
      rangeHigh: bm.rangeHigh,
      confidence: bm.confidence,
    })

    if (bm.flag === 'optimal') optimalCount++
    if (def) totalScored++
  }

  // Sort categories consistently
  const categoryOrder = [
    'hormones', 'metabolic', 'lipids', 'thyroid', 'inflammation',
    'nutrients', 'liver', 'kidney', 'hematology', 'toxins', 'autoimmunity',
  ]
  const sortedCategories = Object.entries(byCategory).sort(([a], [b]) => {
    const ai = categoryOrder.indexOf(a)
    const bi = categoryOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  // Flag summary
  const flagSummary: Record<string, number> = {}
  for (const bm of upload.biomarkers) {
    flagSummary[bm.flag] = (flagSummary[bm.flag] || 0) + 1
  }

  return {
    id: upload.id,
    testDate: upload.testDate,
    labName: upload.labName,
    source: upload.source,
    fileName: upload.fileName,
    confidence: upload.confidence,
    biomarkersCount: upload.biomarkers.length,
    optimalPercent: totalScored > 0 ? Math.round((optimalCount / totalScored) * 100) : null,
    flagSummary,
    categories: sortedCategories.map(([category, markers]) => ({
      name: category,
      markers: markers.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    })),
  }
}
