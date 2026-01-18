import { OpClient, transfer } from '@toeverything/infra/op';
import type { Observable } from 'rxjs';
import { v4 as uuid } from 'uuid';

import { DummyConnection } from '../connection';
import {
  AwarenessFrontend,
  BlobFrontend,
  DocFrontend,
  IndexerFrontend,
} from '../frontend';
import {
  type AggregateOptions,
  type AggregateResult,
  type AwarenessRecord,
  type BlobRecord,
  type BlobStorage,
  type DocRecord,
  type DocStorage,
  type DocUpdate,
  type IndexerSchema,
  type ListedBlobRecord,
  type Query,
  type SearchOptions,
  type SearchResult,
} from '../storage';
import type { AwarenessSync } from '../sync/awareness';
import type { BlobSync } from '../sync/blob';
import type { DocSync } from '../sync/doc';
import type { IndexerPreferOptions, IndexerSync } from '../sync/indexer';
import type {
  TelemetryAck,
  TelemetryContext,
  TelemetryEvent,
  TelemetryQueueState,
} from '../telemetry/types';
import type { StoreInitOptions, WorkerManagerOps, WorkerOps } from './ops';

export type { StoreInitOptions as WorkerInitOptions } from './ops';

export class StoreManagerClient {
  private readonly connections = new Map<
    string,
    {
      store: StoreClient;
      dispose: () => void;
    }
  >();

  constructor(private readonly client: OpClient<WorkerManagerOps>) {
    this.telemetry = new TelemetryClient(this.client);
  }

  readonly telemetry: TelemetryClient;

  open(key: string, options: StoreInitOptions) {
    const { port1, port2 } = new MessageChannel();

    const client = new OpClient<WorkerOps>(port1);
    const closeKey = uuid();

    this.client
      .call(
        'open',
        transfer(
          {
            key,
            closeKey,
            options,
            port: port2,
          },
          [port2]
        )
      )
      .catch(err => {
        console.error('error opening', err);
      });

    const connection = {
      store: new StoreClient(client),
      dispose: () => {
        this.client.call('close', closeKey).catch(err => {
          console.error('error closing', err);
        });
        this.connections.delete(closeKey);
      },
    };

    this.connections.set(closeKey, connection);

    return connection;
  }

  dispose() {
    this.connections.forEach(connection => {
      connection.dispose();
    });
  }

  pause() {
    this.connections.forEach(connection => {
      connection.store.pauseSync().catch(err => {
        console.error('error pausing', err);
      });
    });
  }

  resume() {
    this.connections.forEach(connection => {
      connection.store.resumeSync().catch(err => {
        console.error('error resuming', err);
      });
    });
  }
}

class TelemetryClient {
  constructor(private readonly client: OpClient<WorkerManagerOps>) {}

  setContext(context: TelemetryContext): Promise<void> {
    return this.client.call('telemetry.setContext', context);
  }

  track(event: TelemetryEvent): Promise<{ queued: boolean }> {
    return this.client.call('telemetry.track', event);
  }

  pageview(event: TelemetryEvent): Promise<{ queued: boolean }> {
    return this.client.call('telemetry.pageview', event);
  }

  flush(): Promise<TelemetryAck> {
    return this.client.call('telemetry.flush');
  }

  getQueueState(): Promise<TelemetryQueueState> {
    return this.client.call('telemetry.getQueueState');
  }
}

export class StoreClient {
  constructor(private readonly client: OpClient<WorkerOps>) {
    this.docStorage = new WorkerDocStorage(this.client);
    this.blobStorage = new WorkerBlobStorage(this.client);
    this.docSync = new WorkerDocSync(this.client);
    this.blobSync = new WorkerBlobSync(this.client);
    this.awarenessSync = new WorkerAwarenessSync(this.client);
    this.docFrontend = new DocFrontend(this.docStorage, this.docSync);
    this.blobFrontend = new BlobFrontend(this.blobStorage, this.blobSync);
    this.awarenessFrontend = new AwarenessFrontend(this.awarenessSync);
    this.indexerSync = new WorkerIndexerSync(this.client);
    this.indexerFrontend = new IndexerFrontend(this.indexerSync);
  }

  private readonly docStorage: WorkerDocStorage;
  private readonly blobStorage: WorkerBlobStorage;
  private readonly docSync: WorkerDocSync;
  private readonly blobSync: WorkerBlobSync;
  private readonly awarenessSync: WorkerAwarenessSync;
  private readonly indexerSync: WorkerIndexerSync;

