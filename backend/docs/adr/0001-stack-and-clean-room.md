# ADR 0001 — Stack choices and clean-room policy

- Status: Accepted
- Date: 2026-09-12
- Phase: 0 (Foundation)

## Context

Mosaic needs a self-hosted server that the existing MIT frontend (`packages/frontend/**`, BlockSuite, `@affine/nbstore`, `@affine/graphql`) can talk to. The previous process lived in `packages/backend/**` under an EE license. That code must not be copied, adapted, or used as a reference implementation for algorithms.

The product requirement is **wire compatibility**, not a NestJS rewrite.

## Decision

### Location

New server lives at repository root `backend/` (package `@mosaic/server`), not `packages/server` and not `packages/backend`. Reasons:

1. Isolation from the AFFiNE yarn workspace and EE packages.
2. Own `LICENSE` (Mosaic EE), own lockfile, own Node process.
3. Easy to extract to a separate repository later.
4. Explicit product instruction: implement in `backend/` at the repo root.

> Update (2026-09-12): `backend/` is licensed under the Mosaic EE License
> (`backend/LICENSE`), by analogy with how upstream AFFiNE licenses
> `packages/backend/server` under its own EE License while the rest of the
> repo stays MIT (`LICENSE-MIT`). The root `LICENSE` file mirrors upstream's
> pointer structure. This is a licensing-terms change only — the clean-room
> policy below is unaffected: `backend/` remains an independent
> implementation against observed wire contracts, never copied or adapted
> from AFFiNE's EE source.

`packages/backend` remains in git for the yarn workspace. Phase 5 removes it from **runtime images** and default compose; see `docs/cutover.md`. Dual-run: `docker-compose.ee.yml`.

### Stack

| Layer      | Choice                                      | Why                                                                 |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Language   | TypeScript, Node 22                         | Same language as the MIT client; faster MVP than a Rust core        |
| HTTP       | Fastify 5                                   | Explicit plugins, low magic vs Nest, first-class TypeScript         |
| Validation | Zod                                         | Fail-fast 12-factor config                                          |
| Logs       | Pino JSON + request/trace ids               | Fastify-native structured logs                                      |
| Metrics    | prom-client `/metrics`                      | Sync lag / update size / error rate placeholders from day one       |
| Tracing    | In-process skeleton + W3C `traceparent`     | OTLP SDK when GraphQL + Socket.IO exist                             |
| GraphQL    | Yoga (Phase 1)                              | Matches `POST /graphql` + `x-operation-name` from `@affine/graphql` |
| Realtime   | Socket.IO (Phase 2)                         | nbstore client is Socket.IO, including polling for self-host        |
| DB         | PostgreSQL 16                               | Transactions, JSON; compose service from Phase 0                    |
| Cache      | Redis 7                                     | Sessions, rate limit, WS fanout; compose service from Phase 0       |
| CRDT       | `yjs` on the server (Phase 2)               | Public spec; no EE native `y-octo` binding                          |
| Auth       | Session cookie + refresh rotation (Phase 1) | What `@affine/core` cloud already calls                             |

### Architecture

Hexagonal / ports & adapters:

- `src/domain` — types and ports. No Fastify, GraphQL, Socket.IO, SQL.
- `src/application` — use-cases.
- `src/adapters` — HTTP, later GraphQL/WS/Postgres/Redis/S3.
- Compat adapters translate MIT client shapes into domain commands. A Mosaic-native API v2 can sit beside them later.

### Clean-room policy (mandatory)

1. **Do not** read, copy, or translate source under `packages/backend/server` or `packages/backend/native` when implementing behavior.
2. **Do** observe the MIT client: `@affine/graphql` documents, `packages/common/nbstore` Socket.IO maps, REST paths in `@affine/core`.
3. **Do** follow public specs: Yjs, Socket.IO, Engine.IO, GraphQL.
4. Reviewers **reject** PRs that paste EE files, Prisma schema 1:1, or Nest modules “for compatibility”.
5. Field names that appear on the wire (cookie `affine_session`, event `space:push-doc-update`) are **contracts**, not copied implementation.
6. GraphQL stubs for out-of-MVP fields return safe defaults / `null` and log `compat.stub` — they are not EE resolvers.

### Compose

Phase 0 shipped `backend/docker-compose.yml` (postgres + redis + server) and left root `docker-compose.yml` as the EE stack. Phase 5 cutover points root compose at Mosaic (`Dockerfile.from-source`). EE dual-run is `docker-compose.ee.yml`. Additive API-only file: `docker-compose.mosaic.yml`.

### Consequences

- Phase 0 process does not open Postgres or Redis. Compose still runs them so Phase 1 can attach without reshaping infra.
- `/info` is Mosaic-defined JSON. Compose healthchecks only need HTTP 200; the body is documented in `docs/compat.md`.
- Phase 1 implements auth cookies, GraphQL Yoga (`currentUser` / workspaces), Argon2id, and in-memory persistence when Docker/Postgres is unavailable (`MOSAIC_PERSISTENCE=memory` or no `DATABASE_URL`).
- Phase 2 attaches Socket.IO to the Fastify HTTP server (`path /socket.io`). Yjs snapshots + append-only updates live in the store; awareness is in-process rooms (Redis adapter later for multi-instance). Compact is inline after `SYNC_COMPACT_UPDATES`, not a Redis/Bull job, so tests run without Docker.
- Phase 3 stores blobs in a memory object store (tests) or local filesystem (`BLOB_DIR`). Upload URLs are self-issued opaque tokens (client PUT does not send cookies). Compact writes doc history snapshots. S3 remains a later adapter.
- Phase 4 implements workspace invites (no SMTP), Collaborator/Admin roles, invite links, public docs (`publishDoc` + unauthenticated `GET /public-docs`), and comments. GraphQL advertises `ServerFeature.Comment`. Seat limits are Mosaic policy (10000), not AFFiNE Cloud seats. Realtime request/subscribe covers the MIT members/share/comment topics.
- Phase 5 cutover: `MOSAIC_SERVER=1` on the client (`BUILD_CONFIG.isMosaicServer`) and on the server process (`GET /info` feature `mosaic`). Production Dockerfiles copy Mosaic `dist` + MIT static; they do not copy `packages/backend`. Optional `MOSAIC_STATIC_DIR` serves `selfhost.html` / SPA. EE source stays in git; it is gone from the delivery tree.
- Phase 6 product platform: append-only audit + SIEM webhook; workspace/instance security policy; OIDC discovery (injectable `HttpFetcher`) and SAML ACS; query-time indexer; BYOK OpenAI-compatible chat; HMAC webhooks and Jira REST v3. GraphQL advertises `Indexer` always, `OAuth` when OIDC is configured, `Copilot` only when `MOSAIC_AI_API_KEY` is set. Docker is not required — tests use the in-memory store and mocked HTTP.
