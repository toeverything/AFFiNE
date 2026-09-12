# syntax=docker/dockerfile:1.7
# Mosaic Server API image. Does not contain packages/backend (AFFiNE EE).
# All-in-one (MIT frontend + server): docker build -f Dockerfile.from-source -t mosaic:local .

FROM node:22.23.2-bookworm AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22.23.2-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system mosaic \
  && adduser --system --ingroup mosaic mosaic
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=mosaic:mosaic /app/dist ./dist
RUN test ! -d /app/packages \
  && test ! -e /app/scripts/self-host-predeploy.js \
  && test -f /app/dist/main.js \
  && chown -R mosaic:mosaic /app
USER mosaic
EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s --retries=20 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3010/info').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