  readonly docFrontend: DocFrontend;
  readonly blobFrontend: BlobFrontend;
  readonly awarenessFrontend: AwarenessFrontend;
  readonly indexerFrontend: IndexerFrontend;

  enableBatterySaveMode(): Promise<void> {
    return this.client.call('sync.enableBatterySaveMode');
  }
  disableBatterySaveMode(): Promise<void> {
    return this.client.call('sync.disableBatterySaveMode');
  }

  pauseSync() {
    return this.client.call('sync.pauseSync');
  }
  resumeSync() {
    return this.client.call('sync.resumeSync');
  }
}

class WorkerDocStorage implements DocStorage {
  constructor(private readonly client: OpClient<WorkerOps>) {}
  spaceId = '';

  readonly storageType = 'doc';
  readonly isReadonly = false;

  async getDoc(docId: string) {
    return this.client.call('docStorage.getDoc', docId);
  }

  async getDocDiff(docId: string, state?: Uint8Array) {
    return this.client.call('docStorage.getDocDiff', { docId, state });
  }

  async pushDocUpdate(update: DocUpdate, origin?: string) {
    return this.client.call('docStorage.pushDocUpdate', { update, origin });
  }

  async getDocTimestamp(docId: string) {
    return this.client.call('docStorage.getDocTimestamp', docId);
  }

  async getDocTimestamps(after?: Date) {
    return this.client.call('docStorage.getDocTimestamps', after ?? null);
  }

  async deleteDoc(docId: string) {
    return this.client.call('docStorage.deleteDoc', docId);
  }

  subscribeDocUpdate(callback: (update: DocRecord, origin?: string) => void) {
    const subscription = this.client
      .ob$('docStorage.subscribeDocUpdate')
      .subscribe(value => {
        callback(value.update, value.origin);
      });
    return () => {
      subscription.unsubscribe();
    };
  }

  connection = new WorkerDocConnection(this.client);
}

class WorkerDocConnection extends DummyConnection {
  constructor(private readonly client: OpClient<WorkerOps>) {
    super();
  }

  promise: Promise<void> | undefined;

  override waitForConnected(): Promise<void> {
    if (this.promise) {
      return this.promise;
    }
    this.promise = this.client.call('docStorage.waitForConnected');
    return this.promise;
  }
}

class WorkerBlobStorage implements BlobStorage {
  constructor(private readonly client: OpClient<WorkerOps>) {}

  readonly storageType = 'blob';
  readonly isReadonly = false;

  get(key: string, _signal?: AbortSignal): Promise<BlobRecord | null> {
    return this.client.call('blobStorage.getBlob', key);
  }
  set(blob: BlobRecord, _signal?: AbortSignal): Promise<void> {
    return this.client.call('blobStorage.setBlob', blob);
  }

  delete(
    key: string,
    permanently: boolean,
    _signal?: AbortSignal
  ): Promise<void> {
    return this.client.call('blobStorage.deleteBlob', { key, permanently });
  }

  release(_signal?: AbortSignal): Promise<void> {
    return this.client.call('blobStorage.releaseBlobs');
  }

  list(_signal?: AbortSignal): Promise<ListedBlobRecord[]> {
    return this.client.call('blobStorage.listBlobs');
  }

  connection = new WorkerBlobConnection(this.client);
}

class WorkerBlobConnection extends DummyConnection {
  constructor(private readonly client: OpClient<WorkerOps>) {
    super();
  }

  promise: Promise<void> | undefined;

  override waitForConnected(): Promise<void> {
    if (this.promise) {
      return this.promise;
    }
    this.promise = this.client.call('blobStorage.waitForConnected');
    return this.promise;
  }
}

class WorkerDocSync implements DocSync {
  constructor(private readonly client: OpClient<WorkerOps>) {}

  get state$() {
    return this.client.ob$('docSync.state');
  }

  docState$(docId: string) {
    return this.client.ob$('docSync.docState', docId);
  }

  async waitForSynced(docId?: string, abort?: AbortSignal): Promise<void> {
    await this.client.call('docSync.waitForSynced', docId ?? null, abort);
  }

  addPriority(docId: string, priority: number) {
    const subscription = this.client
      .ob$('docSync.addPriority', { docId, priority })
      .subscribe();
    return () => {
      subscription.unsubscribe();
    };
  }

