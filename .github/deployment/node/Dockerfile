# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS assets
WORKDIR /app

COPY ./packages/backend/server /app
COPY ./packages/frontend/apps/web/dist /app/static
COPY ./packages/frontend/admin/dist /app/static/admin
COPY ./packages/frontend/apps/mobile/dist /app/static/mobile

# Keep server sourcemap for stacktraces, but don't ship frontend/node_modules sourcemaps.
ARG TARGETARCH
ARG TARGETVARIANT
# Needed for Prisma engine resolution (and potential engine download during cleanup).
RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" TARGETVARIANT="${TARGETVARIANT}" node ./scripts/docker-clean.mjs

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=assets /app /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

# The base image provides a 'node' user (uid=1000, gid=1000).
# The app uses os.homedir() to resolve ~/.affine/ for config and storage paths.
RUN mkdir -p /home/node/.affine/config /home/node/.affine/storage && \
  chown -R node:node /home/node/.affine

# Enable jemalloc by preloading the library
ENV LD_PRELOAD=libjemalloc.so.2

USER node

EXPOSE 3010

CMD ["node", "./dist/main.js"]
