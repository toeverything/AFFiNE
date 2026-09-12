import { randomUUID } from 'node:crypto';

import { randomToken, sha256Bytes } from './crypto.js';
import { sniffMime } from './mime.js';
import type {
  BlobSourceRef,
  BlobUploadMethod,
  BlobUploadPart,
  BlobUploadSession,
  ManifestBlob,
  StoredBlob,
} from '../domain/blob.js';
import { isBlobKey, parseSourceType } from '../domain/blob.js';
import { errors } from '../domain/errors.js';
import type { User } from '../domain/identity.js';
import type {
  BlobObjectStore,
  BlobStore,
  Clock,
  WorkspaceStore,
} from '../domain/ports.js';

export interface BlobServiceConfig {
  maxBytes: number;
  storageQuota: number;
  multipartThreshold: number;
  partSize: number;
  uploadTtlMs: number;
}

export interface BlobQuota {
  blobLimit: number;
  storageQuota: number;
  usedStorageQuota: number;
  historyPeriod: number;
  memberLimit: number;
  memberCount: number;
  overcapacityMemberCount: number;
  name: string;
  humanReadable: {
    blobLimit: string;
    storageQuota: string;
    storageQuotaUsed: string;
    historyPeriod: string;
    memberLimit: string;
    memberCount: string;
    overcapacityMemberCount: string;
    name: string;
  };
}

function objectKey(workspaceId: string, key: string): string {
  return `blobs/${workspaceId}/${key}`;
}

