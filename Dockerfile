# syntax=docker/dockerfile:1.7
#
# AION (AFFiNE fork) — Production build from source
# Includes Agent Platform module (Claude Code CLI + gh CLI)
#
# Multi-stage build:
#   0. manifests — extract package.json files for yarn cache
#   1. deps     — install Node + Rust toolchains, yarn install
#   2. build    — compile native bindings, server, and web frontend
#   3. runtime  — minimal production image

# ─── Stage 0: Extract package.json manifests ─────────────────────────────────
# Auto-discovers all workspace package.json files so we never break when
# packages are added/removed upstream (blocksuite has 70+ sub-packages).
FROM node:22-bookworm-slim AS manifests
WORKDIR /app
COPY . .
RUN find . -name "node_modules" -prune -o -name "package.json" -print \
      | xargs -I{} sh -c 'mkdir -p /manifests/$(dirname "{}") && cp "{}" /manifests/"{}"' \
    && cp /app/yarn.lock /app/.yarnrc.yml /manifests/ \
    && cp -r /app/.yarn /manifests/.yarn \
    && cp -r /app/tools /manifests/tools 2>/dev/null || true

# ─── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:22-bookworm AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git curl openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Rust toolchain (needed for native bindings)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
COPY --from=manifests /manifests ./

# Install deps — skip postinstall scripts (source code isn't here yet)
RUN yarn install --mode=skip-build || YARN_ENABLE_SCRIPTS=false yarn install

# ─── Stage 2: Build ─────────────────────────────────────────────────────────
FROM deps AS build

COPY . .

# Build tooling reads git metadata (commit hash for version info).
# .dockerignore excludes .git, so we create a dummy repo.
RUN git config --global user.email "build@aion" && git config --global user.name "build" \
    && git init && git add -A && git commit -m "docker build"

# Run postinstall scripts now that source is available (prisma generate, etc.)
RUN yarn install || true

# Build Rust native bindings
RUN yarn affine @affine/server-native build || true
RUN yarn affine @affine/native build || true

# Initialize TypeScript project references
RUN yarn affine init || true

# Build the server
RUN yarn affine @affine/server build || NODE_ENV=production yarn workspace @affine/server build

# Build the web frontend
RUN yarn affine @affine/web build || yarn workspace @affine/web build || true

# Generate Prisma client
RUN cd packages/backend/server && npx prisma generate

# Ensure dist dirs exist so COPY in runtime stage won't fail
RUN mkdir -p packages/frontend/apps/web/dist packages/frontend/admin/dist

# ─── Stage 3: Runtime ───────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl libjemalloc2 ca-certificates git curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI for Agent Platform
RUN npm install -g @anthropic-ai/claude-code || true

# Install gh CLI for optional PR creation
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=libjemalloc.so.2

WORKDIR /app

# Copy built artifacts
COPY --from=build /app/packages/backend/server /app
COPY --from=build /app/packages/frontend/apps/web/dist /app/static
COPY --from=build /app/packages/frontend/admin/dist /app/static/admin

# Copy node_modules for prisma CLI and runtime dependencies
COPY --from=build /app/node_modules /app/node_modules

EXPOSE 3010

CMD ["node", "./dist/main.js"]
