# y-octo

High-performance, thread-safe Rust implementation of the Yjs CRDT protocol. Wire-compatible with Yjs (JavaScript) and yrs (Rust). Used by AFFiNE as the underlying CRDT engine for collaborative document editing.

## What's inside

| Crate | Purpose | Deep-dive |
|---|---|---|
| `core/` | `y-octo` — the CRDT library: Doc, Text, Array, Map, XML types, codec, sync protocol | [core/CLAUDE.md](core/CLAUDE.md) |
| `utils/` | `y-octo-utils` — test utilities, fuzzing framework, `doc_merger` binary, benchmarks | [utils/CLAUDE.md](utils/CLAUDE.md) |

## Mental model

```
Doc  (thread-safe, Arc<RwLock<DocStore>>)
  ├── Text   (insert/remove/delta, attributes)
  ├── Array  (insert/push/remove/iter)
  ├── Map    (insert/get/remove/iter)
  └── XML*   (XMLElement, XMLFragment, XMLText — partial)

StateVector   = { clientId → clock }   (causally consistent state tracker)
Update        = encoded set of CRDT operations
DeleteSet     = tombstones for deleted items

SyncMessage
  ├── Doc(DocMessage)        ← state sync, update exchange
  ├── Awareness(States)      ← presence/cursor data
  ├── Auth(token?)           ← permission control
  └── AwarenessQuery         ← request peer state
```

## Yjs compatibility

y-octo is **binary-compatible** with the Yjs v1 update format and sync protocol. A document encoded by y-octo can be decoded by Yjs in the browser, and vice versa. Tested against both `yjs` (JS) and `yrs` (Rust).

## Workspace

These crates are part of the Cargo workspace rooted at `packages/common/y-octo/`. They are consumed by NAPI addons in `packages/frontend/native/` and `packages/backend/native/` as Cargo dependencies.

## Run tests

```bash
cargo test -p y-octo --all-features
cargo test -p y-octo-utils --all-features
```

## Run benchmarks

```bash
cargo bench -p y-octo
cargo bench -p y-octo-utils
```
