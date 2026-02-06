import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import {
  getLiteracyLevel,
  setLiteracyLevel,
  updateEngagement,
  type LiteracyLevel,
  type EngagementAction,
} from '@/lib/biological-literacy'

const VALID_LEVELS: LiteracyLevel[] = ['explorer', 'student', 'practitioner', 'scientist']
const VALID_ACTIONS: EngagementAction[] = ['detail_tap', 'lab_view', 'insight_view']

// GET /api/health/literacy
export async function GET() {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) return authResult.response

    const record = await getLiteracyLevel(authResult.userId)

    return NextResponse.json(record, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    console.error('Error fetching literacy level:', error)
    return NextResponse.json(
      { error: 'Failed to fetch literacy level' },
      { status: 500 },
    )
  }
}

// PUT /api/health/literacy
// Body: { level?: LiteracyLevel, selfSelected?: boolean, action?: EngagementAction }
export async function PUT(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) return authResult.response

    const body = await request.json()
    const { level, selfSelected, action } = body as {
      level?: string
      selfSelected?: boolean
      action?: string
    }

    // Handle engagement action (increment counter)
    if (action) {
      if (!VALID_ACTIONS.includes(action as EngagementAction)) {
        return NextResponse.json(
          { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
          { status: 400 },
        )
      }
      const record = await updateEngagement(authResult.userId, action as EngagementAction)
      return NextResponse.json(record)
    }

    // Handle level change
    if (level) {
      if (!VALID_LEVELS.includes(level as LiteracyLevel)) {
        return NextResponse.json(
          { error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}` },
          { status: 400 },
        )
      }
      const record = await setLiteracyLevel(
        authResult.userId,
        level as LiteracyLevel,
        selfSelected ?? false,
      )
      return NextResponse.json(record)
    }

    return NextResponse.json(
      { error: 'Must provide either level or action' },
      { status: 400 },
    )
  } catch (error) {
    console.error('Error updating literacy level:', error)
    return NextResponse.json(
      { error: 'Failed to update literacy level' },
      { status: 500 },
    )
  }
}
