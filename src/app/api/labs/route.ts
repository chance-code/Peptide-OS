import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyUserAccess } from '@/lib/api-auth'

interface MarkerInput {
  name: string
  value: number
  unit: string
  rangeLow?: number
  rangeHigh?: number
}

interface Marker extends MarkerInput {
  flag: 'normal' | 'high' | 'low'
}

function computeFlag(value: number, rangeLow?: number, rangeHigh?: number): 'normal' | 'high' | 'low' {
  if (rangeHigh !== undefined && value > rangeHigh) return 'high'
  if (rangeLow !== undefined && value < rangeLow) return 'low'
  return 'normal'
}

function parseMarkers(markersJson: string): Marker[] {
  try {
    return JSON.parse(markersJson)
  } catch {
    return []
  }
}

// GET /api/labs - List all lab results for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const auth = await verifyUserAccess(searchParams.get('userId'))
    if (!auth.success) return auth.response
    const { userId } = auth

    const [results, total] = await Promise.all([
      prisma.labResult.findMany({
        where: { userId },
        orderBy: { testDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.labResult.count({ where: { userId } }),
    ])

    const parsed = results.map((r) => ({
      ...r,
      markers: parseMarkers(r.markers),
    }))

    return NextResponse.json({ results: parsed, total })
  } catch (error) {
    console.error('Error fetching lab results:', error)
    return NextResponse.json({ error: 'Failed to fetch lab results' }, { status: 500 })
  }
}

// POST /api/labs - Create a new lab result
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

    // Auto-compute flags for each marker
    const processedMarkers: Marker[] = markers.map((m: MarkerInput) => ({
      name: m.name,
      value: m.value,
      unit: m.unit,
      rangeLow: m.rangeLow,
      rangeHigh: m.rangeHigh,
      flag: computeFlag(m.value, m.rangeLow, m.rangeHigh),
    }))

    const result = await prisma.labResult.create({
      data: {
        userId,
        testDate: new Date(testDate),
        labName: labName || null,
        notes: notes || null,
        markers: JSON.stringify(processedMarkers),
      },
    })

    return NextResponse.json(
      { ...result, markers: processedMarkers },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating lab result:', error)
    return NextResponse.json({ error: 'Failed to create lab result' }, { status: 500 })
  }
}
