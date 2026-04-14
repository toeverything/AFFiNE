# @toeverything/infra

The core infrastructure package for AFFiNE's frontend. Every service, store, and entity in `@affine/core` is built on top of this package.

## What's inside

| Subdirectory | Purpose | Deep-dive |
|---|---|---|
| `src/framework/` | Dependency injection container — `Framework`, `Service`, `Store`, `Entity`, `Scope`, events | [framework/CLAUDE.md](src/framework/CLAUDE.md) |
| `src/livedata/` | `LiveData<T>` reactive primitive, `useLiveData` hook, `effect()`, RxJS operators | [livedata/CLAUDE.md](src/livedata/CLAUDE.md) |
| `src/orm/` | Yjs-backed typed ORM (`createORMClient`, `f`, `t`, `YjsDBAdapter`) | [orm/CLAUDE.md](src/orm/CLAUDE.md) |
| `src/op/` | RPC layer for Worker / SharedWorker / BroadcastChannel (`OpClient`, `OpConsumer`) | [op/CLAUDE.md](src/op/CLAUDE.md) |
| `src/storage/` | `Memento` key-value storage interface + `MemoryMemento` + `wrapMemento` | [storage/CLAUDE.md](src/storage/CLAUDE.md) |
| `src/atom/` | Jotai root store access (`getCurrentStore`) | [atom/CLAUDE.md](src/atom/CLAUDE.md) |
| `src/media/` | Media query type helpers | [media/CLAUDE.md](src/media/CLAUDE.md) |
| `src/utils/` | Shared utilities: async-lock, async-queue, object-pool, yjs-observable, etc. | [utils/CLAUDE.md](src/utils/CLAUDE.md) |

## Export paths

```
@toeverything/infra          → src/index.ts  (re-exports everything below)
@toeverything/infra/op       → src/op/index.ts
@toeverything/infra/storage  → src/storage/index.ts
@toeverything/infra/atom     → src/atom/index.ts
@toeverything/infra/utils    → src/utils/index.ts
@toeverything/infra/app-config-storage → src/app-config-storage.ts
```

## Mental model

```
Framework (registry)
  └── FrameworkProvider (runtime resolver)
        ├── Service / Store  — singletons, cached per provider
        ├── Entity           — fresh instance per createEntity() call
        └── Scope            — child provider with its own cache

LiveData<T>  — BehaviorSubject wrapper; emits on subscribe; lazy upstream
effect()     — callable RxJS pipeline; used for async side-effects in Services
Memento      — sync KV store with observable watch; platform impl injected via DI
ORM          — typed CRUD over Yjs docs, reactive queries
Op           — typed RPC over Worker/SharedWorker/BroadcastChannel
```

## Typical usage in @affine/core

```typescript
// 1. Define a service
export class AuthService extends Service {
  readonly session$ = new LiveData<Session | null>(null);

  constructor(private readonly store: UserStore) { super(); }
}

// 2. Register in the framework
framework.service(AuthService, [UserStore]);

// 3. Use in React
const authService = useService(AuthService);
const session = useLiveData(authService.session$);
```

## Testing

```bash
yarn vitest packages/common/infra
```

Use `MemoryMemento` for storage, `Framework.EMPTY` for minimal DI containers, and `createIdentifier` + `vi.fn()` for mocking.
