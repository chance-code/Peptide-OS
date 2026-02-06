import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyUserAccess } from '@/lib/api-auth'
import { BIOMARKER_REGISTRY } from '@/lib/lab-biomarker-contract'

interface TrendPoint {
  date: string
  value: number
  flag: string
}

// GET /api/labs/trends - Get trends for specific markers (reads from enriched LabUpload + LabBiomarker)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const markersParam = searchParams.get('markers')

    if (!markersParam) {
      return NextResponse.json(
        { error: 'markers query parameter is required (comma-separated marker names)' },
        { status: 400 }
      )
    }

    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

    const requestedMarkers = markersParam.split(',').map((m) => m.trim())

    // Fetch all uploads with biomarkers for this user
    const uploads = await prisma.labUpload.findMany({
      where: { userId },
      orderBy: { testDate: 'asc' },
      include: {
        biomarkers: true,
      },
    })

    // Build trends keyed by display name (matching legacy format)
    const trends: Record<string, TrendPoint[]> = {}
    for (const name of requestedMarkers) {
      trends[name] = []
    }

    // Build a lookup: display name -> biomarkerKey (and reverse)
    const displayNameToKey = new Map<string, string>()
    for (const [key, def] of Object.entries(BIOMARKER_REGISTRY)) {
      displayNameToKey.set(def.displayName.toLowerCase(), key)
    }

    for (const upload of uploads) {
      for (const bm of upload.biomarkers) {
        const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
        const displayName = def?.displayName || bm.rawName || bm.biomarkerKey

        // Match by display name (iOS sends display names)
        if (requestedMarkers.includes(displayName)) {
          trends[displayName].push({
            date: upload.testDate.toISOString(),
            value: bm.value,
            flag: bm.flag,
          })
        }
      }
    }

    return NextResponse.json({ trends })
  } catch (error) {
    console.error('Error fetching lab trends:', error)
    return NextResponse.json({ error: 'Failed to fetch lab trends' }, { status: 500 })
  }
}
