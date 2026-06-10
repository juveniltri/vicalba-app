# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
# SKIP_ENV_VALIDATION=1 evita que src/env.ts valide vars inexistentes en build time
ENV SKIP_ENV_VALIDATION=1
RUN npm run build
ENV SKIP_ENV_VALIDATION=

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000

# Ejecuta migraciones pendientes antes de arrancar el servidor.
# prisma migrate deploy no necesita prisma.config.ts — lee DATABASE_URL del entorno.
CMD ["/bin/sh", "-c", "npx prisma migrate deploy && npm start"]
