import type { NextConfig } from 'next'

// TODO: reemplazar [DOMINIO] con el dominio real del panel (ej: panel.tudominio.com)
const PANEL_DOMAIN = process.env.PANEL_DOMAIN ?? '[DOMINIO]'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' blob: data:",
      "font-src 'self' data: https://fonts.gstatic.com",
      // SSE para logs en tiempo real — necesita connect-src 'self'
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },

  async redirects() {
    if (process.env.NODE_ENV !== 'production') return []
    return [
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
        destination: `https://${PANEL_DOMAIN}/:path*`,
        permanent: true,
      },
    ]
  },
}

export default nextConfig
