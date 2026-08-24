# Remote provider E2E

These tests exercise the Elasticsearch-compatible provider over HTTP against a
local OpenSearch instance. Toxiproxy is included so the lease test can inject
provider latency without changing production code.

```bash
docker compose -f packages/backend/server/e2e/remote-provider/compose.yml up -d --wait

DATABASE_URL=postgresql://ds:ds@localhost:55432/affine_rfc6_remote_e2e \
yarn workspace @affine/server prisma migrate deploy
```

Configure `packages/backend/server/config.json` with:

```json
{
  "indexer": {
    "enabled": true,
    "provider": {
      "type": "elasticsearch",
      "endpoint": "http://127.0.0.1:8666"
    }
  }
}
```

Then run:

```bash
DATABASE_URL=postgresql://ds:ds@localhost:55432/affine_rfc6_remote_e2e \
yarn af server e2e src/__tests__/e2e/indexer/remote-provider.spec.ts

docker compose -f packages/backend/server/e2e/remote-provider/compose.yml down -v
```

The suite uses a disposable PostgreSQL database and creates generation-specific
indices. It directly deletes or mutates provider rows only as a fault-injection
fixture; production code still repairs them through the normal reconcile path.
