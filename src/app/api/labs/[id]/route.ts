import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

interface Marker {
  name: string
  value: number
  unit: string
  rangeLow?: number
  rangeHigh?: number
  flag: string
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

// GET /api/labs/[id] - Get a single lab result
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await prisma.labResult.findUnique({ where: { id } })

    if (!result) {
      return NextResponse.json({ error: 'Lab result not found' }, { status: 404 })
    }

    return NextResponse.json({ ...result, markers: parseMarkers(result.markers) })
  } catch (error) {
    console.error('Error fetching lab result:', error)
    return NextResponse.json({ error: 'Failed to fetch lab result' }, { status: 500 })
  }
}

// PUT /api/labs/[id] - Update a lab result
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { testDate, labName, markers, notes } = body

    const existing = await prisma.labResult.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Lab result not found' }, { status: 404 })
    }

    // Build update data — only include provided fields
    const data: Record<string, unknown> = {}

    if (testDate !== undefined) {
      data.testDate = new Date(testDate)
    }
    if (labName !== undefined) {
      data.labName = labName || null
    }
    if (notes !== undefined) {
      data.notes = notes || null
    }
    if (markers !== undefined && Array.isArray(markers)) {
      const processedMarkers = markers.map((m: Marker) => ({
        name: m.name,
        value: m.value,
        unit: m.unit,
        rangeLow: m.rangeLow,
        rangeHigh: m.rangeHigh,
        flag: computeFlag(m.value, m.rangeLow, m.rangeHigh),
      }))
      data.markers = JSON.stringify(processedMarkers)
    }

    const updated = await prisma.labResult.update({
      where: { id },
      data,
    })

    return NextResponse.json({ ...updated, markers: parseMarkers(updated.markers) })
  } catch (error) {
    console.error('Error updating lab result:', error)
    return NextResponse.json({ error: 'Failed to update lab result' }, { status: 500 })
  }
}

// DELETE /api/labs/[id] - Delete a lab result
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await prisma.labResult.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting lab result:', error)
    return NextResponse.json({ error: 'Failed to delete lab result' }, { status: 500 })
  }
}
