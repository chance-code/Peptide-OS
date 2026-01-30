import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  // Protect all routes except login, api/auth, and static files
  matcher: [
    /*
     * Match all request paths except:
     * - /login (login page)
     * - /api/auth (NextAuth routes)
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico (favicon file)
     * - /sw.js (service worker)
     * - /manifest.json (PWA manifest)
     * - /icon-*.png (PWA icons)
     */
    '/((?!login|api/auth|api/debug|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon-).*)',
  ],
}
