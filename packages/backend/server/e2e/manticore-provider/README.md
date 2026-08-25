# Manticore Search provider E2E

This fixture validates the shared immutable projection contract against a real
Manticore Search RT table. Aggregate queries remain unsupported and are validated
through the typed fallback boundary instead.

Start the external dependency:

```bash
docker compose -f packages/backend/server/e2e/manticore-provider/compose.yml up -d --wait
```

Use a disposable PostgreSQL database and run the provider-gated E2E:

```bash
DATABASE_URL=postgresql://ds:ds@localhost:55433/affine_rfc6_manticore_e2e \
yarn workspace @affine/server prisma migrate deploy
```

Configure `packages/backend/server/config.json` with:

```json
{
  "indexer": {
    "enabled": true,
    "provider": {
      "type": "manticoresearch",
      "endpoint": "http://127.0.0.1:9308"
    }
  }
}
```

Then run:

```bash
DATABASE_URL=postgresql://ds:ds@localhost:55433/affine_rfc6_manticore_e2e \
yarn af server e2e src/__tests__/e2e/indexer/manticore-provider.spec.ts
```

Stop only this disposable dependency when finished:

```bash
docker compose -f packages/backend/server/e2e/manticore-provider/compose.yml down -v
```
