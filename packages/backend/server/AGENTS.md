# @affine/server

NestJS server that powers AFFiNE Cloud and self-hosted deployments. Exposes a GraphQL API, real-time document sync via WebSocket, AI copilot, background job queues, and optional static file serving.

## Layout

```
src/
  index.ts          # Entry: routes to server.ts (HTTP) or cli.ts (script flavor)
  prelude.ts        # Boot sequence: load .env files, init global `env`
  env.ts            # Env class — flavor, namespace, deployment type, platform
  server.ts         # NestFactory bootstrap (Express + Socket.io + Swagger in dev)
  app.module.ts     # AppModuleBuilder — composes modules based on active flavor
  app.controller.ts # Health-check / catch-all HTTP controller
  cli.ts            # Commander-based CLI entry (data migrations, scripts)

  base/             # Infrastructure primitives — imported by every other layer
    cache/          # Redis-backed cache + @MakeCache / @PreventCache decorators
    config/         # Typed config system (defineModuleConfig, ConfigFactory)
    error/          # Error base classes + auto-generated errors.gen.ts
    event/          # In-process EventBus (@OnEvent decorator)
    graphql/        # GQL module (Apollo + pagination helpers)
    guard/          # Auth guards and decorators
    helpers/        # CryptoHelper, URLHelper
    job/            # BullMQ queue abstraction (JobQueue, @OnJob, JobModule)
    logger/         # winston logger (AFFiNELogger)
    metrics/        # OpenTelemetry metrics (@CallMetric)
    mutex/          # Distributed mutex via Redis
    nestjs/         # NestJS utilities (ApplyType, ScannerModule)
    prisma/         # PrismaModule + PrismaTransaction type
    redis/          # RedisModule
    storage/        # StorageProvider abstraction (S3-compat / local)
    throttler/      # Rate limiter (CloudThrottlerGuard, @Throttle, @SkipThrottle)
    websocket/      # Socket.io adapter + WebSocketModule

  models/           # Data-access layer — one class per Prisma entity
    base.ts         # BaseModel: injects `db` (Prisma tx-aware client) and `models`
    index.ts        # ModelsModule (global) + Models proxy class
    *.ts            # Individual model files (user, workspace, doc, session, …)

  core/             # Core business modules — always loaded
    access-token/   # Personal access token management
    auth/           # Session, JWT, magic-link, OAuth callback, AuthGuard
    comment/        # Document comment threads
    config/         # Runtime server configuration (ServerConfigModule)
    doc/            # Doc snapshot storage and retrieval (DocStorageModule)
    doc-renderer/   # Server-side doc HTML rendering
    doc-service/    # Doc CRDT merge / update service
    features/       # Feature flags
    mail/           # Transactional email (React Email templates)
    monitor/        # Internal server health monitoring
    notification/   # User notification system
    permission/     # Workspace and doc ACL
    queue-dashboard/# QueueDash BullMQ UI
    quota/          # Storage and usage quotas
    selfhost/       # Self-hosted-specific API endpoints
    static-files/   # Serves the built frontend SPA (front flavor only)
    storage/        # Blob storage GraphQL API
    sync/           # Yjs CRDT WebSocket sync engine
    telemetry/      # OpenTelemetry tracing, CORS origin injection
    user/           # User CRUD, avatar, settings
    version/        # Server version GraphQL resolver
    workspaces/     # Workspace CRUD, membership, invites

  plugins/          # Optional feature modules — loaded per flavor/env
    calendar/       # Google Calendar integration
    captcha/        # CAPTCHA verification
    copilot/        # AI copilot (LLM dispatch, context, sessions, jobs)
    customerio/     # Customer.io analytics
    gcloud/         # GCP-specific integrations
    indexer/        # Full-text document indexer
    license/        # AFFiNE Pro license management
    oauth/          # OAuth2 provider integrations
    payment/        # Stripe payment and subscription management
    worker/         # Background Piscina worker pool

  data/             # CLI data migrations and seed scripts
    app.ts          # CliAppModule (FunctionalityModules + IndexerModule)
    commands/       # create / run / revert / import-config CLI commands
    migrations/     # Named migration scripts (run via `yarn affine server run`)
    seed/           # Dev seed data

  mails/            # React Email templates (previewed with `yarn dev:mail`)
  middleware/       # Express middleware (server-timing, cache headers)
  __tests__/        # AVA integration tests
```

## Server Flavors

Flavors are set via `SERVER_FLAVOR` env. `allinone` (default) enables everything.

