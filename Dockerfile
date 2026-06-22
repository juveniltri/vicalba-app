# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

RUN npm install -g npm@11

COPY package*.json ./
COPY prisma ./prisma
# npm install vs npm ci: @emnapi resolves to different versions on macOS vs Alpine,
# so the macOS-generated lock file fails the sync check on Linux builds.
RUN npm install --prefer-offline

COPY . .
RUN npx prisma generate
ENV SKIP_ENV_VALIDATION=1
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat git openssh-client docker-cli docker-cli-compose && \
    addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["/bin/sh", "-c", "npx prisma migrate deploy && npm start"]
