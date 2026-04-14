# @affine/web

The browser-based AFFiNE web application (`app.affine.pro`). A pure-browser React SPA that shares `@affine/core` with all other app targets.

## Layout

```
src/
  index.tsx          # Entry point — StrictMode + Telemetry wrapper
  app.tsx            # Root component — Framework setup, StoreManagerClient, routing
  setup.ts           # Bootstrap: initializes browser environment, cleans up old state
  nbstore.worker.ts  # SharedWorker / Worker entry for nbstore operations
```

---

## Entry flow

```
index.tsx
  └── setup.ts            (browser bootstrap — environment init, stale state cleanup)
  └── <App />
        ├── FrameworkRoot  (@toeverything/infra DI container)
        │     ├── configureCommonModules(framework)
        │     └── configureBrowserWorkbenchModule(framework)
        ├── StoreManagerClient  (nbstore in SharedWorker)
        ├── NbstoreProvider
        └── React Router (routes from @affine/core)
```

---

## Key files

### `app.tsx`

Sets up the full DI framework with browser-specific module configuration:

```typescript
configureCommonModules(framework)           // shared services (auth, docs, workspace, etc.)
configureBrowserWorkbenchModule(framework)  // browser workbench (tabs, navigation)
configureLocalStorageStateStorageImpls(framework) // localStorage-backed Memento
```

Wraps the app in `FrameworkRoot` to make all services available via `useService()`.

### `nbstore.worker.ts`

Runs nbstore's `StoreManager` in a `SharedWorker` (falls back to `Worker`). All storage operations (IndexedDB reads/writes, cloud sync) happen off the main thread.

---

## Module configuration

| Module | Browser implementation |
|---|---|
| Workbench | `BrowserWorkbenchModule` (React Router tabs) |
| State storage | `LocalStorageStateStorageModule` |
| Blob | `IndexedDBBlobModule` |
| Doc sync | `BroadcastChannel` + cloud |

---

## Build

```bash
yarn dev          # dev server (from monorepo root)
yarn build        # production bundle via affine bundle CLI
```

Output goes to `dist/`. Served as a static SPA — no SSR.

## Dependencies

- `@affine/core` — all shared app logic (routes, services, components)
- `@affine/component` — design system
- `@affine/nbstore` — storage abstraction
- `@toeverything/infra` — DI framework
- `react@19`, `react-router-dom@6`
