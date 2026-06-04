import { z } from 'zod'

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Base de datos
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida'),

  // Auth
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET debe tener al menos 32 caracteres'),
  NEXTAUTH_URL: z.string().url(),

  // GitHub Webhooks — validación HMAC-SHA256 de payloads entrantes
  GITHUB_WEBHOOK_SECRET: z.string().min(16),

  // Docker — ruta al socket del daemon (por defecto el estándar de Linux)
  DOCKER_SOCKET_PATH: z.string().default('/var/run/docker.sock'),

  // Panel — dominio público del panel (usado en next.config.ts para redirects HTTPS)
  PANEL_DOMAIN: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Monitoring (opcional — el panel arranca sin Sentry)
  SENTRY_DSN: z.string().url().optional(),
})

const clientSchema = z.object({
  // Sin variables públicas por ahora — panel 100% interno
})

const serverResult = serverSchema.safeParse(process.env)
if (!serverResult.success) {
  console.error('❌ Variables de entorno del servidor inválidas:')
  console.error(serverResult.error.flatten().fieldErrors)
  process.exit(1)
}

const clientResult = clientSchema.safeParse({})
if (!clientResult.success) {
  console.error('❌ Variables de entorno del cliente inválidas:')
  console.error(clientResult.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ...serverResult.data,
  ...clientResult.data,
} as const

export type Env = typeof env
