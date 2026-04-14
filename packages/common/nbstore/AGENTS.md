# @affine/nbstore

Storage abstraction layer for AFFiNE. Defines interfaces for all storage backends (IndexedDB, SQLite, Cloud, BroadcastChannel), sync orchestration, and the worker-threading model.

## What's inside

| Subdirectory | Purpose | Deep-dive |
|---|---|---|
| `src/connection/` | Connection lifecycle — `AutoReconnectConnection`, `share()` | [connection/CLAUDE.md](src/connection/CLAUDE.md) |
| `src/storage/` | Core storage interfaces — 7 types + `SpaceStorage` aggregator + indexer schema | [storage/CLAUDE.md](src/storage/CLAUDE.md) |
| `src/frontend/` | User-facing API — `DocFrontend`, `BlobFrontend`, `IndexerFrontend`, `AwarenessFrontend` | [frontend/CLAUDE.md](src/frontend/CLAUDE.md) |
| `src/sync/` | Sync orchestration — `Sync`, `DocSyncImpl`, `BlobSyncImpl`, peer-based sync | [sync/CLAUDE.md](src/sync/CLAUDE.md) |
| `src/worker/` | Worker thread management — `StoreManagerClient`, `StoreClient`, op definitions |  |
| `src/utils/` | `universalId()`, `parseUniversalId()` — compound storage keys |  |
| `src/telemetry/` | Telemetry type definitions |  |
| `impls/` | Concrete implementations: `idb/`, `sqlite/`, `cloud/`, `broadcast-channel/` |  |

## Export paths

```
@affine/nbstore           → src/index.ts
@affine/nbstore/worker    → src/worker/client.ts
@affine/nbstore/sync      → src/sync/index.ts
@affine/nbstore/idb       → impls/idb/index.ts
@affine/nbstore/sqlite    → impls/sqlite/index.ts
@affine/nbstore/cloud     → impls/cloud/index.ts
@affine/nbstore/broadcast-channel → impls/broadcast-channel/index.ts
```

## Mental model

```
SpaceStorage (aggregator)
  ├── DocStorage         ← CRDT doc read/write + subscriptions
  ├── BlobStorage        ← binary blob CRUD
  ├── AwarenessStorage   ← real-time cursor/presence
  ├── IndexerStorage     ← full-text / semantic search
  ├── DocSyncStorage     ← peer clock bookkeeping
  ├── BlobSyncStorage    ← blob upload state
  └── IndexerSyncStorage ← indexer progress tracking

Frontend (user-facing)          Sync (background)
  DocFrontend             →  DocSync → DocSyncPeer(remote DocStorage)
  BlobFrontend            →  BlobSync → BlobSyncPeer(remote BlobStorage)
  IndexerFrontend         →  IndexerSync → IndexerSyncImpl
  AwarenessFrontend       →  AwarenessSyncImpl

Worker: StoreManagerClient → StoreClient (runs above in a Worker thread)
```

## Universal ID format

Storage instances are identified by a compound string key:

```typescript
import { universalId, parseUniversalId } from '@affine/nbstore'

const id = universalId({ peer: 'local', type: 'workspace', id: 'ws-abc' })
// "@peer(local);@type(workspace);@id(ws-abc);"

const { peer, type, id: spaceId } = parseUniversalId(id)
```

`type` is `'workspace' | 'userspace'`.

## Implementations

| Impl | Storage types | Platform |
|---|---|---|
| `idb` | doc, blob, docSync, blobSync, indexer, indexerSync | Browser (IndexedDB) |
| `sqlite` | doc, blob, docSync, blobSync, indexer, indexerSync | Electron (SQLite via NAPI) |
| `cloud` | doc, blob | All (HTTP + WebSocket to server) |
| `broadcast-channel` | awareness | All (cross-tab IPC) |

## Typical usage pattern

```typescript
import { SpaceStorage } from '@affine/nbstore'
import { IndexedDBDocStorage, IndexedDBBlobStorage } from '@affine/nbstore/idb'
import { CloudDocStorage } from '@affine/nbstore/cloud'
import { DocFrontend, BlobFrontend } from '@affine/nbstore'
import { Sync } from '@affine/nbstore/sync'

// 1. Create local storage
const local = new SpaceStorage({
  doc: new IndexedDBDocStorage({ id: 'ws-abc' }),
  blob: new IndexedDBBlobStorage({ id: 'ws-abc' }),
})

// 2. Create remote storage (for sync)
const remote = new SpaceStorage({
  doc: new CloudDocStorage({ id: 'ws-abc' }),
})

// 3. Sync
const sync = new Sync({ local, peers: [remote] })
sync.start()

// 4. Connect user-facing frontends
const docFrontend = new DocFrontend(local.get('doc'), sync.doc)
docFrontend.start()
docFrontend.connectDoc(ydoc) // ydoc is a Y.Doc
```

## Testing

Use `DummyDocStorage`, `DummyBlobStorage` etc. from `src/storage/dummy/` for unit tests.

```bash
yarn vitest packages/common/nbstore
```
