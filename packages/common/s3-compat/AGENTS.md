# @affine/s3-compat

S3-compatible object storage client. Wraps AWS4 request signing and multipart upload support for use with any S3-compatible backend (AWS S3, R2, MinIO, etc.).

## Layout

```
src/
  index.ts    # Entire implementation (~530 lines): types, S3CompatClient interface, S3Compat class
```

Single-file module. No subdirectories.

---

## Configuration

```typescript
type S3CompatCredentials = {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string       // for temporary credentials (STS)
}

type S3CompatConfig = {
  endpoint: string            // e.g. "https://s3.us-east-1.amazonaws.com" or "http://localhost:9000"
  region: string              // e.g. "us-east-1"
  bucket: string
  forcePathStyle?: boolean    // true for MinIO / LocalStack (puts bucket in path, not hostname)
  requestTimeoutMs?: number
  minPartSize?: number        // minimum multipart part size in bytes
  presign?: {
    expiresInSeconds: number  // presigned URL TTL
    signContentTypeForPut?: boolean
  }
}
```

---

## `S3CompatClient` interface

```typescript
interface S3CompatClient {
  // ─── Basic operations ──────────────────────────────────────────────────────
  putObject(
    key: string,
    body: Blob | Buffer | Uint8Array | ReadableStream | Readable,
    meta?: { contentType?: string; contentLength?: number }
  ): Promise<void>

  getObjectResponse(key: string): Promise<Response | null>  // null = key not found

  headObject(key: string): Promise<
    | { contentType?: string; contentLength?: number; lastModified?: Date; checksumCRC32?: string }
    | undefined  // undefined = key not found
  >

  deleteObject(key: string): Promise<void>

  listObjectsV2(prefix?: string): Promise<ListObjectsItem[]>

  // ─── Multipart upload ───────────────────────────────────────────────────────
  createMultipartUpload(
    key: string,
    meta?: { contentType?: string }
  ): Promise<{ uploadId: string }>

  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Blob | Buffer | Uint8Array | ReadableStream | Readable,
    meta?: { contentLength?: number }
  ): Promise<{ etag: string }>

  listParts(key: string, uploadId: string): Promise<ListPartItem[] | undefined>

  completeMultipartUpload(key: string, uploadId: string, parts: ListPartItem[]): Promise<void>

  abortMultipartUpload(key: string, uploadId: string): Promise<void>

  // ─── Presigned URLs ─────────────────────────────────────────────────────────
  presignGetObject(key: string): Promise<PresignedResult>

  presignPutObject(key: string, meta?: { contentType?: string }): Promise<PresignedResult>

  presignUploadPart(key: string, uploadId: string, partNumber: number): Promise<PresignedResult>
}
```

---

## Key types

```typescript
type ListObjectsItem = {
  key: string
  lastModified: Date
  contentLength: number
}

type ListPartItem = {
  partNumber: number
  etag: string
}

type PresignedResult = {
  url: string
  headers?: Record<string, string>
  expiresAt: Date
}

type ParsedListParts = {
  parts: ListPartItem[]
  isTruncated: boolean
  nextPartNumberMarker?: string
}
```

---

## `S3Compat` class

Concrete implementation of `S3CompatClient`.

```typescript
class S3Compat implements S3CompatClient {
  constructor(config: S3CompatConfig, credentials: S3CompatCredentials)
  static fromConfig(config: S3CompatConfig, credentials: S3CompatCredentials): S3Compat
  // All interface methods implemented
}
```

### Factory function

```typescript
function createS3CompatClient(
  config: S3CompatConfig,
  credentials: S3CompatCredentials
): S3Compat
```

### XML utility

```typescript
// Parse the XML response from S3 ListParts
function parseListPartsXml(xml: string): ParsedListParts
```

---

## Implementation details

**URL style:**
- `forcePathStyle: false` (default) → virtual-hosted style: `https://<bucket>.<host>/<key>`
- `forcePathStyle: true` → path style: `https://<host>/<bucket>/<key>` (required for MinIO/LocalStack)

**Signing:**
- All requests are signed using AWS Signature Version 4 (`aws4` package)
- Presigned URLs embed the signature in query parameters (not headers)
- Session tokens are forwarded in `X-Amz-Security-Token`

**Stream support:**
- Accepts `Blob`, `Buffer`, `Uint8Array`, `ReadableStream` (web), and `Readable` (Node.js)
- Automatically sets `duplex: 'half'` when required by the fetch spec for streaming bodies

**Error handling:**
- Parses XML error body from S3 error responses
- `NoSuchKey` / `NoSuchUpload` return `null` / `undefined` instead of throwing
- Other HTTP errors throw with the S3 error code extracted from the XML body

---

## Usage

```typescript
import { S3Compat } from '@affine/s3-compat'

const client = new S3Compat(
  {
    endpoint: process.env.R2_ENDPOINT,
    region: 'auto',
    bucket: 'affine-blobs',
    presign: { expiresInSeconds: 3600 },
  },
  {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
)

// Upload
await client.putObject('user/avatar.png', fileBuffer, { contentType: 'image/png' })

// Download
const response = await client.getObjectResponse('user/avatar.png')
if (response) {
  const blob = await response.blob()
}

// Presign for direct client upload
const { url, headers } = await client.presignPutObject('uploads/doc.pdf', {
  contentType: 'application/pdf',
})
// → send url + headers to the browser for a direct PUT

// Large file via multipart
const { uploadId } = await client.createMultipartUpload('large-file.bin')
const part1 = await client.uploadPart('large-file.bin', uploadId, 1, chunk1)
const part2 = await client.uploadPart('large-file.bin', uploadId, 2, chunk2)
await client.completeMultipartUpload('large-file.bin', uploadId, [part1, part2])
```

---

## Server usage

This package is used by `@affine/server` (NestJS) for blob storage when configured with an S3-compatible backend (R2, S3, MinIO). The server creates an `S3Compat` instance from environment variables and injects it into its storage service.
