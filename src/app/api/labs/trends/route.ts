import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyUserAccess } from '@/lib/api-auth'

interface Marker {
  name: string
  value: number
  unit: string
  rangeLow?: number
  rangeHigh?: number
  flag: string
}

interface TrendPoint {
  date: string
  value: number
  flag: string
}

// GET /api/labs/trends - Get trends for specific markers over time
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

    // Fetch all lab results for the user, ordered by test date ascending for charting
    const results = await prisma.labResult.findMany({
      where: { userId },
      orderBy: { testDate: 'asc' },
      select: {
        testDate: true,
        markers: true,
      },
    })

    // Build trends: { "Total Testosterone": [{ date, value, flag }, ...] }
    const trends: Record<string, TrendPoint[]> = {}
    for (const name of requestedMarkers) {
      trends[name] = []
    }

    for (const result of results) {
      let parsed: Marker[]
      try {
        parsed = JSON.parse(result.markers)
      } catch {
        continue
      }

      for (const marker of parsed) {
        if (requestedMarkers.includes(marker.name)) {
          trends[marker.name].push({
            date: result.testDate.toISOString(),
            value: marker.value,
            flag: marker.flag,
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
