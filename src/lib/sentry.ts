import * as Sentry from '@sentry/nextjs'

// Inicializacion de Sentry — importar en instrumentation.ts (Next.js 15+).

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Sentry] SENTRY_DSN no configurado — los errores no se capturaran')
    }
    return
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
    replaysSessionSampleRate: 0,
    enabled: process.env.NODE_ENV === 'production',
  })
}
