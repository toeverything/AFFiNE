# syntax=docker/dockerfile:1.7
#
# AION (AFFiNE fork) — Full build from source
# Includes Agent Platform module
#
# Multi-stage build:
#   1. deps    — install Node + Rust toolchains, yarn install
#   2. native  — compile Rust native bindings
#   3. build   — build server + web frontend
#   4. runtime — minimal production image

# ─── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:22-bookworm AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git curl openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Rust toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
# Copy package manifests first for better cache
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY packages/common/agent-contracts/package.json packages/common/agent-contracts/package.json
COPY tools/ tools/

# Copy all package.json files from workspace packages
COPY packages/backend/server/package.json packages/backend/server/package.json
COPY packages/backend/native/package.json packages/backend/native/package.json
COPY packages/frontend/core/package.json packages/frontend/core/package.json
COPY packages/frontend/apps/web/package.json packages/frontend/apps/web/package.json
COPY packages/frontend/component/package.json packages/frontend/component/package.json
COPY packages/frontend/admin/package.json packages/frontend/admin/package.json
COPY packages/frontend/i18n/package.json packages/frontend/i18n/package.json
COPY packages/frontend/native/package.json packages/frontend/native/package.json
COPY packages/frontend/electron-api/package.json packages/frontend/electron-api/package.json
COPY packages/frontend/routes/package.json packages/frontend/routes/package.json
COPY packages/frontend/templates/package.json packages/frontend/templates/package.json
COPY packages/frontend/track/package.json packages/frontend/track/package.json
COPY packages/common/debug/package.json packages/common/debug/package.json
COPY packages/common/env/package.json packages/common/env/package.json
COPY packages/common/error/package.json packages/common/error/package.json
COPY packages/common/graphql/package.json packages/common/graphql/package.json
COPY packages/common/infra/package.json packages/common/infra/package.json
COPY packages/common/native/package.json packages/common/native/package.json
COPY packages/common/nbstore/package.json packages/common/nbstore/package.json
COPY packages/common/reader/package.json packages/common/reader/package.json
COPY packages/common/s3-compat/package.json packages/common/s3-compat/package.json
COPY packages/common/theme/package.json packages/common/theme/package.json
COPY packages/common/y-octo/package.json packages/common/y-octo/package.json
COPY blocksuite/package.json blocksuite/package.json

# Copy remaining workspace package.jsons (catch-all for sub-packages)
COPY blocksuite/packages/ blocksuite/packages/
COPY packages/frontend/apps/mobile/package.json packages/frontend/apps/mobile/package.json

# Install deps
RUN yarn install --immutable || yarn install

# ─── Stage 2: Copy source & build native ────────────────────────────────────
FROM deps AS native

COPY . .

# Build Rust native bindings
RUN yarn affine @affine/server-native build || true
RUN yarn affine @affine/native build || true

# ─── Stage 3: Build application ─────────────────────────────────────────────
FROM native AS build

# Initialize TypeScript project references
RUN yarn affine init || true

# Build the server
RUN yarn affine @affine/server build || NODE_ENV=production yarn workspace @affine/server build

# Build the web frontend
RUN yarn affine @affine/web build || yarn workspace @affine/web build || true

# Generate Prisma client
RUN cd packages/backend/server && npx prisma generate

# ─── Stage 4: Runtime ───────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl libjemalloc2 ca-certificates git curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI for Agent Platform
RUN npm install -g @anthropic-ai/claude-code || true
# Install gh CLI for optional PR creation
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=libjemalloc.so.2

WORKDIR /app

# Copy built server
COPY --from=build /app/packages/backend/server /app

# Copy built web frontend as static files
COPY --from=build /app/packages/frontend/apps/web/dist /app/static

# Copy admin if it exists
COPY --from=build /app/packages/frontend/admin/dist /app/static/admin

EXPOSE 3010

# Agent Platform data directory
RUN mkdir -p /data/agent-platform
ENV AGENT_DB_PATH=/data/agent-platform

CMD ["node", "./dist/main.js"]
