# Remote provider E2E

These tests exercise the Elasticsearch-compatible provider over HTTP against a
local OpenSearch instance through Toxiproxy.

```bash
docker compose -f packages/backend/server/e2e/remote-provider/compose.yml up -d --wait

DATABASE_URL=postgresql://ds:ds@localhost:55432/affine_remote_provider_e2e \
yarn workspace @affine/server prisma migrate deploy
```

Enable the provider through leaf-key overrides in the disposable database:

```bash
docker compose -f packages/backend/server/e2e/remote-provider/compose.yml \
  exec -T postgres psql -U ds -d affine_remote_provider_e2e <<'SQL'
INSERT INTO app_configs (id, value, updated_at)
VALUES
  ('indexer.enabled', 'true', now()),
  ('indexer.provider.type', '"elasticsearch"', now()),
  ('indexer.provider.endpoint', '"http://127.0.0.1:8666"', now())
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
SQL
```

The E2E app builds a temporary runtime config from the test defaults. Setting
`indexer` only in `packages/backend/server/config.json` does not enable this
suite. Use the leaf keys above; the legacy `indexer.provider` object is not a
native config override and can leave the provider test skipped.

Then run:

```bash
DATABASE_URL=postgresql://ds:ds@localhost:55432/affine_remote_provider_e2e \
yarn af server e2e src/__tests__/e2e/indexer/remote-provider.spec.ts

docker compose -f packages/backend/server/e2e/remote-provider/compose.yml down -v
```

The suite uses a disposable PostgreSQL database and generation-specific indices.
It checks GraphQL aggregation, deletes a workspace through GraphQL, and confirms
that reconciliation removes its physical document and block rows from OpenSearch.