| Flavor | Loads |
|---|---|
| `allinone` | Everything |
| `graphql` | GqlModule + all core/plugin resolvers |
| `sync` | SyncModule + TelemetryModule |
| `renderer` | DocRendererModule |
| `doc` | DocServiceModule + IndexerModule |
| `front` | Renderer + Sync + DocService + StaticFileModule |
| `script` | Only FunctionalityModules — runs CLI data migrations |

The flavor-routing happens in `buildAppModule()` in `app.module.ts` using `AppModuleBuilder.useIf()`.

## Architecture Layers

```
plugins/  ──►  core/  ──►  models/  ──►  base/  ──►  Prisma / Redis / S3
```

- **`base/`** — pure infrastructure; no business logic. Every other layer imports from here.
- **`models/`** — data access only; one class per database entity. Injected as the `Models` proxy. Never put business logic here.
- **`core/`** — always-on business modules. Depend on `models/` and `base/`.
- **`plugins/`** — optional features loaded conditionally. Depend on `core/` and `models/`.

## Models Layer

All model classes extend `BaseModel` (`src/models/base.ts`), which provides:
- `this.db` — the Prisma client (automatically transaction-aware via `nestjs-cls`)
- `this.models` — the `Models` proxy giving cross-model access

Inject `Models` (not individual model classes) into services:

```typescript
@Injectable()
export class MyService {
  constructor(private readonly models: Models) {}

  async example() {
    const user = await this.models.user.findById(userId);
    const workspace = await this.models.workspace.findById(workspaceId);
  }
}
```

## Config System

Use `defineModuleConfig` from `base/config` to declare typed config blocks:

```typescript
// in your module
defineModuleConfig('myFeature', {
  enabled: { default: false, schema: z.boolean() },
  apiKey: { default: '', schema: z.string() },
});

// in a service — inject Config and access via namespace
constructor(private readonly config: Config) {}
const enabled = this.config.get('myFeature').enabled;
```

Config values cascade: built-in defaults → `config.example.json` → DB-stored runtime config.

## Job Queue (BullMQ)

Define jobs with `@OnJob` decorator on a NestJS provider method:

```typescript
@OnJob('my-queue', 'my-job')
async handle(job: Job<MyPayload>) { ... }
```

Enqueue with the injected `JobQueue`:

```typescript
@InjectQueue('my-queue') private queue: JobQueue
await this.queue.add('my-job', payload);
```

## Error Handling

Errors are defined declaratively — `base/error/errors.gen.ts` is auto-generated. Extend `UserFriendlyError` for GraphQL-surfaced errors. Throw these from resolvers and services; the `GlobalExceptionFilter` handles serialisation.

## Testing

Uses **AVA** (not Vitest). Tests live in `src/__tests__/`.

```bash
yarn test                    # all tests, serial, concurrency 1
yarn test:copilot            # AI copilot tests only
yarn test:coverage           # with c8 coverage
yarn e2e                     # E2E mode (TEST_MODE=e2e)
```

Use `@nestjs/testing` + `supertest` for HTTP integration tests and `sinon` for stubs/spies.

## Database & Migrations

- ORM: **Prisma** — schema at `schema.prisma`, client generated on `postinstall`.
- Prisma schema migrations live in `migrations/` (SQL, managed by `prisma migrate`).
- Data migrations (post-deploy scripts) live in `src/data/migrations/` and run via:
  ```bash
  yarn affine server run          # run pending data migrations
  yarn affine server revert <n>   # revert last n data migrations
  yarn data-migration run         # same, direct script shorthand
  ```

## Dev Commands

```bash
yarn dev              # nodemon — hot-reload on src changes
yarn dev:mail         # React Email preview server
yarn seed             # Populate dev DB with seed data
yarn genconfig        # Regenerate config.example.json
yarn init             # prisma migrate dev + data-migration run
```

## Key Environment Variables

| Variable | Default | Effect |
|---|---|---|
| `NODE_ENV` | `production` | `development` enables Swagger, disables shutdown hooks |
| `SERVER_FLAVOR` | `allinone` | Which modules to load (see Flavors table) |
| `AFFINE_ENV` | `production` | Namespace: `dev` \| `beta` \| `production` |
| `DEPLOYMENT_TYPE` | auto | `affine` (cloud) or `selfhosted` |
| `DEPLOYMENT_PLATFORM` | `unknown` | `gcp` enables GCloudModule |
| `AFFINE_SERVER_EXTERNAL_URL` | — | Public-facing base URL (used for CORS, emails, links) |
| `AFFINE_PRIVATE_KEY` | — | RSA private key for JWT signing |
| `DATABASE_URL` | — | Prisma PostgreSQL connection string |
| `REDIS_SERVER_HOST` | — | Redis host for cache, jobs, mutex |
| `DEBUG` | — | `affine:*` for verbose logger output |
