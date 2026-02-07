import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

/**
 * Verify that the authenticated user owns the requested userId.
 * Compares the requested userId against session.user.id (profileId from JWT).
 * No database queries — the profileId lives in the token.
 */
export async function verifyUserAccess(requestedUserId: string | null): Promise<
  | { success: true; userId: string }
  | { success: false; response: NextResponse }
> {
  if (!requestedUserId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      ),
    }
  }

  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  if (requestedUserId !== session.user.id) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden - cannot access other user data' },
        { status: 403 }
      ),
    }
  }

  return { success: true, userId: requestedUserId }
}

/**
 * Get the authenticated user's profile ID directly from the session.
 * No database queries — the profileId lives in the JWT token.
 */
export async function getAuthenticatedUserId(): Promise<
  | { success: true; userId: string }
  | { success: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  return { success: true, userId: session.user.id }
}
