import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'

// GET /api/health/hypotheses - List user hypotheses
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const hypotheses = await prisma.userHypothesis.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ hypotheses })
  } catch (error) {
    console.error('Hypotheses list error:', error)
    return NextResponse.json({ error: 'Failed to fetch hypotheses' }, { status: 500 })
  }
}

// POST /api/health/hypotheses - Create a new hypothesis
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const body = await request.json()
    const { title, description, interventionType, interventionId, metricType, expectedDirection } = body

    if (!title || !interventionType || !metricType || !expectedDirection) {
      return NextResponse.json({ error: 'Missing required fields: title, interventionType, metricType, expectedDirection' }, { status: 400 })
    }

    const validDirections = ['increase', 'decrease']
    if (!validDirections.includes(expectedDirection)) {
      return NextResponse.json({ error: 'expectedDirection must be "increase" or "decrease"' }, { status: 400 })
    }

    const hypothesis = await prisma.userHypothesis.create({
      data: {
        userId,
        title,
        description: description ?? null,
        interventionType,
        interventionId: interventionId ?? null,
        metricType,
        expectedDirection,
      },
    })

    return NextResponse.json({ hypothesis }, { status: 201 })
  } catch (error) {
    console.error('Hypothesis create error:', error)
    return NextResponse.json({ error: 'Failed to create hypothesis' }, { status: 500 })
  }
}
