# @affine/native

NAPI-RS Rust addon for the AFFiNE Electron desktop app. Compiled to a `.node` binary, providing native-performance APIs for: audio/video capture, document storage (SQLite), full-text search, Mermaid/Typst rendering, and hashcash proof-of-work. Consumed exclusively by `@affine/electron` and `@affine/electron-renderer`.

## Layout

```
src/
  lib.rs              # Crate root — pub use of all module exports
  hashcash.rs         # mintChallengeResponse(), verifyChallengeResponse()
  preview.rs          # renderMermaidSvg(), renderTypstSvg()
media_capture/        # Audio capture & recording (macOS + Windows)
  src/
    lib.rs
    audio_callback.rs # JS callback vs. channel abstraction
    audio_decoder.rs  # Decode MP3/WAV/FLAC etc. + resample
    recording.rs      # Recording pipeline (Opus → .ogg)
    macos/            # CoreAudio + ScreenCaptureKit (objc2)
    windows/          # WASAPI + WDCI + cpal
nbstore/              # SQLite document storage pool (v2 schema)
  src/
    lib.rs            # DocStoragePool + DocStorage NAPI classes
    pool.rs           # Connection pool (multi-workspace)
    storage.rs        # SQLx async wrapper
    doc.rs            # Snapshot + update operations
    doc_sync.rs       # Peer sync clock state
    blob.rs           # Binary blob CRUD
    blob_sync.rs      # Blob upload state per peer
    indexer.rs        # Full-text search + doc crawling
    indexer_sync.rs   # Indexer progress tracking
    error.rs
schema/               # DB schema + migration + validation logic
sqlite_v1/            # Legacy SQLite v1 reader (for import/migration)
  src/lib.rs          # SqliteConnection (v1 format only)
__tests__/            # AVA integration tests (TypeScript)
  db.spec.mts
  pool.spec.mts
index.d.ts            # Auto-generated TypeScript declarations (source of truth)
index.js              # NAPI loader (picks correct .node binary by platform)
build.rs              # NAPI build script
Cargo.toml
package.json
```

---

## API reference (`index.d.ts`)

### Media capture (macOS + Windows only)

```typescript
// List all running capturable applications
ShareableContent.applications(): Promise<Application[]>

// Tap into a specific application's audio stream
ShareableContent.tapAudio(
  processId: number,
  callback: (samples: Float32Array) => void
): Promise<AudioCaptureSession>

// Tap into global system audio (excluding specified processes)
ShareableContent.tapGlobalAudio(
  excludedProcessIds: Array<number>,
  callback: (samples: Float32Array) => void
): Promise<AudioCaptureSession>

class AudioCaptureSession {
  stop(): Promise<void>
}

// Audio recording (Opus codec → .ogg file)
startRecording(options: RecordingStartOptions): Promise<RecordingSessionMeta>
stopRecording(sessionId: string): Promise<RecordingArtifact>
abortRecording(sessionId: string): Promise<void>

// Audio decoding (MP3, WAV, FLAC, OGG, AAC, etc.)
decodeAudio(
  buffer: Buffer,
  destSampleRate?: number,
  filename?: string,
  signal?: AbortSignal
): Promise<Float32Array>

decodeAudioSync(
  buffer: Buffer,
  destSampleRate?: number,
  filename?: string
): Float32Array
```

```typescript
type RecordingStartOptions = {
  sessionId?: string        // auto-generated if omitted
  outputDir: string
  processId: number         // -1 for global system audio
  sampleRate?: number
}

type RecordingSessionMeta = { sessionId: string; startedAt: Date }

type RecordingArtifact = {
  sessionId: string
  path: string              // path to .ogg file
  duration: number          // seconds
  sampleRate: number
}
```

---

### Document storage — `DocStoragePool`

Connection-pooled multi-workspace SQLite storage (v2 schema). All methods are async.

