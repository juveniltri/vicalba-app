import { NextResponse } from 'next/server'

// GET /api/health — estado del panel y servicios críticos.
// Traefik puede usar este endpoint para health checks del contenedor del panel.

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}
  let healthy = true

  // --- Base de datos ----------------------------------------------------------
  // Descomentar cuando Prisma esté configurado:
  // try {
  //   await db.$queryRaw`SELECT 1`
  //   checks.database = 'ok'
  // } catch {
  //   checks.database = 'error'
  //   healthy = false
  // }

  // --- Docker daemon ----------------------------------------------------------
  // Descomentar cuando dockerode esté configurado:
  // try {
  //   const docker = new Dockerode()
  //   await docker.ping()
  //   checks.docker = 'ok'
  // } catch {
  //   checks.docker = 'error'
  //   healthy = false
  // }

  checks.app = 'ok'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? 'unknown',
      checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
