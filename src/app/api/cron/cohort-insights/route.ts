import { NextResponse } from 'next/server'
import { generateCohortInsights } from '@/lib/health-cohort-intelligence'

// POST /api/cron/cohort-insights - Weekly cohort intelligence batch job
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const count = await generateCohortInsights()

    return NextResponse.json({
      success: true,
      insightsGenerated: count,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Cohort insights cron error:', error)
    return NextResponse.json({ error: 'Failed to generate cohort insights' }, { status: 500 })
  }
}
