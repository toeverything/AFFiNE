# AFFiNE

Open-source, local-first workspace (Notion + Miro alternative). Privacy-focused, real-time collaborative, cross-platform (Web, Desktop, iOS, Android).

## Monorepo layout

Yarn 4.x Berry workspaces. All packages use `@affine/` or `@affine-tools/` namespace.
**Every package has its own `AGENTS.md` — read it before working in that area.**

```
packages/
  frontend/
    core/              # @affine/core — 69 modules, all shared app logic (DI services, routes, BlockSuite integration)
    component/         # @affine/component — design system (Vanilla Extract, Radix UI, 30+ components)
    apps/
      web/             # @affine/web — browser SPA (app.affine.pro)
      electron/        # @affine/electron — Electron main process (IPC, SQLite helper, auto-update)
      electron-renderer/ # @affine/electron-renderer — Electron renderer UI (desktop-specific modules)
      ios/             # @affine/ios — Capacitor iOS (native SQLite, auth, haptics, hashcash)
      android/         # @affine/android — Capacitor Android (same as iOS + status bar, AI button)
      mobile/          # @affine/mobile — generic mobile web (Vibration API haptics, mobile routes)
      mobile-shared/   # @affine/mobile-shared — blob payload utilities shared by iOS + Android
    admin/             # @affine/admin — self-hosted admin panel (React Router v7, shadcn-ui, SWR+GraphQL)
    native/            # @affine/native — NAPI-RS Electron addon (audio capture, SQLite, Mermaid/Typst render)
    mobile-native/     # affine_mobile_native — UniFFI Rust crate → Swift/Kotlin bindings
    electron-api/      # @affine/electron-api — typed IPC bridge (window.apis, window.events types)
    i18n/              # @affine/i18n — i18next + react-i18next, 24 locales, codegen from en.json
    routes/            # @affine/routes — declarative route tree → typed FACTORIES/ROUTES codegen
    templates/         # @affine/templates — edgeless templates + stickers (ZIP/SVG → TS codegen)
    track/             # @affine/track — type-safe analytics (hierarchical events, sessions, Sentry)
    media-capture-playground/ # Dev playground for @affine/native audio capture APIs
  backend/
    server/            # @affine/server — NestJS (GraphQL, sync, AI copilot, BullMQ jobs)
    native/            # @affine/server-native — NAPI-RS server addon (LLM, tokenizer, hashcash, image)
  common/
    infra/             # @toeverything/infra — DI framework (Service/Entity/Store/Scope), LiveData, ORM, Op
    nbstore/           # @affine/nbstore — storage abstraction (7 types, 4 backends, sync, worker)
    graphql/           # @affine/graphql — auto-generated GraphQL client (gqlFetcherFactory, typed ops)
    env/               # @affine/env — BUILD_CONFIG, setupGlobal(), environment constants
    error/             # @affine/error — UserFriendlyError, fromAny(), ErrorName union
    debug/             # @affine/debug — DebugLogger, namespace-based, auto-enable via ?debug URL
    native/            # affine_common — pure Rust library (doc_parser, doc_loader, hashcash)
    nbstore/           # (see above)
    reader/            # @affine/reader — Yjs doc → BlockDocumentInfo[], markdown, title/summary
    s3-compat/         # @affine/s3-compat — S3-compatible storage client (AWS4 signing, multipart)
    y-octo/
      core/            # y-octo — Rust Yjs CRDT engine (wire-compatible with Yjs JS)
      utils/           # y-octo-utils — fuzzing, doc_merger CLI, compatibility tests
blocksuite/            # Collaborative editor framework (60+ sub-packages, Lit Web Components)
  playground/
    apps/
      _common/         # Shared playground utilities, mock services, debug menu
      starter/         # Main BlockSuite playground app (dev/E2E harness)
      comment/         # Comment/annotation demo (Yjs RelativePosition anchoring)
tools/
  cli/                 # @affine-tools/cli — Rspack build, dev server, bundle orchestration
tests/                 # E2E (Playwright) + test utilities
docs/                  # Contributing guides, API docs
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19, TypeScript 5.9 |
| Editor | BlockSuite (Lit Web Components — **not React**) |
| State | Jotai (atoms), RxJS (streams), LiveData (reactive services) |
| Styling | Vanilla Extract (`.css.ts`, zero-runtime) + `@toeverything/theme` tokens |
| DI framework | `@toeverything/infra` — Service/Entity/Store/Scope |
| Routing | React Router v6 (web/mobile), React Router v7 (admin) |
| Backend | NestJS, Apollo GraphQL, Prisma (PostgreSQL), BullMQ (Redis), Socket.io |
| Collaboration | Yjs CRDTs. `y-octo` is a wire-compatible Rust implementation |
| Native (desktop) | Rust via NAPI-RS, Electron 39 |
| Native (mobile) | Rust via UniFFI (Swift/Kotlin), Capacitor v7 |
| Build | Rspack + SWC (`@affine-tools/cli`), Vite (admin/blocksuite) |
| Testing | Vitest (unit), Playwright (E2E), AVA (native addon integration) |
| Analytics | `@affine/track` — hierarchical events, pluggable transport, Sentry |
| i18n | `@affine/i18n` — i18next, 24 locales, codegen-typed keys |

---

## Critical architectural concepts

### 1. Local-first
Data lives in IndexedDB (browser) or SQLite (Electron/mobile) first. Cloud sync is optional and additive. Never assume network availability.

### 2. CRDT-based documents
All document state is Yjs. Edits produce Yjs update binaries — not REST mutations. `y-octo` (Rust) is wire-compatible with Yjs (JS). `@affine/nbstore` abstracts the storage layer.

### 3. BlockSuite ≠ React
BlockSuite uses **Lit Web Components**, not React. The boundary is strict:
- AFFiNE integrates BlockSuite via `view-extensions` in `packages/frontend/core/src/blocksuite/`
- Use `createReactComponentFromLit()` from `@affine/component/lit-react` to embed Lit in React
- **Never write React code inside BlockSuite packages**

### 4. DI via `@toeverything/infra`
All frontend services use a custom IoC container — not NestJS DI, not React Context alone.

```typescript
// Registration (in @affine/core module)
framework
  .service(WorkspacesService, [WorkspaceFlavoursService])
  .entity(Workspace, [WorkspaceScope, FeatureFlagService])
  .scope(WorkspaceScope)

