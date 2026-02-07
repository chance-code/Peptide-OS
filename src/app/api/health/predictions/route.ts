import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import { forecastAllBiomarkers, forecastSingleBiomarker } from '@/lib/health-lab-forecasting'

const CACHE_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

// GET /api/health/predictions - GP lab biomarker forecasts
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const biomarkerKey = searchParams.get('biomarkerKey')

    // Single biomarker filter
    if (biomarkerKey) {
      // Check cache first
      const cached = await prisma.healthPrediction.findUnique({
        where: { userId_biomarkerKey: { userId, biomarkerKey } },
      })

      if (cached && (Date.now() - cached.computedAt.getTime()) < CACHE_MAX_AGE_MS) {
        return NextResponse.json(cached, {
          headers: { 'Cache-Control': 'private, max-age=3600' },
        })
      }

      const forecast = await forecastSingleBiomarker(userId, biomarkerKey)
      return NextResponse.json(forecast, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      })
    }

    // All biomarkers — check if we have recent cached results
    const cachedAll = await prisma.healthPrediction.findMany({
      where: { userId },
      orderBy: { computedAt: 'desc' },
    })

    const mostRecent = cachedAll[0]?.computedAt
    if (mostRecent && (Date.now() - mostRecent.getTime()) < CACHE_MAX_AGE_MS && cachedAll.length > 0) {
      return NextResponse.json({
        forecasts: cachedAll,
        cached: true,
        computedAt: mostRecent.toISOString(),
      }, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      })
    }

    // Recompute
    const result = await forecastAllBiomarkers(userId)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (error) {
    console.error('Predictions API error:', error)
    return NextResponse.json(
      { error: 'Failed to compute predictions' },
      { status: 500 }
    )
  }
}
