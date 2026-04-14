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
const MOBILE_BLOB_FILE_PREFIX = 'affine-blob-file://'

// Blobs larger than this are written to a temp file; smaller ones are inlined as base64
const MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES = 1024 * 1024  // 1 MB
```

### `decodePayload(payload: string): Uint8Array`

Decodes a blob payload string received from the native layer:

```typescript
// If payload starts with MOBILE_BLOB_FILE_PREFIX → read file from cache path
// Otherwise → decode as base64
const data = decodePayload(nativePayloadString)
```

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
