# syntax=docker/dockerfile:1.7
#
# Wikitail — production image.
#
# The server is hapi + better-sqlite3 (native), the client is a Vite SPA served
# statically by hapi from packages/client/dist. We build both in one workspace
# `npm ci`, then ship the result as a single image.
#
# The server is executed with `tsx` (the same runner used in `npm run dev`)
# rather than compiled to JS. That is because `@wikitail/shared` publishes
# TypeScript sources (`main: ./src/index.ts`), so a plain `node dist/index.js`
# would fail to resolve its runtime imports. tsx handles it transparently.

# ---- Stage 1: build ---------------------------------------------------------

FROM node:22-bookworm-slim AS build

# better-sqlite3 has a native addon. On the -slim image the toolchain is not
# present; add it just for the install step.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first so the dependency layer caches across code-only changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json

# Full install (includes tsx, vite, vue-tsc — needed for the build + runtime).
RUN npm ci

# Copy sources.
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/client packages/client

# Base path the built UI is served from, e.g. "/s/wikitail/" when a reverse
# proxy mounts the app at that sub-path (see deploy/apache/wikitail.conf).
# Must have a leading and trailing slash. Baked into the built HTML/JS, so it
# cannot be changed without rebuilding the image.
#   podman build --build-arg VITE_BASE_PATH=/s/wikitail/ -t localhost/wikitail:latest .
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

# Client build → packages/client/dist. The server has no separate build step in
# this image (see file header for why).
RUN npm run build -w @wikitail/client

# Drop things the runtime does not need to keep the final image small.
RUN rm -rf \
      packages/client/src packages/client/public packages/client/index.html \
      packages/client/vite.config.ts packages/client/tsconfig*.json \
      packages/server/src/**/*.test.ts \
      packages/server/vitest.config.ts \
      packages/server/data packages/server/uploads

# ---- Stage 2: runtime -------------------------------------------------------

FROM node:22-bookworm-slim AS runtime

# tini as PID 1 so SIGTERM from systemd/podman propagates cleanly to Node, and
# ca-certificates so outbound HTTPS to Wikipedia/Commons/Finna works.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    AUTH_MODE=header \
    DB_PATH=/data/wikitail.db \
    UPLOADS_DIR=/uploads

WORKDIR /app

COPY --from=build /app /app

# State lives outside the image. These are the mount points; podman will bind
# volumes (or podman volumes) on top of them.
RUN mkdir -p /data /uploads \
 && chown -R node:node /data /uploads /app

USER node

EXPOSE 3000

# Note on health checks: they live in the Quadlet unit (HealthCmd=), not in
# the image, because podman builds OCI images by default and OCI carries no
# HEALTHCHECK field — a HEALTHCHECK line here would be silently dropped.

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "--no-install", "tsx", "packages/server/src/index.ts"]
