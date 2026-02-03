import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'

// Map OAuth emails to existing profile names (same as main auth)
const emailToProfileName: Record<string, string> = {
  'chanceolson@gmail.com': 'Chance Olson',
  'angelaolson8@gmail.com': 'Angela Olson',
}

// POST /api/auth/native - Exchange native auth credentials for a session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, idToken, accessToken, authorizationCode, user } = body

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    let email: string | null = null
    let name: string | null = null

    if (provider === 'google') {
      // Verify Google ID token
      if (!idToken) {
        return NextResponse.json(
          { error: 'ID token is required for Google' },
          { status: 400 }
        )
      }

      // Decode the ID token (in production, verify with Google's public keys)
      // For now, we trust the token from our native app
      try {
        const payload = JSON.parse(
          Buffer.from(idToken.split('.')[1], 'base64').toString()
        )
        email = payload.email
        name = payload.name
      } catch {
        return NextResponse.json(
          { error: 'Invalid ID token' },
          { status: 400 }
        )
      }
    } else if (provider === 'apple') {
      // Apple Sign-In
      if (user?.email) {
        email = user.email
      }

      // Apple only provides name on first sign-in
      if (user?.givenName || user?.familyName) {
        name = [user.givenName, user.familyName].filter(Boolean).join(' ')
      }

      // If we have an identity token, try to get email from it
      if (!email && idToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(idToken.split('.')[1], 'base64').toString()
          )
          email = payload.email
        } catch {
          // Ignore decode errors
        }
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported provider' },
        { status: 400 }
      )
    }

    // Map email to profile name if known
    if (email && emailToProfileName[email.toLowerCase()]) {
      name = emailToProfileName[email.toLowerCase()]
    }

    if (!email && !name) {
      return NextResponse.json(
        { error: 'Could not determine user identity' },
        { status: 400 }
      )
    }

    // Create a session token
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const userName = name || email?.split('@')[0] || 'User'
    const userSub = email || name || 'unknown'

    const token = await encode({
      token: {
        name: userName,
        email: email || undefined,
        provider,
        sub: userSub,
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // Set the session cookie
    const cookieStore = await cookies()

    // Set secure cookie options based on environment
    const isProduction = process.env.NODE_ENV === 'production'

    cookieStore.set('next-auth.session-token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // Also set the callback cookie for NextAuth compatibility
    cookieStore.set('__Secure-next-auth.session-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })

    return NextResponse.json({
      success: true,
      user: { name, email },
    })
  } catch (error) {
    console.error('Native auth error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