// Consumption (in React)
const service = useService(WorkspacesService)
const value = useLiveData(service.list$)
```

Component types: `Service` (singleton), `Entity` (per-scope instance), `Store` (data source), `Scope` (context container).

### 5. Multi-platform, single core
All 6 app targets share `@affine/core` (69 modules). Platform differences are injected via `.impl()`:

```typescript
// Browser
configureBrowserWorkbenchModule(framework)
configureLocalStorageStateStorageImpls(framework)

// Electron
configureDesktopWorkbenchModule(framework)
configureElectronStateStorageImpls(framework)

// Mobile
configureMobileModules(framework)
```

### 6. Reactive state with LiveData

```typescript
// Define in a Service
readonly docs$ = new LiveData<Doc[]>([])
readonly activeDoc$ = LiveData.computed(get => get(this.docs$)[0])

// Consume in React
const docs = useLiveData(docsService.docs$)
```

`LiveData<T>` is a BehaviorSubject wrapper. Use `effect()` for RxJS-based async side effects.

### 7. Storage abstraction layers

```
@affine/nbstore
  SpaceStorage (aggregator)
    ├── DocStorage     ← Yjs CRDT snapshots + updates
    ├── BlobStorage    ← binary attachments
    ├── AwarenessStorage ← real-time presence
    ├── IndexerStorage ← full-text search
    └── *SyncStorage   ← peer clock bookkeeping

Implementations: idb (browser), sqlite (Electron/mobile), cloud (HTTP+WS), broadcast-channel (IPC)
```

### 8. IPC in Electron

```
Renderer → window.apis.* (preload contextBridge)
         → ipcRenderer.invoke / MessagePort (async-call-rpc)
         → Main process handlers / Helper process (SQLite)
