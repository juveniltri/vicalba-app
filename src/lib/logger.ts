import pino from 'pino'

// Logger estructurado con Pino.
// En produccion emite JSON queryable. En desarrollo emite pretty-print.
// Usar siempre logger.child({ module }) en vez de console.log.

const isDev = process.env.NODE_ENV === 'development'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: { env: process.env.NODE_ENV },
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.authorization', '*.cookie'],
    censor: '[REDACTED]',
  },
})

// Uso:
// const log = logger.child({ module: 'docker' })
// log.info({ projectId }, 'Deploy iniciado')
// log.error({ err, projectId }, 'Deploy fallido')