```typescript
class DocStoragePool {
  // Lifecycle
  connect(universalId: string, path: string): Promise<void>
  disconnect(universalId: string): Promise<void>
  setSpaceId(universalId: string, spaceId: string): Promise<void>

  // Documents
  pushUpdate(universalId: string, docId: string, update: Uint8Array): Promise<DocClock>
  getDocSnapshot(universalId: string, docId: string): Promise<DocRecord | null>
  setDocSnapshot(universalId: string, snapshot: DocRecord): Promise<boolean>
  getDocUpdates(universalId: string, docId: string): Promise<Array<DocUpdate>>
  markUpdatesMerged(universalId: string, docId: string, updates: Array<DocUpdate>): Promise<number>
  deleteDoc(universalId: string, docId: string): Promise<void>
  getDocClocks(universalId: string, after?: Date): Promise<Array<DocClock>>
  getDocClock(universalId: string, docId: string): Promise<DocClock | null>

  // Blobs
  getBlob(universalId: string, key: string): Promise<Blob | null>
  setBlob(universalId: string, blob: SetBlob): Promise<void>
  deleteBlob(universalId: string, key: string, permanently: boolean): Promise<void>
  listBlobs(universalId: string): Promise<Array<ListedBlob>>
  releaseBlobs(universalId: string): Promise<void>

  // Peer sync clocks
  getPeerRemoteClocks(universalId: string, peer: string): Promise<Array<DocClock>>
  getPeerRemoteClock(universalId: string, peer: string, docId: string): Promise<DocClock | null>
  setPeerRemoteClock(universalId: string, peer: string, clock: DocClock): Promise<void>
  getPeerPulledRemoteClocks(universalId: string, peer: string): Promise<Array<DocClock>>
  getPeerPulledRemoteClock(universalId: string, peer: string, docId: string): Promise<DocClock | null>
  setPeerPulledRemoteClock(universalId: string, peer: string, clock: DocClock): Promise<void>
  getPeerPushedClock(universalId: string, peer: string, docId: string): Promise<DocClock | null>
  getPeerPushedClocks(universalId: string, peer: string): Promise<Array<DocClock>>
  setPeerPushedClock(universalId: string, peer: string, clock: DocClock): Promise<void>
  clearClocks(universalId: string): Promise<void>

  // Blob sync state
  getBlobUploadedAt(universalId: string, peer: string, blobId: string): Promise<Date | null>
  setBlobUploadedAt(universalId: string, peer: string, blobId: string, uploadedAt: Date | null): Promise<void>

  // Full-text search
  ftsAddDocument(universalId: string, id: string, title: string, body: string): Promise<void>
  ftsDeleteDocument(universalId: string, id: string): Promise<void>
  ftsGetDocument(universalId: string, id: string): Promise<string | null>
  ftsSearch(universalId: string, query: string, limit: number): Promise<Array<NativeSearchHit>>
  ftsGetMatches(universalId: string, id: string, query: string): Promise<Array<NativeMatch>>
  ftsFlushIndex(universalId: string): Promise<void>
  ftsIndexVersion(universalId: string): Promise<number>

  // Indexer sync tracking
  getDocIndexedClock(universalId: string, docId: string): Promise<DocIndexedClock | null>
  setDocIndexedClock(universalId: string, clock: DocIndexedClock): Promise<void>
  clearDocIndexedClock(universalId: string, docId: string): Promise<void>

  // Doc crawl (for indexer — returns block structure + title + summary)
  crawlDocData(universalId: string, docId: string): Promise<NativeCrawlResult | null>
}
```

---

### Document storage — `DocStorage`

Single-database instance (used for validation and import).

```typescript
class DocStorage {
  constructor(path: string)
  validate(): Promise<void>
  setSpaceId(spaceId: string): Promise<void>
  vacuumInto(destPath: string): Promise<void>
  // + all blob/doc/peer/fts methods (same as DocStoragePool but without universalId)
}
```

---

### SQLite v1 — `SqliteConnection` (legacy import)

Reads AFFiNE's old v1 database format. Used during migration from v1 to v2.

