# Mosaic Server

Clean-room backend for Mosaic — implemented from observed wire contracts only, not copied or derived from AFFiNE's EE source (`packages/backend/**`). Licensed under the Mosaic Enterprise Edition (EE) License; see `LICENSE`.

Phase 0 ships an empty HTTP process: structured logs, metrics, and `GET /info` so compose/clients can probe the server.

Phase 5 cutover: production images are this process plus the MIT frontend (`MOSAIC_SERVER=1`). See `docs/cutover.md`.

Phase 6 product platform: audit log, OIDC/SAML, query-time search, BYOK AI, webhooks/Jira. See `docs/compat.md` §9.

## Requirements

- Node.js 22.12+
- Yarn or npm
- Docker (optional): PostgreSQL 16 + Redis 7 via `docker compose`

## Quick start

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Probe:

```bash
curl -sS http://127.0.0.1:3010/info
```

## Scripts

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Watch mode                                          |
| `npm run build`     | Compile to `dist/`                                  |
| `npm start`         | Run compiled process                                |
| `npm test`          | Unit + contract + phase tests (including Phase 5–6) |
| `npm run typecheck` | `tsc --noEmit`                                      |

## Compose

```bash
# All-in-one Mosaic (frontend + server). Docker optional; not used in this environment.
docker compose up --build

# API-only
docker compose -f docker-compose.mosaic.yml up --build
```

## Layout

Hexagonal (ports & adapters). Domain code must not import Fastify, GraphQL, or Socket.IO.

See `docs/adr/0001-stack-and-clean-room.md`, `docs/compat.md`, and `docs/cutover.md`.
