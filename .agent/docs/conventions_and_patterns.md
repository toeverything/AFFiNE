# Conventions and Patterns

> **Last Updated:** 2026-02-14

## Code Style & Linting

### TypeScript / JavaScript

| Tool            | Configuration                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ESLint**      | Flat config (`eslint.config.mjs`) with `typescript-eslint`, `react`, `react-hooks`, `sonarjs`, `import-x`, `simple-import-sort`, `unicorn`, `rxjs` |
| **OxLint**      | `oxlint.json` — fast Rust-based linter for basic rules (many ESLint rules disabled in favor of OxLint)                                             |
| **Prettier**    | `.prettierrc` — formatting (runs separately from ESLint)                                                                                           |
| **lint-staged** | Pre-commit via Husky: Prettier + ESLint on staged files                                                                                            |

**Key ESLint Rules:**

- `simple-import-sort/imports` + `simple-import-sort/exports` — enforced import ordering
- `@typescript-eslint/no-floating-promises` — error (async safety)
- `@typescript-eslint/await-thenable` — error
- `@typescript-eslint/prefer-readonly` — error
- `rxjs/finnish` — LiveData/Signal variables must use `$` suffix (Finnish notation)
- `import-x/no-extraneous-dependencies` — enforced per-package

### Rust

| Tool         | Configuration                   |
| ------------ | ------------------------------- |
| **rustfmt**  | `rustfmt.toml` — formatting     |
| **taplo**    | `.taplo.toml` — TOML formatting |
| Rust Edition | 2024                            |

---

## Testing Patterns

### Unit Tests (Frontend + Common)

| Attribute    | Value                                             |
| ------------ | ------------------------------------------------- |
| Framework    | **Vitest**                                        |
| Config       | `vitest.config.ts` (root) + `vitest.workspace.ts` |
| File pattern | `*.spec.ts` / `*.spec.tsx`                        |
| DOM env      | `happy-dom`                                       |
| Mock         | `fake-indexeddb`, `msw`                           |
| Coverage     | Istanbul (`@vitest/coverage-istanbul`)            |
| Plugins      | vanilla-extract, SWC                              |

**Setup files:**

- `scripts/setup/polyfill.ts` — browser polyfills
- `scripts/setup/lit.ts` — Lit element setup for BlockSuite
- `scripts/setup/vi-mock.ts` — global mocks
- `scripts/setup/global.ts` — global setup

### Unit Tests (Backend Server)

| Attribute | Value                                |
| --------- | ------------------------------------ |
| Framework | **Ava** (serial, single-concurrency) |
| Coverage  | c8                                   |
| Pattern   | `src/__tests__/*.spec.ts`            |

### E2E Tests

| Attribute   | Value                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Framework   | **Playwright** (`@playwright/test` v1.52.0)                                                                             |
| Test suites | `tests/affine-cloud`, `tests/affine-local`, `tests/affine-desktop`, `tests/affine-mobile`, `tests/affine-cloud-copilot` |

---

## State Management

### Frontend

- **Jotai** — Primary atom-based state management
- **LiveData** (from `@toeverything/infra`) — Reactive data streams with `$` suffix convention (Finnish notation)
- **Preact Signals** — Used inside infra framework for fine-grained reactivity
- **Yjs** — CRDT-based document state (real-time collaboration)

### Pattern: `@toeverything/infra` Framework

The infra package provides a custom DI (dependency injection) framework:

```typescript
// Module registration pattern
export function configureMyModule(framework: Framework) {
  framework.register(MyService);
  framework.register(MyStore);
}
```

Key abstractions:

- **Framework** — DI container for registering services/stores
- **LiveData** — Reactive observable-like values (subscribed with `$` suffix)
- **ORM** — Simple object-relational mapping layer
- **Op** — Operation system for cross-context communication (main ↔ worker ↔ native)
- **Storage** — Abstracted key-value and blob storage

---

## Backend Architecture Patterns

### NestJS Module Pattern

The server uses a `AppModuleBuilder` pattern for conditional module loading based on "flavors":

```typescript
const factor = new AppModuleBuilder();
factor
  .use(...FunctionalityModules)       // Always loaded
  .use(AuthModule, PermissionModule)  // Always loaded
  .useIf(() => env.flavors.graphql, GqlModule, PaymentModule, ...)
  .useIf(() => env.flavors.sync, SyncModule)
  .useIf(() => env.flavors.doc, DocServiceModule)
  .compile();
```

**Server Flavors:**
| Flavor | Purpose |
| ------ | ------- |
| `graphql` | GraphQL API server |
| `sync` | WebSocket sync server |
| `doc` | Document processing service |
| `renderer` | Server-side doc rendering |
| `front` | Combined frontend-serving mode |
| `script` | CLI/migration scripts |

### Data Access Pattern

- **Prisma** ORM with PostgreSQL
- **Models layer** (`src/models/`) — data access wrappers around Prisma
- **Transactional** — `@nestjs-cls/transactional` with Prisma adapter for request-scoped transactions
- **CLS** (Continuation Local Storage) — request-scoped context via `nestjs-cls`

### Job Queue

- **BullMQ** on Redis for background jobs
- Queue dashboard via `@queuedash/api`

---

## Error Handling

- **Server:** NestJS exception filters + custom `ErrorModule`
- **Frontend:** React Error Boundaries (`react-error-boundary`), Sentry for crash reporting
- **Shared:** `@affine/error` package for typed error definitions

---

## Custom Abstractions

### BlockSuite (Editor)

Built on **Lit** web components:

- **Blocks** — Self-contained content units (paragraph, list, code, image, embed, surface, database)
- **Std** — Standard library providing block lifecycle, selection, clipboard, keyboard handling
- **Store** — Yjs-backed document state management
- **GFX** — Graphics layer for whiteboard/canvas features
- **Widgets** — Floating UI (toolbars, menus, formatting bar)

### NBStore (Notebook Storage)

Multi-backend storage abstraction:

- **Storage layer** — blob, doc, sync storage interfaces
- **Implementations** — IndexedDB (browser), SQLite (desktop/mobile), Cloud (server)
- **Sync** — Bi-directional sync between local and cloud storage
- **Worker** — Web Worker for background sync operations

---

## Build System

| Tool                               | Usage                                          |
| ---------------------------------- | ---------------------------------------------- |
| `affine` CLI (`@affine-tools/cli`) | Custom build/dev orchestrator                  |
| Vite 7                             | Frontend bundling                              |
| SWC                                | TypeScript compilation (via `unplugin-swc`)    |
| vanilla-extract                    | CSS-in-TS with zero-runtime                    |
| Cargo                              | Rust compilation                               |
| NAPI-RS                            | Node.js native addon bindings                  |
| UniFFI                             | Mobile native bindings (iOS/Android from Rust) |

---

## CI/CD

- **GitHub Actions** — `.github/` directory (76 files)
- **Playwright** for E2E testing
- **Codecov** for coverage reporting (`codecov.yml`)
- **Husky** + **lint-staged** for pre-commit hooks
- **commitlint** for conventional commits (`tools/commitlint`)
