# Phase 5 — Cutover

Mosaic Server (`backend/`, `@mosaic/server`) is the production process. AFFiNE EE under `packages/backend` stays in git so the yarn workspace still resolves, but it is **not** copied into runtime images.

## Feature flag `MOSAIC_SERVER=1`

| Where                                          | Effect                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client image / `yarn affine @affine/web build` | `BUILD_CONFIG.isMosaicServer`. Same-origin server list, `env:isSelfHosted`, assets from `/` (not the AFFiNE CDN). Does **not** enable Payment / Copilot. |
| Server process                                 | Adds `mosaic` to `GET /info` `features`.                                                                                                                 |

The all-in-one Dockerfile sets both: build-arg/env for the frontend stage, `ENV MOSAIC_SERVER=1` in the runtime.

Local API-only (no static UI):

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## Compose

| File                        | Role                                                    |
| --------------------------- | ------------------------------------------------------- |
| `docker-compose.yml`        | Production Mosaic all-in-one (`Dockerfile.from-source`) |
| `docker-compose-dev.yml`    | Same image, always built from source                    |
| `docker-compose.mosaic.yml` | API-only (`backend/docker-compose.yml`)                 |
| `docker-compose.ee.yml`     | Dual-run: last EE GHCR image + `self-host-predeploy.js` |

Mosaic applies SQL migrations on Postgres connect. There is no `self-host-predeploy.js` job.

This environment does not run Docker. Verify with `cd backend && npm test && npm run typecheck && npm run build`.

## Images (no EE)

| File                                 | Contents                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `Dockerfile.from-source`             | MIT web/admin/mobile + Mosaic `dist`. Asserts `/app/packages/backend` is absent. |
| `Dockerfile`                         | Mosaic API only (repo-root context `backend/`)                                   |
| `backend/Dockerfile`                 | Same API image, context `backend/`                                               |
| `.github/deployment/node/Dockerfile` | CI assembly of `backend/dist` + frontend `dist`                                  |

`CMD` is `node dist/main.js`. Static files: `MOSAIC_STATIC_DIR=/app/static` (prefers `selfhost.html`).

## Dual-run

Point one browser at Mosaic (`MOSAIC_SERVER=1` client + Mosaic compose) and keep `docker-compose.ee.yml` on another port if you still need the EE process. Switch by URL, not by mixing images.
