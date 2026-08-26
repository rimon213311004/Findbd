import type { NextConfig } from 'next';

/**
 * The rewrite is the important part.
 *
 * The refresh token lives in an httpOnly cookie scoped to `/api/auth`. If the
 * browser talked to `localhost:4000` directly, that cookie would be third-party
 * — blocked outright by Safari's ITP and by Chrome's third-party cookie phase-out,
 * which would silently break session restore for a large share of users. Proxying
 * through the Next server keeps the cookie same-origin, so the flow works in every
 * browser without needing `sameSite=none`.
 *
 * It also means the client never needs an API base URL: every request is a
 * relative `/api/...`, in the browser and on the server alike.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },

  images: {
    // Report photos are served by Cloudinary, which already does the resizing.
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