  resetSync(): Promise<void> {
    return this.client.call('docSync.resetSync');
  }
}

class WorkerBlobSync implements BlobSync {
  constructor(private readonly client: OpClient<WorkerOps>) {}
  get state$() {
    return this.client.ob$('blobSync.state');
  }
  blobState$(blobId: string) {
    return this.client.ob$('blobSync.blobState', blobId);
  }

  downloadBlob(blobId: string): Promise<boolean> {
    return this.client.call('blobSync.downloadBlob', blobId);
  }
  uploadBlob(blob: BlobRecord, force?: boolean): Promise<true> {
    return this.client.call('blobSync.uploadBlob', { blob, force });
  }
  fullDownload(peerId?: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortListener = () => {
        reject(signal?.reason);
        subscription.unsubscribe();
      };

      signal?.addEventListener('abort', abortListener);

      const subscription = this.client
        .ob$('blobSync.fullDownload', peerId ?? null)
        .subscribe({
          next() {
            signal?.removeEventListener('abort', abortListener);
            resolve();
          },
          error(err) {
            signal?.removeEventListener('abort', abortListener);
            reject(err);
          },
        });
    });
  }
}

class WorkerAwarenessSync implements AwarenessSync {
  constructor(private readonly client: OpClient<WorkerOps>) {}

  update(record: AwarenessRecord, origin?: string): Promise<void> {
    return this.client.call('awarenessSync.update', {
      awareness: record,
      origin,
    });
  }

  subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => Promise<AwarenessRecord | null>
  ): () => void {
    const subscription = this.client
      .ob$('awarenessSync.subscribeUpdate', id)
      .subscribe({
        next: update => {
          if (update.type === 'awareness-update') {
            onUpdate(update.awareness, update.origin);
          }
          if (update.type === 'awareness-collect') {
            onCollect()
              .then(record => {
                if (record) {
                  this.client
                    .call('awarenessSync.collect', {
                      awareness: record,
                      collectId: update.collectId,
                    })
                    .catch(err => {
                      console.error('error feedback collected awareness', err);
                    });
                }
              })
              .catch(err => {
                console.error('error collecting awareness', err);
              });
          }
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }
}

class WorkerIndexerSync implements IndexerSync {
  constructor(private readonly client: OpClient<WorkerOps>) {}

  search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ): Promise<SearchResult<T, O>> {
    return this.client.call('indexerSync.search', { table, query, options });
  }
  aggregate<T extends keyof IndexerSchema, const O extends AggregateOptions<T>>(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ): Promise<AggregateResult<T, O>> {
    return this.client.call('indexerSync.aggregate', {
      table,
      query,
      field: field as string,
      options,
    });
  }
  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ): Observable<SearchResult<T, O>> {
    return this.client.ob$('indexerSync.subscribeSearch', {
      table,
      query,
      options,
    });
  }
  aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ): Observable<AggregateResult<T, O>> {
    return this.client.ob$('indexerSync.subscribeAggregate', {
      table,
      query,
      field: field as string,
      options,
    });
  }

  waitForCompleted(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortListener = () => {
        reject(signal?.reason);
        subscription.unsubscribe();
      };

      signal?.addEventListener('abort', abortListener);

      const subscription = this.client
        .ob$('indexerSync.waitForCompleted')
        .subscribe({
          complete() {
            signal?.removeEventListener('abort', abortListener);
            resolve();
          },
          error(err) {
            signal?.removeEventListener('abort', abortListener);
            reject(err);
          },
        });
    });
  }
  waitForDocCompleted(docId: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortListener = () => {
        reject(signal?.reason);
        subscription.unsubscribe();
      };

      signal?.addEventListener('abort', abortListener);

      const subscription = this.client
        .ob$('indexerSync.waitForDocCompleted', docId)
        .subscribe({
          complete() {
            signal?.removeEventListener('abort', abortListener);
            resolve();
          },
          error(err) {
            signal?.removeEventListener('abort', abortListener);
            reject(err);
          },
        });
    });
  }
  get state$() {
    return this.client.ob$('indexerSync.state');
  }
  docState$(docId: string) {
    return this.client.ob$('indexerSync.docState', docId);
  }
  addPriority(docId: string, priority: number) {
    const subscription = this.client
      .ob$('indexerSync.addPriority', { docId, priority })
      .subscribe();
    return () => {
      subscription.unsubscribe();
    };
  }
}
