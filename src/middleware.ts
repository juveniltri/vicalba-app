// Next.js Edge Middleware — CORS + Rate limiting
// Se ejecuta antes de cada request en las rutas del matcher.
// Para Express/Hono: ver src/middleware/security.ts en su lugar.
import { NextRequest, NextResponse } from 'next/server'

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Solo orígenes explícitos. Nunca '*' en producción.
const ALLOWED_ORIGINS: string[] = [
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  // Añadir dominios adicionales del proyecto si hay clientes externos
]

function applyCors(request: NextRequest, response: NextResponse): void {
  const origin = request.headers.get('origin')
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    )
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-CSRF-Token'
    )
    response.headers.set('Access-Control-Max-Age', '86400')
  }
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// IMPORTANTE: este mapa en memoria se resetea en cada cold start (serverless).
// Para producción con múltiples instancias, migrar a Upstash Rate Limit:
// https://github.com/upstash/ratelimit — npm install @upstash/ratelimit @upstash/redis
//
// Límites por ventana de 1 minuto:
const LIMITS = {
  api: 60,   // rutas /api/* generales
  auth: 10,  // /api/auth/* — brute force protection
}
const WINDOW_MS = 60_000

const store = new Map<string, { count: number; reset: number }>()

function checkRateLimit(key: string, max: number): { limited: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + WINDOW_MS })
    return { limited: false, remaining: max - 1 }
  }

  if (entry.count >= max) {
    return { limited: true, remaining: 0 }
  }

  entry.count++
  return { limited: false, remaining: max - entry.count }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export function middleware(request: NextRequest) {
  const { pathname, method } = request

  // Responde preflight CORS sin llegar al servidor
  if (method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 })
    applyCors(request, response)
    return response
  }

  // Rate limiting en rutas de API
  if (pathname.startsWith('/api/')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    const isAuthRoute = pathname.startsWith('/api/auth/')
    const max = isAuthRoute ? LIMITS.auth : LIMITS.api
    const key = `${ip}:${isAuthRoute ? 'auth' : 'api'}`

    const { limited, remaining } = checkRateLimit(key, max)

    if (limited) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
        },
      })
    }

    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Limit', String(max))
    response.headers.set('X-RateLimit-Remaining', String(remaining))
    applyCors(request, response)
    return response
  }

  const response = NextResponse.next()
  applyCors(request, response)
  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    // Añadir rutas adicionales que necesiten CORS o rate limiting
  ],
}
