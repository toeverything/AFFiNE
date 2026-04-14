# affine_mobile_native

Rust crate that generates native bindings for iOS (Swift) and Android (Kotlin) via [UniFFI](https://mozilla.github.io/uniffi-rs/). Wraps `affine_nbstore` (the Rust SQLite document storage engine) and exposes it to mobile apps through a type-safe FFI boundary. Also handles mobile-specific concerns: large-blob file caching, Mermaid/Typst preview rendering, and multi-device sync clock tracking.

## Layout

```
src/
  lib.rs             # Crate root — UniFFI exports, public API surface
  error.rs           # UniffiError enum (crosses FFI boundary)
  ffi_types.rs       # Bidirectional conversion: UniFFI records ↔ internal nbstore types
  payload_codec.rs   # SIMD base64 encode/decode (all binary crosses FFI as base64)
  preview.rs         # render_mermaid_preview_svg(), render_typst_preview_svg() [mobile only]
  tests.rs           # Roundtrip + security tests
  cache/
    mod.rs           # MobileBlobCache — LRU filesystem cache for large blobs [mobile only]
    tests.rs
  storage/
    mod.rs           # DocStoragePool (UniFFI Object) — main entry point
    lifecycle.rs     # connect(), disconnect(), push_update(), set_space_id()
    docs.rs          # get/set doc snapshots, updates, clocks
    blobs.rs         # get/set/delete/list blobs + sync tracking per peer
    indexer.rs       # Full-text search: add/delete/search/flush
    peers.rs         # Peer clock tracking for multi-device sync
uniffi-bindgen.rs    # Binary entry point → uniffi::uniffi_bindgen_main()
Cargo.toml
```

---

## UniFFI exports

The following types and functions are exported to Swift/Kotlin by UniFFI:

### `DocStoragePool` (Object / class)

The main entry point. All methods are `async` (backed by a Tokio multi-threaded runtime).

#### Lifecycle (`storage/lifecycle.rs`)

```rust
// Open (or create) the SQLite DB for a workspace. Runs migrations, initialises cache.
async fn connect(universal_id: String, path: String) -> Result<(), UniffiError>

// Close the DB and flush/invalidate caches.
async fn disconnect(universal_id: String) -> Result<(), UniffiError>

// Set the space ID metadata on a workspace.
async fn set_space_id(universal_id: String, space_id: String) -> Result<(), UniffiError>

// Append a Yjs update binary (base64-encoded) to a document.
async fn push_update(universal_id: String, doc_id: String, update: String) -> Result<DocClock, UniffiError>
```

#### Documents (`storage/docs.rs`)

```rust
async fn get_doc_snapshot(universal_id: String, doc_id: String) -> Result<Option<DocRecord>, UniffiError>
async fn set_doc_snapshot(universal_id: String, record: DocRecord) -> Result<bool, UniffiError>
async fn get_doc_updates(universal_id: String, doc_id: String) -> Result<Vec<DocUpdate>, UniffiError>
async fn mark_updates_merged(universal_id: String, doc_id: String, updates: Vec<DocUpdate>) -> Result<u32, UniffiError>
async fn delete_doc(universal_id: String, doc_id: String) -> Result<(), UniffiError>
async fn get_doc_clocks(universal_id: String, after: Option<i64>) -> Result<Vec<DocClock>, UniffiError>
async fn get_doc_clock(universal_id: String, doc_id: String) -> Result<Option<DocClock>, UniffiError>
```

#### Blobs (`storage/blobs.rs`)

```rust
async fn get_blob(universal_id: String, key: String) -> Result<Option<Blob>, UniffiError>
async fn set_blob(universal_id: String, blob: SetBlob) -> Result<(), UniffiError>
async fn delete_blob(universal_id: String, key: String, permanently: bool) -> Result<(), UniffiError>
async fn list_blobs(universal_id: String) -> Result<Vec<ListedBlob>, UniffiError>
async fn release_blobs(universal_id: String) -> Result<(), UniffiError>

// Sync tracking per peer
async fn set_blob_uploaded_at(universal_id: String, peer: String, blob_id: String, uploaded_at: Option<i64>) -> Result<(), UniffiError>
async fn get_blob_uploaded_at(universal_id: String, peer: String, blob_id: String) -> Result<Option<i64>, UniffiError>
```

#### Full-text search (`storage/indexer.rs`)

```rust
async fn fts_add_document(universal_id: String, id: String, title: String, body: String) -> Result<(), UniffiError>
async fn fts_delete_document(universal_id: String, id: String) -> Result<(), UniffiError>
async fn fts_get_document(universal_id: String, id: String) -> Result<Option<String>, UniffiError>
async fn fts_search(universal_id: String, query: String, limit: u32) -> Result<Vec<SearchHit>, UniffiError>
async fn fts_get_matches(universal_id: String, id: String, query: String) -> Result<Vec<MatchRange>, UniffiError>
async fn fts_flush_index(universal_id: String) -> Result<(), UniffiError>
async fn fts_index_version(universal_id: String) -> Result<u32, UniffiError>
```

#### Peer sync clocks (`storage/peers.rs`)

```rust
// Track what this device has pulled from / pushed to each remote peer
async fn get_peer_remote_clocks(universal_id: String, peer: String) -> Result<Vec<DocClock>, UniffiError>
async fn set_peer_remote_clock(universal_id: String, peer: String, clock: DocClock) -> Result<(), UniffiError>
async fn get_peer_pulled_remote_clocks(universal_id: String, peer: String) -> Result<Vec<DocClock>, UniffiError>
async fn set_peer_pulled_remote_clock(universal_id: String, peer: String, clock: DocClock) -> Result<(), UniffiError>
async fn get_peer_pushed_clock(universal_id: String, peer: String, doc_id: String) -> Result<Option<DocClock>, UniffiError>
async fn get_peer_pushed_clocks(universal_id: String, peer: String) -> Result<Vec<DocClock>, UniffiError>
async fn set_peer_pushed_clock(universal_id: String, peer: String, clock: DocClock) -> Result<(), UniffiError>
async fn clear_clocks(universal_id: String) -> Result<(), UniffiError>
```

### Free functions

```rust
// Mint a Hashcash PoW stamp (delegated to affine_common::hashcash)
fn hashcash_mint(resource: String, bits: u32) -> String

// Preview rendering (iOS/Android only)
async fn render_mermaid_preview_svg(code: String, theme: Option<String>, font_family: Option<String>, font_size: Option<f32>) -> Result<String, UniffiError>
async fn render_typst_preview_svg(code: String, font_dirs: Option<Vec<String>>, cache_dir: Option<String>) -> Result<String, UniffiError>
```

---

## FFI record types

All types that cross the FFI boundary. Binary data is always **base64-encoded strings**; timestamps are always **i64 milliseconds since Unix epoch**.

```rust
record DocRecord {
  doc_id: String
  data: String       // base64 Yjs binary (snapshot)
  timestamp: i64     // ms since epoch
}

record DocUpdate {
  doc_id: String
  timestamp: i64
  data: String       // base64 Yjs update binary
}

record DocClock {
  doc_id: String
  timestamp: i64
}

record Blob {
  key: String
  data: String       // base64 OR file-path token (see below)
  mime: String
  created_at: i64
}

record SetBlob {
  key: String
  data: String       // base64 OR file-path token
  mime: String
}

record ListedBlob {
  key: String
  size: i64
  mime: String
  created_at: i64
}

record SearchHit {
  id: String
  score: f32
  matched_terms: Vec<String>
}

record MatchRange {
  start: u32
  end: u32
}
```

### Error type

```rust
enum UniffiError {
  Err(String),
  Base64DecodingError(String),
  TimestampDecodingError,
}
```

---

## Mobile blob cache (`cache/`)

Large blobs (> 1 MB, controlled by `MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES`) are **not** sent across the FFI boundary as base64 — that would cause memory spikes for images and attachments. Instead:

1. `set_blob()` accepts a `SetBlob` whose `data` field is either base64 or a file-path token (`__AFFINE_BLOB_FILE__:/path/…`). It decodes the payload to raw bytes, stores them in SQLite, and returns `Result<(), UniffiError>` — **no token is returned**.
2. `get_blob()` reads raw bytes from SQLite. If the blob is ≥ 1 MB it writes the bytes to a cache file and returns a `Blob` whose `data` field is the file-path token `__AFFINE_BLOB_FILE__:/path/to/cache/<hash>.blob`. Smaller blobs are returned inline as base64.
3. The JS side (`@affine/mobile-shared/nbstore/payload`) receives the `Blob.data` string from `get_blob()` and calls `decodePayload(data, MOBILE_BLOB_FILE_PREFIX)` to transparently handle both token and base64 cases.

Cache directories:
- **Android**: `<app>/cache/nbstore-blob-cache/<workspace_hash>/`
- **iOS**: `<app_container>/Library/Caches/nbstore-blob-cache/<workspace_hash>/`

LRU capacity: 32 entries. Max blob size read back from disk: 64 MB. Path traversal attacks are rejected (only the workspace cache directory is accessible).

---

## Preview rendering (`preview.rs`)

Available on iOS and Android only (guarded by `cfg(target_os = "ios")` / `cfg(target_os = "android")`).

```rust
// Mermaid diagram → SVG string
render_mermaid_preview_svg(code, theme?, font_family?, font_size?)

// Typst document → SVG string (typst packages cached at cache_dir/typst-package-cache/)
render_typst_preview_svg(code, font_dirs?, cache_dir?)
```

---

## Universal ID format

Every workspace/userspace is identified by a `universal_id` string in the format from `@affine/nbstore`:

```
@peer(<peer>);@type(<workspace|userspace>);@id(<id>);
```

The cache module hashes this string to create a safe filesystem directory name.

---

## Build

```bash
# Compile the Rust library
cargo build --release

# Generate Swift bindings (iOS)
cargo run --bin uniffi-bindgen generate src/lib.rs --language swift --out-dir ./bindings/swift

# Generate Kotlin bindings (Android)
cargo run --bin uniffi-bindgen generate src/lib.rs --language kotlin --out-dir ./bindings/kotlin
```

Library outputs:
- `libaffine_mobile_native.dylib` / `.a` (iOS)
- `libaffine_mobile_native.so` / `.a` (Android)

## Run tests

```bash
cargo test -p affine_mobile_native
```

Tests cover: base64 roundtrip, invalid base64 rejection, path traversal prevention.

## Dependencies

- `uniffi` — binding generator (Swift + Kotlin)
- `affine_nbstore` — SQLite document storage engine
- `affine_common` — hashcash, common utilities
- `tokio` — async runtime (multi-threaded)
- `base64-simd` — SIMD-accelerated base64 codec
- `sqlx` — SQLite access (via nbstore)
- `lru` — LRU cache for blob file handles [mobile]
- `mermaid-rs-renderer`, `typst`, `typst-svg` — preview rendering [mobile]
- `objc2`, `objc2-foundation` — iOS file path resolution [iOS/macOS]
