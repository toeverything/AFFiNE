# AFFiNE Helm Chart

Kubernetes deployment for [self-hosted AFFiNE](https://docs.affine.pro/self-host-affine).

Postgres and Redis are **not** included — provide connection settings via `env` (same variables as [`.docker/selfhost/compose.yml`](../../.docker/selfhost/compose.yml)).

## Quick Start

```bash
helm install affine oci://ghcr.io/toeverything/charts/affine \
  --namespace affine --create-namespace \
  --set env.DATABASE_URL="postgresql://affine:secret@pg.example.com:5432/affine" \
  --set env.REDIS_SERVER_HOST="redis.example.com"
```

Or from this repository:

```bash
helm install affine ./charts/affine -f my-values.yaml
```

## Prerequisites

- PostgreSQL 16+ with [pgvector](https://github.com/pgvector/pgvector)
- Redis
- Persistent volume for uploads (`/root/.affine/storage`)

## Configuration

All runtime settings go into a single `env` map — no separate chart keys for database or redis:

```yaml
env:
  DATABASE_URL: postgresql://affine:secret@pg.example.com:5432/affine
  REDIS_SERVER_HOST: redis.example.com
  AFFINE_INDEXER_ENABLED: "false"
  AFFINE_SERVER_EXTERNAL_URL: https://affine.example.com
```

Sensitive values can be stored in a Kubernetes Secret and referenced with `existingSecret` (keys must match `env` names).

Optional `config.json` (see [configuration docs](https://docs.affine.pro/self-host-affine/install/configuration)):

```yaml
config:
  server:
    name: AFFiNE Self Hosted Server
```

## Common Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `image.repository` | `ghcr.io/toeverything/affine` | Container image |
| `image.tag` | `stable` | Image tag |
| `env` | see `values.yaml` | Environment variables |
| `existingSecret` | `""` | Secret with env keys |
| `config` | `{}` | `config.json` content |
| `persistence.enabled` | `true` | PVC for uploads |
| `persistence.size` | `10Gi` | PVC size |
| `migration.enabled` | `true` | Run DB migrations on install/upgrade |
| `service.port` | `3010` | Service port |
| `replicaCount` | `1` | Replicas (use `1` with RWO volume) |
| `service.type` | `ClusterIP` | Kubernetes Service type |
| `resources` | see `values.yaml` | CPU/memory requests and limits |
| `podSecurityContext` / `securityContext` | `{}` | Optional pod/container hardening |
| `nodeSelector` / `tolerations` / `affinity` | `{}` / `[]` / `{}` | Scheduling constraints |

_See `values.yaml` for the complete list of configurable parameters._

## Migration

On every `helm install` and `helm upgrade`, a pre-install/pre-upgrade Job runs `self-host-predeploy.js` to apply database migrations. The release completes only when this Job succeeds.

The hook deletes itself on success. If it fails, inspect the retained pod:

```bash
kubectl logs -n affine -l app.kubernetes.io/component=migration
```

## Verify

```bash
kubectl get pods -n affine
kubectl port-forward -n affine svc/affine 3010:3010
# open http://localhost:3010 and create the first admin account
```

## Upgrade

Bump `version` in `Chart.yaml` before merging chart changes — CI publishes a new release on push to `main` or `canary`. Reusing the same version fails because the GitHub tag `affine-${version}` already exists.

Pushes to `canary` publish prerelease chart versions (`0.1.0-canary.<run>`) so they do not collide with stable releases from `main`.

```bash
helm upgrade affine oci://ghcr.io/toeverything/charts/affine --version 0.1.1 -f my-values.yaml
```

## Uninstall

```bash
helm uninstall affine -n affine
```

PVC is not removed automatically — delete it manually if uploads are no longer needed.
