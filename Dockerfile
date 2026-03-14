# syntax=docker/dockerfile:1

# Stage 1: Install dependencies
FROM node:20-bookworm-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace config, all package.json files, and prisma schema (needed by postinstall)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/core/prisma packages/core/prisma
COPY packages/mobile-app/package.json packages/mobile-app/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Stage 2: Build frontend (web export)
FROM deps AS build-frontend

COPY packages/mobile-app/ packages/mobile-app/

RUN pnpm --filter @togoder/mobile-app run build

# Stage 3: Build backend
FROM deps AS build-backend

COPY packages/core/src packages/core/src
COPY packages/core/tsconfig.json packages/core/

RUN pnpm --filter @togoder/core exec tsc

# Stage 4: Runtime
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace structure and node_modules from deps stage (includes compiled native modules + prisma client)
COPY --from=deps /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/package.json packages/core/
COPY --from=deps /app/packages/core/node_modules packages/core/node_modules
COPY --from=deps /app/packages/mobile-app/package.json packages/mobile-app/
COPY --from=deps /app/packages/mcp-server/package.json packages/mcp-server/

# Copy Prisma schema and migrations for runtime migrate
COPY packages/core/prisma packages/core/prisma

# Copy compiled backend
COPY --from=build-backend /app/packages/core/bin packages/core/bin

# Copy frontend static files into the path Express expects (../Frontend relative to bin/)
COPY --from=build-frontend /app/packages/mobile-app/dist packages/core/Frontend

# Create data directory
RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=6968

USER node

EXPOSE 6968

CMD sh -c "cd packages/core && (npx prisma migrate deploy || npx prisma db push || true) && node bin/index.js"
