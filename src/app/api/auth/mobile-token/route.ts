import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { encode } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'

// GET /api/auth/mobile-token
// Called from SFSafariViewController after OAuth completes.
// Reads the session, creates a short-lived transfer token,
// and uses a client-side redirect to the app's custom URL scheme.
//
// NOTE: We use an HTML page with window.location.href instead of
// NextResponse.redirect() because HTTP 302 redirects do not work
// with custom URL schemes (arcprotocol://) — browsers and HTTP
// clients reject non-HTTP(S) Location headers.

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    const loginUrl = `${process.env.NEXTAUTH_URL || 'https://peptide-os-production.up.railway.app'}/login?error=no_session`
    return NextResponse.redirect(loginUrl)
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Create a short-lived token (5 minutes) with the user's session data
  const transferToken = await encode({
    token: {
      name: session.user.name,
      email: session.user.email,
      provider: (session.user as { provider?: string }).provider || 'google',
      sub: session.user.email || session.user.name || 'unknown',
      purpose: 'mobile_transfer',
    },
    secret,
    maxAge: 5 * 60, // 5 minutes
  })

  // Use client-side redirect to the custom URL scheme
  // SFSafariViewController will handle arcprotocol:// and Capacitor's
  // App.addListener('appUrlOpen') will catch it
  const redirectUrl = `arcprotocol://auth-callback?token=${encodeURIComponent(transferToken)}`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Signing in...</title></head>
<body style="background:#0f172a;color:#94a3b8;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center">
  <p style="font-size:18px;margin-bottom:16px">Signing you in...</p>
  <p style="font-size:14px"><a href="${redirectUrl}" style="color:#22d3ee">Tap here if not redirected</a></p>
</div>
<script>window.location.href = ${JSON.stringify(redirectUrl)};</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
