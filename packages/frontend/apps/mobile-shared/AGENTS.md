# @affine/mobile-shared

Shared utilities and constants for the iOS and Android Capacitor apps. Handles blob payload encoding/decoding and platform-specific file path validation.

## Layout

```
src/
  index.ts              # Main exports
  nbstore/
    payload.ts          # Blob payload utilities for mobile native storage
```

## Export paths

```
@affine/mobile-shared              → src/index.ts
@affine/mobile-shared/nbstore/payload → src/nbstore/payload.ts
```

---

## `nbstore/payload.ts`

Mobile native storage passes large blobs between the native layer (Swift/Kotlin) and JavaScript as either:
1. **Inline base64** — for small blobs (≤ 1 MB)
2. **File tokens** — for large blobs, a path reference to a temp file in the OS cache directory

### Constants

```typescript
// Prefix used to identify file-token payloads vs inline base64
const MOBILE_BLOB_FILE_PREFIX = '__AFFINE_BLOB_FILE__:'

// Blobs larger than this are written to a temp file; smaller ones are inlined as base64
const MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES = 1024 * 1024  // 1 MB
```

### `decodePayload(data: string, prefix: string, options?: DecodePayloadOptions): Promise<Uint8Array>`

Decodes a blob payload string received from the native layer. Returns a `Promise` that resolves to a `Uint8Array`.

- If `data` starts with `prefix` → the remainder is treated as a file path; the path is validated against allowed OS cache directories, then fetched via `Capacitor.convertFileSrc` and returned as raw bytes.
- Otherwise → `data` is decoded as base64 and returned directly.

```typescript
// File-token path (large blob): reads from OS cache dir
const bytes = await decodePayload(nativePayloadString, MOBILE_BLOB_FILE_PREFIX)

// Optionally supply a retry callback for stale tokens
const bytes = await decodePayload(nativePayloadString, MOBILE_BLOB_FILE_PREFIX, {
  onTokenReadFailure: async (err) => {
    // Return a refreshed payload string, or null/undefined to rethrow
    return await refreshPayloadFromNative();
  },
})
```

#### `DecodePayloadOptions`

| Field | Type | Description |
|---|---|---|
| `onTokenReadFailure` | `(error: Error) => Promise<string \| null \| undefined>` | Called when reading the cache file fails. Return a refreshed payload string to retry decoding, or `null`/`undefined` to rethrow the original error. |

### Security

Path validation prevents path traversal attacks. Accepted patterns:
- **Android**: `/data/*/cache/` — matches `/data/data/<pkg>/cache/…`
- **iOS**: `/var/*/Caches/` and `/private/var/tmp/`

Any path outside these patterns is rejected.

---

## Usage

Both `@affine/ios` and `@affine/android` import from this package in their `nbstore` plugin implementations:

```typescript
import {
  MOBILE_BLOB_FILE_PREFIX,
  MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES,
  decodePayload,
} from '@affine/mobile-shared/nbstore/payload'
```
