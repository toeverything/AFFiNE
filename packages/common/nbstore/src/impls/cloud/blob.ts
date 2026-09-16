import { UserFriendlyError } from '@affine/error';

import {
  type BlobRecord,
  type BlobSource,
  BlobStorageBase,
  type SourceBlobRecord,
} from '../../storage';
import {
  type BlobSourceCandidate,
  BlobSourceRegistry,
} from './blob-source-registry';
import { CloudBlobWriter } from './blob-writer';
import { HttpConnection } from './http';

interface CloudBlobStorageOptions {
  serverBaseUrl: string;
  id: string;
}

type SourceRegistration = {
  controller: AbortController;
  dirty: boolean;
  promise?: Promise<void>;
  source: BlobSource;
};

const MAX_PENDING_SOURCE_REGISTRATIONS = 32;

export function sourceScopedBlobUrl(
  workspaceId: string,
  key: string,
  source: BlobSource
) {
  const query = new URLSearchParams({
    sourceType: source.type,
    docId: source.docId,
  });
  if (source.type === 'history') {
    query.set('timestampMs', String(source.timestampMs));
  }
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/blobs/v1/${encodeURIComponent(key)}?${query}`;
}

export class CloudBlobStorage extends BlobStorageBase {
  static readonly identifier = 'CloudBlobStorage';
  override readonly isReadonly = false;

  constructor(private readonly options: CloudBlobStorageOptions) {
    super();
  }

  readonly connection = new HttpConnection(this.options.serverBaseUrl);
  private readonly writer = new CloudBlobWriter(
    this.connection,
    this.options.id,
    this.options.serverBaseUrl
  );

  private readonly sources = new BlobSourceRegistry();
  private readonly sourceRegistrations = new Map<string, SourceRegistration>();
  private readonly pendingSourceRegistrations = new Set<SourceRegistration>();

  private sourceId(source: BlobSource) {
    return this.sources.sourceId(source);
  }

  private sourceQuery(source: BlobSource) {
    const query = new URLSearchParams({
      sourceType: source.type,
      docId: source.docId,
    });
    if (source.type === 'history') {
      query.set('timestampMs', String(source.timestampMs));
    }
    return query;
  }

  private removeKeyCandidate(key: string, candidate: BlobSourceCandidate) {
    this.sources.removeKeyCandidate(key, candidate);
  }

  private removeSource(source: BlobSource) {
    this.sources.removeOwned(source);
  }

  private replaceSource(
    source: BlobSource,
    entries: SourceBlobRecord[],
    registration: SourceRegistration
  ) {
    this.sources.replaceOwned(source, entries, registration);
  }

  private isRegistrationCurrent(registration: SourceRegistration) {
    return (
      this.sourceRegistrations.get(this.sourceId(registration.source)) ===
      registration
    );
  }

  private isCandidateCurrent(key: string, candidate: BlobSourceCandidate) {
    return this.sources.hasCandidate(key, candidate);
  }

  async registerSource(
    source: BlobSource,
    signal?: AbortSignal
  ): Promise<void> {
    const id = this.sourceId(source);
    const existing = this.sourceRegistrations.get(id);
    if (existing) {
      return this.refreshSource(existing, signal);
    }
    if (
      this.pendingSourceRegistrations.size >= MAX_PENDING_SOURCE_REGISTRATIONS
    ) {
      throw new Error('Blob source registration budget exceeded');
    }
    const registration = {
      controller: new AbortController(),
      dirty: false,
      source,
    } satisfies SourceRegistration;
    this.sourceRegistrations.set(id, registration);
    return this.refreshSource(registration, signal);
  }

  private refreshSource(
    registration: SourceRegistration,
    signal?: AbortSignal
  ): Promise<void> {
    if (registration.promise) {
      registration.dirty = true;
      return registration.promise;
    }
    if (
      this.pendingSourceRegistrations.size >= MAX_PENDING_SOURCE_REGISTRATIONS
    ) {
      throw new Error('Blob source registration budget exceeded');
    }
    const registrationSignal = signal
      ? AbortSignal.any([signal, registration.controller.signal])
      : registration.controller.signal;
    registration.promise = this.loadSource(
      registration.source,
      registration,
      registrationSignal
    ).finally(() => {
      this.pendingSourceRegistrations.delete(registration);
      registration.promise = undefined;
    });
    this.pendingSourceRegistrations.add(registration);
    return registration.promise;
  }

  async unregisterSource(source: BlobSource) {
    const id = this.sourceId(source);
    const registration = this.sourceRegistrations.get(id);
    if (registration) {
      this.sourceRegistrations.delete(id);
      registration.controller.abort();
    }
    this.removeSource(source);
    await registration?.promise?.catch(() => {});
  }

  private async loadSource(
    source: BlobSource,
    registration: SourceRegistration,
    signal?: AbortSignal
  ) {
    do {
      registration.dirty = false;
      try {
        const res = await this.connection.fetch(
          `/api/workspaces/${encodeURIComponent(this.options.id)}/blob-manifest/v1?${this.sourceQuery(source)}`,
          { cache: 'no-store', signal }
        );
        if (!res.ok) {
          throw new Error(
            `Blob source manifest failed with status ${res.status}`
          );
        }
        const manifest = (await res.json()) as {
          version: 1;
          entries: SourceBlobRecord[];
        };
        if (this.isRegistrationCurrent(registration)) {
          this.replaceSource(source, manifest.entries, registration);
        }
      } catch (error) {
        if (this.isRegistrationCurrent(registration)) {
          this.removeSource(source);
        }
        throw error;
      }
    } while (registration.dirty && this.isRegistrationCurrent(registration));
  }

  async *readableSources(signal?: AbortSignal) {
    let cursor: string | undefined;
    try {
      do {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const res = await this.connection.fetch(
          `/api/workspaces/${encodeURIComponent(this.options.id)}/readable-blob-manifest/v1?${query}`,
          { cache: 'no-store', signal }
        );
        if (!res.ok) {
          throw new Error(
            `Readable blob manifest failed with status ${res.status}`
          );
        }
        const manifest = (await res.json()) as {
          version: 1;
          entries: SourceBlobRecord[];
          nextCursor?: string;
        };
        for (const entry of manifest.entries) {
          this.sources.replaceWorkspace([entry], {});
          yield entry;
        }
        cursor = manifest.nextCursor;
      } while (cursor);
    } finally {
      this.sources.replaceWorkspace([], {});
    }
  }

  override async get(key: string, signal?: AbortSignal, source?: BlobSource) {
    signal?.throwIfAborted();
    let candidates = this.sourceCandidates(key, source);
    if (candidates.length === 0) {
      const failed = await this.refreshRegisteredSources(source, signal);
      signal?.throwIfAborted();
      candidates = this.sourceCandidates(key, source);
      if (candidates.length === 0) {
        if (failed) throw failed.reason;
        return null;
      }
    }

    const attempt = async (candidates: BlobSourceCandidate[]) => {
      for (const candidate of candidates) {
        if (!this.isCandidateCurrent(key, candidate)) {
          continue;
        }
        let res: Response;
        try {
          res = await this.connection.fetch(
            sourceScopedBlobUrl(this.options.id, key, candidate.source),
            { cache: 'no-store', signal }
          );
        } catch (error) {
          if (
            error instanceof UserFriendlyError &&
            (error.status === 403 || error.status === 404)
          ) {
            if (this.isCandidateCurrent(key, candidate)) {
              this.removeKeyCandidate(key, candidate);
            }
            continue;
          }
          throw error;
        }
        if (!this.isCandidateCurrent(key, candidate)) {
          continue;
        }
        if (res.status === 403 || res.status === 404) {
          if (this.isCandidateCurrent(key, candidate)) {
            this.removeKeyCandidate(key, candidate);
          }
          continue;
        }
        if (!res.ok) {
          throw new Error(`Blob download failed with status ${res.status}`);
        }
        const blob = await res.blob();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!this.isCandidateCurrent(key, candidate)) {
          continue;
        }
        return {
          key,
          data,
          mime: blob.type,
          size: blob.size,
          createdAt: new Date(res.headers.get('last-modified') || Date.now()),
        };
      }
      return null;
    };

    return attempt(candidates);
  }

  private sourceCandidates(key: string, source?: BlobSource) {
    return this.sources
      .candidates(key)
      .filter(
        candidate =>
          !source || this.sourceId(candidate.source) === this.sourceId(source)
      );
  }

  private async refreshRegisteredSources(
    source?: BlobSource,
    signal?: AbortSignal
  ) {
    const registrations = source
      ? [this.sourceRegistrations.get(this.sourceId(source))].filter(
          (registration): registration is SourceRegistration => !!registration
        )
      : [...this.sourceRegistrations.values()];
    if (registrations.length === 0) {
      throw new Error('Blob source context is required');
    }
    let failed: PromiseRejectedResult | undefined;
    for (
      let offset = 0;
      offset < registrations.length;
      offset += MAX_PENDING_SOURCE_REGISTRATIONS
    ) {
      const results = await Promise.allSettled(
        registrations
          .slice(offset, offset + MAX_PENDING_SOURCE_REGISTRATIONS)
          .map(
            async registration =>
              registration.promise ?? this.refreshSource(registration, signal)
          )
      );
      failed ??= results.find(result => result.status === 'rejected');
    }
    return failed;
  }

  override set(blob: BlobRecord, signal?: AbortSignal) {
    return this.writer.set(blob, signal);
  }

  override delete(key: string, permanently: boolean) {
    return this.writer.delete(key, permanently);
  }

  override release() {
    return this.writer.release();
  }

  override async list(): Promise<never> {
    throw new Error('Workspace blob inventory is unavailable');
  }

  async listManageable() {
    return this.writer.listManageable();
  }
}
