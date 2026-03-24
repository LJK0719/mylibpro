# ===== Stage 1: Build =====
FROM node:20-slim AS builder
WORKDIR /app

# Enable corepack for modern package manager support (if using pnpm/yarn, not needed for pure npm but safe)
RUN corepack enable

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Copy environment variables example if needed for build
# (Next.js standalone build can sometimes complain without some envs)
# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ===== Stage 2: Production Run =====
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create directories for data and db mapping
RUN mkdir -p /app/libdata /app/db && chown -R node:node /app

# Non-root user
USER node

# Copy standalone build output
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default paths in container (can be overridden in docker-compose)
ENV DATA_ROOT=/app/libdata
ENV DB_PATH=/app/db/library.db

CMD ["node", "server.js"]
