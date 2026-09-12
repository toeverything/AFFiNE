# syntax=docker/dockerfile:1.7
# Mosaic runtime assembled from CI artifacts (backend/dist + MIT frontend dist).
# Must not COPY packages/backend (AFFiNE EE) or run Prisma / self-host-predeploy.

FROM node:22.23.2-bookworm AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22.23.2-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system mosaic \
  && adduser --system --ingroup mosaic mosaic \
  && mkdir -p /data/blobs /app/static \
  && chown -R mosaic:mosaic /data/blobs /app

COPY --from=deps --chown=mosaic:mosaic /app/node_modules ./node_modules
COPY --chown=mosaic:mosaic backend/package.json ./package.json
COPY --chown=mosaic:mosaic backend/dist ./dist
COPY --chown=mosaic:mosaic packages/frontend/apps/web/dist ./static
COPY --chown=mosaic:mosaic packages/frontend/admin/dist ./static/admin
COPY --chown=mosaic:mosaic packages/frontend/apps/mobile/dist ./static/mobile

RUN test ! -d /app/packages/backend \
  && test ! -e /app/scripts/self-host-predeploy.js \
  && test ! -d /app/prisma \
  && test -f /app/dist/main.js \
  && (test -f /app/static/index.html || test -f /app/static/selfhost.html)

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3010 \
    MOSAIC_SERVER=1 \
    MOSAIC_STATIC_DIR=/app/static \
    BLOB_DRIVER=fs \
    BLOB_DIR=/data/blobs

USER mosaic
EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s --retries=20 --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:3010/info').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
