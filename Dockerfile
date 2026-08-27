# ─── Stage 1: build ─────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies (leverage layer cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source and build
COPY . .
RUN bun run build

# Prune dev dependencies so only production deps are kept
RUN bun install --frozen-lockfile --production

# ─── Stage 2: production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# SvelteKit adapter-node output lives in build/
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Persistent data directory (SQLite DB + gitdb clone)
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "build"]
