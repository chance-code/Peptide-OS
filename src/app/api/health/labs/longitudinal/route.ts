import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { getLongitudinalTrends } from '@/lib/labs/lab-longitudinal'

// GET /api/health/labs/longitudinal — Multi-upload trend analysis
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const biomarkerKeysParam = searchParams.get('biomarkers')
    const biomarkerKeys = biomarkerKeysParam
      ? biomarkerKeysParam.split(',').map(k => k.trim()).filter(Boolean)
      : undefined

    const result = await getLongitudinalTrends(userId, biomarkerKeys)

    return NextResponse.json({
      trends: result.trends.map(t => ({
        biomarkerKey: t.biomarkerKey,
        displayName: t.displayName,
        shortName: t.shortName,
        category: t.category,
        unit: t.unit,
        trajectory: t.trajectory,
        velocityPerMonth: t.velocityPerMonth,
        percentChange: t.percentChange,
        currentFlag: t.currentFlag,
        previousFlag: t.previousFlag,
        points: t.points,
      })),
      deteriorations: result.deteriorations.map(d => ({
        biomarkerKey: d.biomarkerKey,
        displayName: d.displayName,
        fromFlag: d.fromFlag,
        toFlag: d.toFlag,
        changePercent: d.changePercent,
        message: d.message,
      })),
      improvements: result.improvements.map(i => ({
        biomarkerKey: i.biomarkerKey,
        displayName: i.displayName,
        fromFlag: i.fromFlag,
        toFlag: i.toFlag,
        changePercent: i.changePercent,
        message: i.message,
      })),
      narrative: result.narrative,
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('Error fetching longitudinal trends:', error)
    return NextResponse.json(
      { error: 'Failed to fetch longitudinal trends' },
      { status: 500 }
    )
  }
}