function pendingKey(uploadId: string, partNumber?: number): string {
  return partNumber === undefined
    ? `pending/${uploadId}`
    : `pending/${uploadId}/${partNumber}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }
  throw errors.badRequest('Missing blob payload.');
}

export class BlobService {
  constructor(
    private readonly blobs: BlobStore,
    private readonly workspaces: WorkspaceStore,
    private readonly objects: BlobObjectStore,
    private readonly clock: Clock,
    private readonly config: BlobServiceConfig
  ) {}

  async authorize(user: User, workspaceId: string): Promise<void> {
    const workspace = await this.workspaces.getWorkspace(workspaceId);
    if (!workspace) {
      throw errors.spaceNotFound();
    }
    const member = await this.workspaces.getMember(workspaceId, user.id);
    if (!member) {
      throw errors.spaceAccessDenied(workspaceId);
    }
  }

  async createUpload(
    user: User,
    input: { workspaceId: string; key: string; size: number; mime: string }
  ): Promise<{
    method: BlobUploadMethod;
    blobKey: string;
    alreadyUploaded: boolean;
    uploadUrl: string | null;
    headers: Record<string, string> | null;
    expiresAt: Date | null;
    uploadId: string | null;
    partSize: number | null;
    uploadedParts: { partNumber: number; etag: string }[];
  }> {
    await this.authorize(user, input.workspaceId);
    if (!isBlobKey(input.key)) {
      throw errors.badRequest('Invalid blob key.');
    }
    if (input.size <= 0) {
      throw errors.badRequest('Blob size must be positive.');
    }
    if (input.size > this.config.maxBytes) {
      throw errors.blobQuotaExceeded();
    }
    const existing = await this.blobs.getBlob(input.workspaceId, input.key);
    if (existing && !existing.deletedAt) {
      return {
        method: 'PRESIGNED',
        blobKey: input.key,
        alreadyUploaded: true,
        uploadUrl: null,
        headers: null,
        expiresAt: null,
        uploadId: null,
        partSize: null,
        uploadedParts: [],
      };
    }
    const used = await this.blobs.usedStorage(input.workspaceId);
    if (used + input.size > this.config.storageQuota) {
      throw errors.storageQuotaExceeded();
    }
    const multipart = input.size >= this.config.multipartThreshold;
    const now = this.clock.now();
    const session = await this.blobs.createUpload({
      id: randomUUID(),
      token: randomToken(),
      workspaceId: input.workspaceId,
      key: input.key,
      mime: input.mime,
      size: input.size,
      method: multipart ? 'MULTIPART' : 'PRESIGNED',
      partSize: multipart ? this.config.partSize : null,
      expiresAt: new Date(now.getTime() + this.config.uploadTtlMs),
      createdBy: user.id,
      createdAt: now,
    });
    if (multipart) {
      return {
        method: 'MULTIPART',
        blobKey: input.key,
        alreadyUploaded: false,
        uploadUrl: null,
        headers: null,
        expiresAt: session.expiresAt,
        uploadId: session.id,
        partSize: session.partSize,
        uploadedParts: [],
      };
    }
    return {
      method: 'PRESIGNED',
      blobKey: input.key,
      alreadyUploaded: false,
      uploadUrl: `/api/blob-uploads/${session.token}`,
      headers: { 'content-type': 'application/octet-stream' },
      expiresAt: session.expiresAt,
      uploadId: session.id,
      partSize: null,
      uploadedParts: [],
    };
  }

  async partUrl(
    user: User,
    input: {
      workspaceId: string;
      key: string;
      uploadId: string;
      partNumber: number;
    }
  ): Promise<{
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: Date;
  }> {
    await this.authorize(user, input.workspaceId);
    const session = await this.requireUpload(
      input.uploadId,
      input.workspaceId,
      input.key
    );
    if (session.method !== 'MULTIPART' || !session.partSize) {
      throw errors.badRequest('Upload is not multipart.');
    }
    if (input.partNumber < 1) {
      throw errors.badRequest('partNumber must be >= 1.');
    }
    const existing = (await this.blobs.listParts(session.id)).find(
      part => part.partNumber === input.partNumber
    );
    const part =
      existing ??
      (await this.blobs.putPart({
        uploadId: session.id,
        partNumber: input.partNumber,
        etag: null,
        token: randomToken(),
        size: 0,
      }));
    return {
      uploadUrl: `/api/blob-uploads/${part.token}`,
      headers: { 'content-type': 'application/octet-stream' },
      expiresAt: session.expiresAt,
    };
  }

  async putUpload(token: string, raw: Uint8Array): Promise<{ etag: string }> {
    const bytes = toBytes(raw);
    if (bytes.byteLength > this.config.maxBytes) {
      throw errors.contentTooLarge();
    }
    const part = await this.blobs.getPartByToken(token);
    if (part) {
      const session = await this.blobs.getUpload(part.uploadId);
      if (
        !session ||
        session.expiresAt.getTime() <= this.clock.now().getTime()
      ) {
        throw errors.badRequest('Upload expired.');
      }
      if (session.partSize && bytes.byteLength > session.partSize) {
        throw errors.contentTooLarge();
      }
      const etag = sha256Bytes(bytes);
      await this.objects.put(pendingKey(session.id, part.partNumber), bytes);
      await this.blobs.putPart({ ...part, etag, size: bytes.byteLength });
      return { etag };
    }
    const session = await this.blobs.getUploadByToken(token);
    if (!session || session.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw errors.badRequest('Upload expired.');
    }
    if (bytes.byteLength !== session.size) {
      throw errors.badRequest('Uploaded size does not match createBlobUpload.');
    }
    const etag = sha256Bytes(bytes);
    await this.objects.put(pendingKey(session.id), bytes);
    return { etag };
  }

  async complete(
    user: User,
    input: {
      workspaceId: string;
      key: string;
      uploadId?: string | null;
      parts?: Array<{ partNumber: number; etag: string }> | null;
    }
  ): Promise<string> {
    await this.authorize(user, input.workspaceId);
    const session = input.uploadId
      ? await this.requireUpload(input.uploadId, input.workspaceId, input.key)
      : await this.blobs.findUpload(input.workspaceId, input.key);
    if (
      !session ||
      session.workspaceId !== input.workspaceId ||
      session.key !== input.key ||
      session.expiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw errors.badRequest('No pending blob upload.');
    }
    let payload: Uint8Array;
    if (session.method === 'MULTIPART') {
      payload = await this.assembleMultipart(session, input.parts ?? []);
    } else {
      const stored = await this.objects.get(pendingKey(session.id));
      if (!stored) {
        throw errors.badRequest('Blob was not uploaded.');
      }
      payload = stored;
    }
    await this.commit(
      user,
      session.workspaceId,
      session.key,
      session.mime,
      payload
    );
    await this.cleanupUpload(session.id);
    return session.key;
  }

  async abort(
    user: User,
    input: { workspaceId: string; key: string; uploadId: string }
  ): Promise<boolean> {
    await this.authorize(user, input.workspaceId);
    const session = await this.blobs.getUpload(input.uploadId);
    if (
      !session ||
      session.workspaceId !== input.workspaceId ||
      session.key !== input.key
    ) {
      return false;
    }
    await this.cleanupUpload(session.id);
    return true;
  }

  async setDirect(
    user: User,
    workspaceId: string,
    key: string,
    mime: string,
    payload: Uint8Array
  ): Promise<string> {
    await this.authorize(user, workspaceId);
    const safeKey = key && isBlobKey(key) ? key : sha256Bytes(payload);
    if (payload.byteLength > this.config.maxBytes) {
      throw errors.blobQuotaExceeded();
    }
    const used = await this.blobs.usedStorage(workspaceId);
    const existing = await this.blobs.getBlob(workspaceId, safeKey);
    const nextUsed =
      used -
      (existing && !existing.deletedAt ? existing.size : 0) +
      payload.byteLength;
    if (nextUsed > this.config.storageQuota) {
      throw errors.storageQuotaExceeded();
    }
    await this.commit(user, workspaceId, safeKey, mime, payload);
    return safeKey;
  }

  async get(
    user: User,
    workspaceId: string,
    key: string
  ): Promise<{ record: StoredBlob; bytes: Uint8Array }> {
    await this.authorize(user, workspaceId);
    const record = await this.blobs.getBlob(workspaceId, key);
    if (!record || record.deletedAt) {
      throw errors.blobNotFound(workspaceId, key);
    }
    const bytes = await this.objects.get(objectKey(workspaceId, key));
    if (!bytes) {
      throw errors.blobNotFound(workspaceId, key);
    }
    return { record, bytes };
  }

  async list(user: User, workspaceId: string): Promise<StoredBlob[]> {
    await this.authorize(user, workspaceId);
    return this.blobs.listBlobs(workspaceId);
  }

  async delete(
    user: User,
    workspaceId: string,
    key: string,
    permanently: boolean
  ): Promise<boolean> {
    await this.authorize(user, workspaceId);
    if (permanently) {
      await this.objects.delete(objectKey(workspaceId, key));
      return this.blobs.deleteBlob(workspaceId, key);
    }
    return this.blobs.markBlobDeleted(workspaceId, key, this.clock.now());
  }

  async releaseDeleted(user: User, workspaceId: string): Promise<boolean> {
    await this.authorize(user, workspaceId);
    const all = await this.blobs.listBlobs(workspaceId, {
      includeDeleted: true,
    });
    for (const blob of all) {
      if (!blob.deletedAt) {
        continue;
      }
      await this.objects.delete(objectKey(workspaceId, blob.key));
      await this.blobs.deleteBlob(workspaceId, blob.key);
    }
    return true;
  }

  async purgeWorkspace(workspaceId: string): Promise<void> {
    const keys = await this.blobs.deleteWorkspaceBlobs(workspaceId);
    for (const key of keys) {
      await this.objects.delete(objectKey(workspaceId, key));
    }
  }

  async quota(user: User, workspaceId: string): Promise<BlobQuota> {
    await this.authorize(user, workspaceId);
    const used = await this.blobs.usedStorage(workspaceId);
    const memberCount = await this.workspaces.countMembers(workspaceId);
    return {
      blobLimit: this.config.maxBytes,
      storageQuota: this.config.storageQuota,
      usedStorageQuota: used,
      historyPeriod: 7 * 24 * 60 * 60 * 1000,
      memberLimit: 10_000,
      memberCount,
      overcapacityMemberCount: 0,
      name: 'Mosaic',
      humanReadable: {
        blobLimit: formatSize(this.config.maxBytes),
        storageQuota: formatSize(this.config.storageQuota),
        storageQuotaUsed: formatSize(used),
        historyPeriod: '7 days',
        memberLimit: '10000',
        memberCount: String(memberCount),
        overcapacityMemberCount: '0',
        name: 'Mosaic',
      },
    };
  }

  async manifest(
    user: User,
    workspaceId: string,
    query: { sourceType?: string; docId?: string; timestampMs?: string }
  ): Promise<{ version: 1; entries: ManifestBlob[] }> {
    await this.authorize(user, workspaceId);
    const sourceType = parseSourceType(query.sourceType);
    const docId =
      query.docId && query.docId.length > 0 ? query.docId : workspaceId;
    const timestampMs =
      sourceType === 'history' && query.timestampMs
        ? Number(query.timestampMs)
        : undefined;
    const blobs = await this.blobs.listBlobs(workspaceId);
    const source: BlobSourceRef =
      sourceType === 'history'
        ? {
            type: 'history',
            workspaceId,
            docId,
            ...(timestampMs !== undefined && !Number.isNaN(timestampMs)
              ? { timestampMs }
              : {}),
          }
        : { type: 'currentDoc', workspaceId, docId };
    return {
      version: 1,
      entries: blobs.map(blob => this.toManifest(blob, source)),
    };
  }

  async readableManifest(
    user: User,
    workspaceId: string,
    query: { limit?: string; cursor?: string }
  ): Promise<{ version: 1; entries: ManifestBlob[]; nextCursor?: string }> {
    await this.authorize(user, workspaceId);
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 100);
    const blobs = (await this.blobs.listBlobs(workspaceId)).sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    const start = query.cursor
      ? blobs.findIndex(blob => blob.key > query.cursor!)
      : 0;
    const from = start < 0 ? blobs.length : start;
    const slice = blobs.slice(from, from + limit);
    const source: BlobSourceRef = {
      type: 'currentDoc',
      workspaceId,
      docId: workspaceId,
    };
    const next = blobs[from + limit];
    return {
      version: 1,
      entries: slice.map(blob => this.toManifest(blob, source)),
      ...(next ? { nextCursor: slice[slice.length - 1]?.key ?? next.key } : {}),
    };
  }

  private toManifest(blob: StoredBlob, source: BlobSourceRef): ManifestBlob {
    return {
      key: blob.key,
      mime: blob.mime,
      size: blob.size,
      createdAt: blob.createdAt.toISOString(),
      source,
    };
  }

  private async commit(
    user: User,
    workspaceId: string,
    key: string,
    declaredMime: string,
    payload: Uint8Array
  ): Promise<void> {
    // Re-check the quota at commit time, not just at createUpload(): the
    // quota check there is only a pre-flight estimate against the size the
    // client *declared*. Concurrent uploads started while there was still
    // headroom, or an upload that outlives another blob's deletion, can
    // otherwise land bytes past `storageQuota`.
    const existing = await this.blobs.getBlob(workspaceId, key);
    const used = await this.blobs.usedStorage(workspaceId);
    const previousSize = existing && !existing.deletedAt ? existing.size : 0;
    if (used - previousSize + payload.byteLength > this.config.storageQuota) {
      throw errors.storageQuotaExceeded();
    }
    const mime = sniffMime(payload, declaredMime);
    await this.objects.put(objectKey(workspaceId, key), payload);
    await this.blobs.upsertBlob({
      workspaceId,
      key,
      mime,
      size: payload.byteLength,
      payloadHash: sha256Bytes(payload),
      createdBy: user.id,
      createdAt: this.clock.now(),
      deletedAt: null,
    });
  }

  private async assembleMultipart(
    session: BlobUploadSession,
    claimed: Array<{ partNumber: number; etag: string }>
  ): Promise<Uint8Array> {
    const stored = (await this.blobs.listParts(session.id)).sort(
      (a, b) => a.partNumber - b.partNumber
    );
    const expected = Math.ceil(
      session.size / (session.partSize ?? session.size)
    );
    if (stored.length !== expected) {
      throw errors.badRequest('Multipart upload has missing parts.');
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (const part of stored) {
      const claimedEtag = claimed.find(
        item => item.partNumber === part.partNumber
      )?.etag;
      if (!part.etag || (claimedEtag && claimedEtag !== part.etag)) {
        throw errors.badRequest('Multipart ETag mismatch.');
      }
      const bytes = await this.objects.get(
        pendingKey(session.id, part.partNumber)
      );
      if (!bytes) {
        throw errors.badRequest('Multipart upload has missing parts.');
      }
      chunks.push(bytes);
      total += bytes.byteLength;
    }
    if (total !== session.size) {
      throw errors.badRequest('Uploaded size does not match createBlobUpload.');
    }
    const payload = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return payload;
  }

  private async requireUpload(
    uploadId: string,
    workspaceId: string,
    key: string
  ): Promise<BlobUploadSession> {
    const session = await this.blobs.getUpload(uploadId);
    if (
      !session ||
      session.workspaceId !== workspaceId ||
      session.key !== key ||
      session.expiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw errors.badRequest('Upload session is invalid or expired.');
    }
    return session;
  }

  private async cleanupUpload(uploadId: string): Promise<void> {
    const parts = await this.blobs.listParts(uploadId);
    for (const part of parts) {
      await this.objects.delete(pendingKey(uploadId, part.partNumber));
    }
    await this.objects.delete(pendingKey(uploadId));
    await this.blobs.deleteUpload(uploadId);
  }
}