```

Types live in `@affine/electron-api`. The `DesktopApiService` in `@affine/core` wraps this for DI access.

### 9. Mobile native bridge

- **iOS/Android**: Capacitor v7 plugins call `affine_mobile_native` (Rust → UniFFI → Swift/Kotlin)
- **Token pattern for large blobs**: blobs >1MB are stored as files; JS receives `__AFFINE_BLOB_FILE__:/path` tokens decoded by `@affine/mobile-shared`
- **Auth**: custom `fetch`/`XHR` proxy injects auth tokens from IndexedDB into all requests

---

## Package-level AGENTS.md index

| Package | AGENTS.md |
|---|---|
| `@affine/core` | `packages/frontend/core/AGENTS.md` |
| `@affine/component` | `packages/frontend/component/AGENTS.md` |
| `@affine/web` | `packages/frontend/apps/web/AGENTS.md` |
| `@affine/electron` | `packages/frontend/apps/electron/AGENTS.md` |
| `@affine/electron-renderer` | `packages/frontend/apps/electron-renderer/AGENTS.md` |
| `@affine/ios` | `packages/frontend/apps/ios/AGENTS.md` |
| `@affine/android` | `packages/frontend/apps/android/AGENTS.md` |
| `@affine/mobile` | `packages/frontend/apps/mobile/AGENTS.md` |
| `@affine/mobile-shared` | `packages/frontend/apps/mobile-shared/AGENTS.md` |
| `@affine/admin` | `packages/frontend/admin/AGENTS.md` |
| `@affine/native` | `packages/frontend/native/AGENTS.md` |
| `affine_mobile_native` | `packages/frontend/mobile-native/AGENTS.md` |
| `@affine/electron-api` | `packages/frontend/electron-api/AGENTS.md` |
| `@affine/i18n` | `packages/frontend/i18n/AGENTS.md` |
| `@affine/routes` | `packages/frontend/routes/AGENTS.md` |
| `@affine/templates` | `packages/frontend/templates/AGENTS.md` |
| `@affine/track` | `packages/frontend/track/AGENTS.md` |
| `@affine/server` | `packages/backend/server/AGENTS.md` |
| `@affine/server-native` | `packages/backend/native/AGENTS.md` |
| `@toeverything/infra` | `packages/common/infra/AGENTS.md` |
| `@affine/nbstore` | `packages/common/nbstore/AGENTS.md` |
| `@affine/graphql` | `packages/common/graphql/AGENTS.md` |
| `@affine/env` | `packages/common/env/AGENTS.md` |
| `@affine/error` | `packages/common/error/AGENTS.md` |
| `@affine/debug` | `packages/common/debug/AGENTS.md` |
| `affine_common` (Rust) | `packages/common/native/AGENTS.md` |
| `@affine/reader` | `packages/common/reader/AGENTS.md` |
| `@affine/s3-compat` | `packages/common/s3-compat/AGENTS.md` |
| `y-octo` | `packages/common/y-octo/AGENTS.md` |
| `@affine-tools/cli` | `tools/cli/AGENTS.md` |
---

## Dev commands

```bash
# Setup
yarn install                  # install all workspace deps
yarn affine init              # generate Prisma client, GraphQL types, i18n types

# Development
yarn dev                      # web dev server
yarn dev:electron             # Electron dev (main + renderer)

# Building
yarn build                    # production web build
yarn build:electron           # production Electron build

# Testing
yarn test                     # Vitest unit tests
yarn test:e2e                 # Playwright E2E tests
yarn lint                     # ESLint + oxlint + Prettier check

# i18n
cd packages/frontend/i18n
yarn build                    # sync errors + codegen types + completeness

# Native (Rust)
cargo test -p y-octo --all-features
cargo test -p affine_common --all-features
cargo bench -p y-octo
```

---

## Conventions

| Concern | Convention |
|---|---|
| Language | TypeScript strict mode. Rust for native perf-critical code |
| Styling | Vanilla Extract `.css.ts` files (frontend). Tailwind CSS only in `@affine/admin` |
| State | Jotai atoms for local React state. `LiveData` + RxJS for service-layer streams |
| Services | Always extend `Service`, push subscriptions to `this.disposables` to prevent leaks |
| Platform code | Use `.impl(AbstractClass, ConcreteImpl)` in DI — avoid `if (isElectron)` in business logic |
| Linting | ESLint 9 (flat config) + oxlint + Prettier. Run `yarn lint` before committing |
| Testing | Vitest (unit/integration). Playwright (E2E). Tests live alongside source or in `tests/` |
| Commits | Husky pre-commit hooks enforce lint + format |
| Translation | Add keys to `packages/frontend/i18n/src/resources/en.json` → run `yarn build` |
| Routes | Add to `packages/frontend/routes/routes.json` → run `yarn build` |
| Admin styling | Tailwind + shadcn-ui (admin is isolated from the main app's Vanilla Extract system) |
