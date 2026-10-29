# Build with a non-secret placeholder DATABASE_URL because Prisma 7 reads its
# datasource URL during client generation. Runtime credentials are injected only
# when the container starts.
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN test -n "$NEXT_PUBLIC_SITE_URL" && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node --from=builder /app/.next-prod ./.next-prod
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/src ./src
COPY --chown=node:node --from=builder /app/next.config.ts ./next.config.ts
COPY --chown=node:node --from=builder /app/scripts/validate-deployment-env.mjs ./scripts/validate-deployment-env.mjs
RUN mkdir -p .next-prod/cache && chown node:node .next-prod/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/validate-deployment-env.mjs && exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port 3000"]