```typescript
class SqliteConnection {
  constructor(path: string)
  static validate(path: string): Promise<ValidationResult>  // 'MissingTable' | 'MissingDocId' | 'Valid'

  // Doc operations (v1 schema)
  getUpdates(docId: string): Promise<Array<UpdateRow>>
  getAllUpdates(): Promise<Array<UpdateRow>>
  applyUpdate(docId: string, update: Uint8Array): Promise<void>
  replaceUpdates(docId: string, updates: Array<UpdateRow>): Promise<void>

  // Blob operations (v1 schema)
  getBlob(key: string): Promise<Uint8Array | null>
  setBlob(key: string, data: Uint8Array): Promise<void>
  deleteBlob(key: string): Promise<void>
  listBlobs(): Promise<Array<string>>

  // Maintenance
  getDocTimestamps(after?: Date): Promise<Record<string, number>>
  checkpoint(): Promise<void>
  vacuumInto(destPath: string): Promise<void>
  migrateAddDocId(): Promise<void>
  close(): Promise<void>
}
```

---

### Rendering

```typescript
// Mermaid diagram → SVG string
renderMermaidSvg(request: {
  code: string
  theme?: 'light' | 'dark'
  fontFamily?: string
  fontSize?: number
}): Promise<string>

// Typst markup → SVG string
renderTypstSvg(request: {
  code: string
  fontDirs?: string[]
  cacheDir?: string    // typst package cache stored at cacheDir/typst-package-cache/
}): Promise<string>
```

---

### Hashcash

```typescript
// Mint a proof-of-work stamp (CPU-intensive, runs on thread pool)
mintChallengeResponse(resource: string, bits?: number): Promise<string>

// Verify a stamp
verifyChallengeResponse(response: string, bits: number, resource: string): Promise<boolean>
```

---

## Key data types

```typescript
type DocRecord  = { docId: string; bin: Uint8Array; timestamp: Date }
type DocUpdate  = { docId: string; bin: Uint8Array; timestamp: Date }
type DocClock   = { docId: string; timestamp: Date }
type DocIndexedClock = { docId: string; timestamp: Date }

type Blob       = { key: string; data: Uint8Array; mime: string; createdAt?: Date }
type SetBlob    = { key: string; data: Uint8Array; mime: string }
type ListedBlob = { key: string; size: number; mime: string; createdAt?: Date }

type NativeSearchHit = { id: string; score: number; matchedTerms: string[] }
type NativeMatch     = { start: number; end: number }

type NativeCrawlResult = { blocks: NativeBlockInfo[]; title: string; summary: string }
type NativeBlockInfo   = {
  blockId: string; flavour: string
  content?: string[]; blob?: string[]
  refDocId?: string[]; refInfo?: string[]
  parentFlavour?: string; parentBlockId?: string
  additional?: string
}
```

---

## Platform targets

| Platform | Architecture |
|---|---|
| macOS | x86_64, aarch64 (Apple Silicon) |
| Linux | x86_64, aarch64 |
| Windows | x86_64, aarch64 |

Pre-built `.node` binaries for each target are committed to the repo and selected at runtime by `index.js`.

---

## vs. `@affine/server-native` (backend)

| Feature | `@affine/native` (frontend) | `@affine/server-native` (backend) |
|---|---|---|
| Audio capture | ✓ (ScreenCaptureKit/WASAPI) | — |
| Audio decode | ✓ (symphonia + rubato) | — |
| Doc rendering | ✓ (Mermaid, Typst) | — |
| SQLite storage | ✓ (v1 + v2 schema) | — |
| LLM dispatch | — | ✓ |
| Tokenizer | — | ✓ |
| Image/PDF/Office | — | ✓ |
| Hashcash | ✓ | ✓ |
| File type detection | — | ✓ |

---

## Build & test

```bash
yarn build          # release build → .node binary
yarn build:debug    # debug build
yarn artifacts      # copy pre-built binaries from CI
yarn test           # AVA integration tests
```

Tests in `__tests__/` cover `SqliteConnection.validate()` and `DocStoragePool` batch read/write roundtrips.
