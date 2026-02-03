import { NextRequest, NextResponse } from 'next/server'
import { decode, encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'

// POST /api/auth/mobile-exchange
// Called from the WKWebView after receiving a transfer token via URL scheme.
// Validates the transfer token and sets session cookies in the webview.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token: transferToken } = body

    if (!transferToken) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Decode and verify the transfer token
    const decoded = await decode({ token: transferToken, secret })

    if (!decoded || decoded.purpose !== 'mobile_transfer') {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Create a long-lived session token (same as normal auth)
    const sessionToken = await encode({
      token: {
        name: decoded.name,
        email: decoded.email,
        provider: decoded.provider,
        sub: decoded.sub,
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // Set the session cookies
    const cookieStore = await cookies()
    const isProduction = process.env.NODE_ENV === 'production'

    cookieStore.set('next-auth.session-token', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })

    cookieStore.set('__Secure-next-auth.session-token', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })

    return NextResponse.json({
      success: true,
      user: { name: decoded.name, email: decoded.email },
    })
  } catch (error) {
    console.error('Mobile exchange error:', error)
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 })
  }
}
