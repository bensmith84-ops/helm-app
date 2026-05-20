# Multi-stage build for Next.js on Cloud Run.
# Produces a small, standalone image with no node_modules pollution.

# ─── Stage 1: deps ────────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2: builder ─────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars. Cloud Build sets these via --substitutions.
# Anything starting with NEXT_PUBLIC_ is baked into the client bundle.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_BQ_PROXY_URL
ARG NEXT_PUBLIC_BQ_PROXY_TOKEN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_BQ_PROXY_URL=$NEXT_PUBLIC_BQ_PROXY_URL
ENV NEXT_PUBLIC_BQ_PROXY_TOKEN=$NEXT_PUBLIC_BQ_PROXY_TOKEN

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runner ──────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

# Non-root user for Cloud Run best practice
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# next.config.js has `output: 'standalone'` which produces .next/standalone —
# a self-contained server bundle. Copy that plus the public/static assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node","server.js"]
