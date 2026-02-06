import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Force no-cache for HTML pages (helps with iOS WKWebView caching)
        source: '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon-).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
