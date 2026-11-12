# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

# ---- Build: install deps, build web + bundled api ----
# Platform-independent output: runs natively on the builder, even for arm64 releases.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY e2e/package.json e2e/
COPY apps/mobile/package.json apps/mobile/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @ikrive/web build && pnpm --filter @ikrive/api build
# The image does not ship source maps nor the build metafile.
RUN find apps/api/dist -name '*.map' -delete && rm -f apps/api/dist/metafile-*.json

# ---- Natives: install only the runtime externals listed in dist/package.json ----
FROM node:${NODE_VERSION}-alpine AS natives
WORKDIR /out
COPY --from=build /repo/apps/api/dist/package.json ./
COPY docker/prune-runtime.mjs /tmp/
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock \
    && node /tmp/prune-runtime.mjs /out/node_modules

# ---- Runtime: minimal image, non-root ----
FROM node:${NODE_VERSION}-alpine AS runtime
ARG VERSION=0.0.0
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/public \
    IKRIVE_VERSION=${VERSION}

WORKDIR /app
COPY --from=natives --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/web/dist ./public

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run automatically on startup.
CMD ["node", "dist/server.js"]
