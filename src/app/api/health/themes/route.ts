import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { generateThemes } from '@/lib/health-theme-engine'

// GET /api/health/themes?period=7
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }
    const { userId } = authResult

    const { searchParams } = new URL(request.url)
    const periodParam = searchParams.get('period')
    const period = periodParam ? parseInt(periodParam, 10) : 7

    if (isNaN(period) || period < 1 || period > 90) {
      return NextResponse.json(
        { error: 'Period must be between 1 and 90 days.' },
        { status: 400 }
      )
    }

    const themes = await generateThemes(userId, period)

    return NextResponse.json({ themes }, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('Error generating themes:', error)
    return NextResponse.json(
      { error: 'Failed to generate health themes' },
      { status: 500 }
    )
  }
}
