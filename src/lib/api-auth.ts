import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * Verify that the authenticated user owns the requested userId.
 * Returns the validated userId or an error response.
 */
export async function verifyUserAccess(requestedUserId: string | null): Promise<
  | { success: true; userId: string }
  | { success: false; response: NextResponse }
> {
  // Check if userId was provided
  if (!requestedUserId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      ),
    }
  }

  // Get the authenticated session
  const session = await getServerSession(authOptions)

  if (!session?.user?.name) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  // Find the UserProfile for the authenticated user
  const userProfile = await prisma.userProfile.findFirst({
    where: { name: session.user.name },
    select: { id: true },
  })

  if (!userProfile) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      ),
    }
  }

  // Verify the requested userId matches the authenticated user's profile
  if (requestedUserId !== userProfile.id) {
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
 * Get the authenticated user's profile ID.
 * Use this when you need the userId but it wasn't provided in the request.
 */
export async function getAuthenticatedUserId(): Promise<
  | { success: true; userId: string }
  | { success: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.name) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  const userProfile = await prisma.userProfile.findFirst({
    where: { name: session.user.name },
    select: { id: true },
  })

  if (!userProfile) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      ),
    }
  }

  return { success: true, userId: userProfile.id }
}
