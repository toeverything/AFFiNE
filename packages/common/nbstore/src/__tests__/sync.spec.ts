import 'fake-indexeddb/auto';

import * as reader from '@affine/reader';
import { OpConsumer } from '@toeverything/infra/op';
import { firstValueFrom, NEVER } from 'rxjs';
import { afterEach, expect, test, vi } from 'vitest';
import { Doc as YDoc, encodeStateAsUpdate, encodeStateVector } from 'yjs';

import { DummyConnection } from '../connection';
import {
  IndexedDBBlobStorage,
  IndexedDBBlobSyncStorage,
  IndexedDBDocStorage,
  IndexedDBDocSyncStorage,
} from '../impls/idb';
import {
  type AggregateOptions,
  type AggregateResult,
  type CrawlResult,
  type DocClock,
  type DocClocks,
  type DocDiff,
  type DocIndexedClock,
  type DocRecord,
  type DocStorage,
  type DocUpdate,
  type IndexerDocument,
  type IndexerSchema,
  IndexerStorageBase,
  IndexerSyncStorageBase,
  type Query,
  type SearchOptions,
  type SearchResult,
  SpaceStorage,
} from '../storage';
import { DummyAwarenessStorage } from '../storage/dummy/awareness';
import { DummyBlobStorage } from '../storage/dummy/blob';
import { DummyBlobSyncStorage } from '../storage/dummy/blob-sync';
import { Sync } from '../sync';
import { BlobSyncImpl } from '../sync/blob';
import { BlobSyncPeer } from '../sync/blob/peer';
import { DocSyncPeer } from '../sync/doc/peer';
import { IndexerSyncImpl } from '../sync/indexer';
import { StoreManagerConsumer } from '../worker/consumer';
import type { StoreInitOptions, WorkerManagerOps } from '../worker/ops';
import { StoreConsumer } from '../worker/store';
import { expectYjsEqual } from './utils';

afterEach(() => {
  vi.restoreAllMocks();
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class TestDocStorage implements DocStorage {
  readonly storageType = 'doc' as const;
  readonly connection = new DummyConnection();
  isReadonly = false;
  syncMetadataScope?: 'connection' | 'persistent';
  private readonly subscribers = new Set<
    (update: DocRecord, origin?: string) => void
  >();

  constructor(
    readonly spaceId: string,
    private readonly timestamps: Map<string, Date>,
    private readonly crawlDocDataImpl: (
      docId: string
    ) => Promise<CrawlResult | null>
  ) {}

  async getDoc(_docId: string): Promise<DocRecord | null> {
    return null;
  }

  async getDocDiff(
    _docId: string,
    _state?: Uint8Array
  ): Promise<DocDiff | null> {
    return null;
  }

  async pushDocUpdate(update: DocUpdate, origin?: string): Promise<DocClock> {
    const timestamp = this.timestamps.get(update.docId) ?? new Date();
    const record = { ...update, timestamp };
    this.timestamps.set(update.docId, timestamp);
    for (const subscriber of this.subscribers) {
      subscriber(record, origin);
    }
    return { docId: update.docId, timestamp };
  }

  async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const timestamp = this.timestamps.get(docId);
    return timestamp ? { docId, timestamp } : null;
  }

  async getDocTimestamps(_after?: Date): Promise<DocClocks> {
    return Object.fromEntries(this.timestamps);
  }

  async deleteDoc(docId: string): Promise<void> {
    this.timestamps.delete(docId);
  }

  subscribeDocUpdate(callback: (update: DocRecord, origin?: string) => void) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async crawlDocData(docId: string): Promise<CrawlResult | null> {
    return this.crawlDocDataImpl(docId);
  }
}

class TimestampBlindDocStorage extends IndexedDBDocStorage {
  syncMetadataScope: 'connection' | 'persistent' = 'persistent';
  override async getDocTimestamps(): Promise<DocClocks> {
    return {};
  }
}

class PermissionDeniedRemoteDocStorage implements DocStorage {
  readonly storageType = 'doc' as const;
  readonly connection = new DummyConnection();
  readonly isReadonly = false;
  pushCount = 0;

  constructor(readonly spaceId: string) {}

  async getDoc(_docId: string): Promise<DocRecord | null> {
    return null;
  }

  async getDocDiff(
    _docId: string,
    _state?: Uint8Array
  ): Promise<DocDiff | null> {
    return null;
  }

  async pushDocUpdate(_update: DocUpdate): Promise<DocClock> {
    this.pushCount++;
    const error = new Error('No permission to update doc');
    error.name = 'DOC_ACTION_DENIED';
    throw error;
  }

  async getDocTimestamp(_docId: string): Promise<DocClock | null> {
    return null;
  }

  async getDocTimestamps(): Promise<DocClocks> {
    return {};
  }

  async deleteDoc(_docId: string): Promise<void> {
    return;
  }

  subscribeDocUpdate(_callback: (update: DocRecord, origin?: string) => void) {
    return () => {};
  }
}

class PermissionDeniedConnection extends DummyConnection {
  waitCount = 0;

  override async waitForConnected(_signal?: AbortSignal): Promise<void> {
    this.waitCount++;
    const error = new Error('No permission to access space');
    error.name = 'SPACE_ACCESS_DENIED';
    throw error;
  }
}

class PermissionDeniedConnectionDocStorage extends PermissionDeniedRemoteDocStorage {
  override readonly connection = new PermissionDeniedConnection();
}

class TrackingIndexerStorage extends IndexerStorageBase {
  override readonly connection = new DummyConnection();
  override readonly isReadonly = false;

  constructor(
    private readonly calls: string[],
    override readonly recommendRefreshInterval: number
  ) {
    super();
  }

  override async search<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(_table: T, _query: Query<T>, _options?: O): Promise<SearchResult<T, O>> {
    return {
      pagination: { count: 0, limit: 0, skip: 0, hasMore: false },
      nodes: [],
    } as SearchResult<T, O>;
  }

  override async aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    _table: T,
    _query: Query<T>,
    _field: keyof IndexerSchema[T],
    _options?: O
  ): Promise<AggregateResult<T, O>> {
    return {
      pagination: { count: 0, limit: 0, skip: 0, hasMore: false },
      buckets: [],
    } as AggregateResult<T, O>;
  }

  override search$<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(_table: T, _query: Query<T>, _options?: O) {
    return NEVER;
  }

  override aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(_table: T, _query: Query<T>, _field: keyof IndexerSchema[T], _options?: O) {
    return NEVER;
  }

  override async deleteByQuery<T extends keyof IndexerSchema>(
    table: T,
    _query: Query<T>
  ): Promise<void> {
    this.calls.push(`deleteByQuery:${String(table)}`);
  }

  override async insert<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void> {
    this.calls.push(`insert:${String(table)}:${document.id}`);
  }

  override async delete<T extends keyof IndexerSchema>(
    table: T,
    id: string
  ): Promise<void> {
    this.calls.push(`delete:${String(table)}:${id}`);
  }

  override async update<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void> {
    this.calls.push(`update:${String(table)}:${document.id}`);
  }

  override async refresh<T extends keyof IndexerSchema>(
    _table: T
  ): Promise<void> {
    return;
  }

  override async refreshIfNeed(): Promise<void> {
    this.calls.push('refresh');
  }

  override async indexVersion(): Promise<number> {
    return 1;
  }
}

class TrackingIndexerSyncStorage extends IndexerSyncStorageBase {
  override readonly connection = new DummyConnection();
  private readonly clocks = new Map<string, DocIndexedClock>();

  constructor(private readonly calls: string[]) {
    super();
  }

  override async getDocIndexedClock(
    docId: string
  ): Promise<DocIndexedClock | null> {
    return this.clocks.get(docId) ?? null;
  }

  override async setDocIndexedClock(clock: DocIndexedClock): Promise<void> {
    this.calls.push(`setClock:${clock.docId}`);
    this.clocks.set(clock.docId, clock);
  }

  override async clearDocIndexedClock(docId: string): Promise<void> {
    this.calls.push(`clearClock:${docId}`);
    this.clocks.delete(docId);
  }
}

test.each(['persistent', 'connection'] as const)(
  'doc (%s clocks)',
  async scope => {
    const workspaceId = `ws1-${scope}`;
    const doc = new YDoc();
    doc.getMap('test').set('hello', 'world');
    const update = encodeStateAsUpdate(doc);

    const peerADoc = new IndexedDBDocStorage({
      id: workspaceId,
      flavour: 'a',
      type: 'workspace',
    });

    const peerASync = new IndexedDBDocSyncStorage({
      id: workspaceId,
      flavour: 'a',
      type: 'workspace',
    });

    const peerBDoc = new TimestampBlindDocStorage({
      id: workspaceId,
      flavour: 'b',
      type: 'workspace',
    });
    peerBDoc.syncMetadataScope = scope;
    const peerCDoc = new IndexedDBDocStorage({
      id: workspaceId,
      flavour: 'c',
      type: 'workspace',
    });

    const peerA = new SpaceStorage({
      doc: peerADoc,
      docSync: peerASync,
    });
    const peerB = new SpaceStorage({
      doc: peerBDoc,
    });
    const peerC = new SpaceStorage({
      doc: peerCDoc,
    });

    peerA.connect();
    peerB.connect();
    peerC.connect();

    await peerA.waitForConnected();
    await peerB.waitForConnected();
    await peerC.waitForConnected();

    await peerA.get('doc').pushDocUpdate({
      docId: 'doc1',
      bin: update,
    });
    const prioritizedDocId = 'prioritized-doc';
    const localPrioritizedDoc = new YDoc();
    localPrioritizedDoc.getMap('test').set('local', true);
    const localPrioritizedClock = await peerA.get('doc').pushDocUpdate({
      docId: prioritizedDocId,
      bin: encodeStateAsUpdate(localPrioritizedDoc),
    });
    await peerASync.setPeerPushedClock('b', localPrioritizedClock);
    const remotePrioritizedDoc = new YDoc();
    remotePrioritizedDoc.getMap('test').set('remote', true);
    await peerB.get('doc').pushDocUpdate({
      docId: prioritizedDocId,
      bin: encodeStateAsUpdate(remotePrioritizedDoc),
    });
    const rootDoc = new YDoc();
    rootDoc.getMap('meta').set('name', 'Self-host workspace');
    await peerB.get('doc').pushDocUpdate({
      docId: workspaceId,
      bin: encodeStateAsUpdate(rootDoc),
    });

    const sync = new Sync({
      local: peerA,
      remotes: {
        b: peerB,
        c: peerC,
      },
    });
    const removeRootPriority = sync.doc.addPriority(workspaceId, 100);
    const removeForegroundPriority = sync.doc.addPriority('doc1', 200);
    const remoteDiff = vi.spyOn(peerBDoc, 'getDocDiff');
    expect(await firstValueFrom(sync.doc.docState$('doc1'))).toMatchObject({
      synced: false,
    });
    sync.start();

    await new Promise(resolve => setTimeout(resolve, 1000));

    {
      expect(remoteDiff.mock.calls[0]?.[0]).toBe(workspaceId);
      const b = await peerB.get('doc').getDoc('doc1');
      expectYjsEqual(b!.bin, {
        test: {
          hello: 'world',
        },
      });

      const c = await peerC.get('doc').getDoc('doc1');
      expectYjsEqual(c!.bin, {
        test: {
          hello: 'world',
        },
      });

      const root = await peerA.get('doc').getDoc(workspaceId);
      expectYjsEqual(root!.bin, {
        meta: {
          name: 'Self-host workspace',
        },
      });

      const prioritized = await peerA.get('doc').getDoc(prioritizedDocId);
      expectYjsEqual(prioritized!.bin, {
        test: {
          local: true,
          ...(scope === 'connection' ? { remote: true } : {}),
        },
      });
    }

    const removeDocPriority = sync.doc.addPriority(prioritizedDocId, 100);
    await vi.waitFor(async () => {
      const prioritized = await peerA.get('doc').getDoc(prioritizedDocId);
      expectYjsEqual(prioritized!.bin, {
        test: {
          local: true,
          remote: true,
        },
      });
    });

    doc.getMap('test').set('foo', 'bar');
    const update2 = encodeStateAsUpdate(doc);
    await peerC.get('doc').pushDocUpdate({
      docId: 'doc1',
      bin: update2,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    {
      const a = await peerA.get('doc').getDoc('doc1');
      expectYjsEqual(a!.bin, {
        test: {
          hello: 'world',
          foo: 'bar',
        },
      });

      const c = await peerC.get('doc').getDoc('doc1');
      expectYjsEqual(c!.bin, {
        test: {
          hello: 'world',
          foo: 'bar',
        },
      });
    }

    removeDocPriority();
    removeForegroundPriority();
    removeRootPriority();
    await sync.stop();
    peerA.disconnect();
    peerB.disconnect();
    peerC.disconnect();
  }
);

test('blob', async () => {
  const a = new IndexedDBBlobStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const b = new IndexedDBBlobStorage({
    id: 'ws1',
    flavour: 'b',
    type: 'workspace',
  });

  const c = new IndexedDBBlobStorage({
    id: 'ws1',
    flavour: 'c',
    type: 'workspace',
  });

  const blobSync = new IndexedDBBlobSyncStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const peerA = new SpaceStorage({
    blob: a,
    blobSync,
  });
  const peerB = new SpaceStorage({
    blob: b,
  });
  const peerC = new SpaceStorage({
    blob: c,
  });

  peerA.connect();
  peerB.connect();
  peerC.connect();

  await peerA.waitForConnected();
  await peerB.waitForConnected();
  await peerC.waitForConnected();

  await a.set({
    key: 'test',
    data: new Uint8Array([1, 2, 3, 4]),
    mime: 'text/plain',
    createdAt: new Date(100),
  });

  await c.set({
    key: 'test2',
    data: new Uint8Array([4, 3, 2, 1]),
    mime: 'text/plain',
    createdAt: new Date(100),
  });

  const sync = new Sync({
    local: peerA,
    remotes: {
      b: peerB,
      c: peerC,
    },
  });
  sync.start();

  await new Promise(resolve => setTimeout(resolve, 1000));

  {
    const a = await peerA.get('blob').get('test');
    expect(a).not.toBeNull();
    expect(a?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
  }

  {
    const b = await peerB.get('blob').get('test');
    expect(b).not.toBeNull();
    expect(b?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
  }

  {
    const c = await peerC.get('blob').get('test2');
    expect(c).not.toBeNull();
    expect(c?.data).toEqual(new Uint8Array([4, 3, 2, 1]));
  }
  await sync.stop();

  const localReads = vi.spyOn(a, 'get');
  const localLists = vi.spyOn(a, 'list');
  const remoteReads = vi.spyOn(c, 'get');
  await new BlobSyncPeer('c', a, c, blobSync).fullDownload();
  expect(localReads).not.toHaveBeenCalled();
  expect(localLists).toHaveBeenCalledTimes(1);
  expect(remoteReads.mock.calls.map(([key]) => key)).toEqual(['test2']);
  remoteReads.mockRestore();
  localLists.mockClear();

  for (const key of ['fresh', 'retry']) {
    await c.set({ key, data: new Uint8Array([1, 2, 3]), mime: 'text/plain' });
  }
  const entries = await c.list();
  const scoped = Object.assign(c, {
    registerSource: vi.fn(),
    unregisterSource: vi.fn(),
    async *readableSources() {
      for (const entry of entries) {
        for (const docId of ['first', 'second']) {
          yield {
            ...entry,
            source: { type: 'currentDoc' as const, workspaceId: 'ws1', docId },
          };
        }
      }
    },
  });
  const get = c.get.bind(c);
  let retryAttempts = 0;
  const reads = vi.spyOn(c, 'get').mockImplementation(async key => {
    if (key === 'retry' && retryAttempts++ === 0)
      throw new Error('source denied');
    return get(key);
  });
  const inventory = vi
    .spyOn(c, 'list')
    .mockRejectedValue(new Error('cloud inventory forbidden'));
  await new BlobSyncPeer('scoped', a, scoped, blobSync).fullDownload();
  expect(localReads).not.toHaveBeenCalled();
  expect(localLists).toHaveBeenCalledTimes(1);
  expect(inventory).not.toHaveBeenCalled();
  expect(reads.mock.calls.map(([key]) => key)).toEqual([
    'fresh',
    'retry',
    'retry',
  ]);
  localReads.mockRestore();
  expect((await a.get('fresh'))?.data).toEqual(new Uint8Array([1, 2, 3]));
  expect((await a.get('retry'))?.data).toEqual(new Uint8Array([1, 2, 3]));
});

test('doc sync peer stops retrying a doc when remote denies permission', async () => {
  const local = new IndexedDBDocStorage({
    id: 'ws-denied',
    flavour: 'local-denied',
    type: 'workspace',
  });
  const syncMetadata = new IndexedDBDocSyncStorage({
    id: 'ws-denied',
    flavour: 'local-denied',
    type: 'workspace',
  });
  const remote = new PermissionDeniedRemoteDocStorage('ws-denied');
  const peer = new DocSyncPeer('remote-denied', local, syncMetadata, remote);
  const abort = new AbortController();

  local.connection.connect();
  syncMetadata.connection.connect();
  await local.connection.waitForConnected();
  await syncMetadata.connection.waitForConnected();

  const doc = new YDoc();
  doc.getMap('test').set('hello', 'world');
  await local.pushDocUpdate({
    docId: 'doc-denied',
    bin: encodeStateAsUpdate(doc),
  });

  try {
    void peer.mainLoop(abort.signal);

    await vi.waitFor(() => {
      expect(remote.pushCount).toBe(1);
    });

    await vi.waitFor(() => {
      let state:
        | {
            syncing: boolean;
            synced: boolean;
            retrying: boolean;
            errorMessage: string | null;
          }
        | undefined;
      const dispose = peer.docState$('doc-denied').subscribe(next => {
        state = next;
      });
      dispose.unsubscribe();

      expect(state).toMatchObject({
        syncing: false,
        synced: false,
        retrying: false,
        errorMessage: expect.stringContaining('No permission'),
      });
    });

    await vi.waitFor(() => {
      let state:
        | {
            synced: boolean;
            errorMessage: string | null;
          }
        | undefined;
      const dispose = peer.peerState$.subscribe(next => {
        state = next;
      });
      dispose.unsubscribe();

      expect(state).toMatchObject({
        synced: false,
        errorMessage: expect.stringContaining('No permission'),
      });
    });

    await new Promise(resolve => setTimeout(resolve, 1200));
    expect(remote.pushCount).toBe(1);
  } finally {
    abort.abort();
    local.connection.disconnect();
    syncMetadata.connection.disconnect();
  }
});

test('doc sync peer stops retrying when remote connection denies permission', async () => {
  const local = new IndexedDBDocStorage({
    id: 'ws-connection-denied',
    flavour: 'local-connection-denied',
    type: 'workspace',
  });
  const syncMetadata = new IndexedDBDocSyncStorage({
    id: 'ws-connection-denied',
    flavour: 'local-connection-denied',
    type: 'workspace',
  });
  const remote = new PermissionDeniedConnectionDocStorage(
    'ws-connection-denied'
  );
  const peer = new DocSyncPeer(
    'remote-connection-denied',
    local,
    syncMetadata,
    remote
  );
  const abort = new AbortController();

  local.connection.connect();
  syncMetadata.connection.connect();
  await local.connection.waitForConnected();
  await syncMetadata.connection.waitForConnected();

  try {
    void peer.mainLoop(abort.signal);

    await vi.waitFor(() => {
      expect(remote.connection.waitCount).toBe(1);
    });

    await vi.waitFor(() => {
      let state:
        | {
            retrying: boolean;
            errorMessage: string | null;
          }
        | undefined;
      const dispose = peer.peerState$.subscribe(next => {
        state = next;
      });
      dispose.unsubscribe();

      expect(state).toMatchObject({
        retrying: false,
        errorMessage: expect.stringContaining('No permission'),
      });
    });

    await new Promise(resolve => setTimeout(resolve, 1200));
    expect(remote.connection.waitCount).toBe(1);
  } finally {
    abort.abort();
    local.connection.disconnect();
    syncMetadata.connection.disconnect();
  }
});

test('doc sync peer resolves on terminal permission error without abort signal', async () => {
  const local = new IndexedDBDocStorage({
    id: 'ws-connection-denied-no-signal',
    flavour: 'local-connection-denied-no-signal',
    type: 'workspace',
  });
  const syncMetadata = new IndexedDBDocSyncStorage({
    id: 'ws-connection-denied-no-signal',
    flavour: 'local-connection-denied-no-signal',
    type: 'workspace',
  });
  const remote = new PermissionDeniedConnectionDocStorage(
    'ws-connection-denied-no-signal'
  );
  const peer = new DocSyncPeer(
    'remote-connection-denied-no-signal',
    local,
    syncMetadata,
    remote
  );

  local.connection.connect();
  syncMetadata.connection.connect();
  await local.connection.waitForConnected();
  await syncMetadata.connection.waitForConnected();

  try {
    await expect(peer.mainLoop()).resolves.toBeUndefined();
    expect(remote.connection.waitCount).toBe(1);

    let state:
      | {
          retrying: boolean;
          errorMessage: string | null;
        }
      | undefined;
    const dispose = peer.peerState$.subscribe(next => {
      state = next;
    });
    dispose.unsubscribe();

    expect(state).toMatchObject({
      retrying: false,
      errorMessage: expect.stringContaining('No permission'),
    });
  } finally {
    local.connection.disconnect();
    syncMetadata.connection.disconnect();
  }
});

test('indexer defers indexed clock persistence until a refresh happens on delayed refresh storages', async () => {
  const calls: string[] = [];
  const docsInRootDoc = new Map([['doc1', { title: 'Doc 1' }]]);
  const docStorage = new TestDocStorage(
    'workspace-id',
    new Map([['doc1', new Date('2026-01-01T00:00:00.000Z')]]),
    async () => ({
      title: 'Doc 1',
      summary: 'summary',
      blocks: [
        { blockId: 'block-1', flavour: 'affine:image', blob: ['blob-1'] },
      ],
    })
  );
  const indexer = new TrackingIndexerStorage(calls, 30_000);
  const update = vi.spyOn(indexer, 'update');
  const indexerSyncStorage = new TrackingIndexerSyncStorage(calls);
  const sync = new IndexerSyncImpl(
    docStorage,
    {
      local: indexer,
      remotes: {},
    },
    indexerSyncStorage
  );

  vi.spyOn(reader, 'readAllDocsFromRootDoc').mockImplementation(
    () => new Map(docsInRootDoc)
  );

  try {
    sync.start();
    await sync.waitForCompleted();

    const docUpdate = update.mock.calls.find(([table]) => table === 'doc');
    expect(docUpdate).toBeDefined();
    expect([...(docUpdate?.[1].fields ?? [])]).toEqual(
      expect.arrayContaining([
        ['docId', ['doc1']],
        ['title', ['Doc 1']],
        ['summary', ['summary']],
      ])
    );
    expect(calls).not.toContain('setClock:doc1');

    await sync.stop();

    await vi.waitFor(() => {
      expect(calls).toContain('setClock:doc1');
    });

    const lastRefreshIndex = calls.lastIndexOf('refresh');
    const setClockIndex = calls.indexOf('setClock:doc1');

    expect(lastRefreshIndex).toBeGreaterThanOrEqual(0);
    expect(setClockIndex).toBeGreaterThan(lastRefreshIndex);
  } finally {
    await sync.stop();
  }
});

test('indexer completion waits for the current job to finish', async () => {
  const docsInRootDoc = new Map([['doc1', { title: 'Doc 1' }]]);
  const crawlStarted = deferred<void>();
  const releaseCrawl = deferred<void>();
  const docStorage = new TestDocStorage(
    'workspace-id',
    new Map([['doc1', new Date('2026-01-01T00:00:00.000Z')]]),
    async () => {
      crawlStarted.resolve();
      await releaseCrawl.promise;
      return {
        title: 'Doc 1',
        summary: 'summary',
        blocks: [
          { blockId: 'block-1', flavour: 'affine:image', blob: ['blob-1'] },
        ],
      };
    }
  );
  const sync = new IndexerSyncImpl(
    docStorage,
    {
      local: new TrackingIndexerStorage([], 30_000),
      remotes: {},
    },
    new TrackingIndexerSyncStorage([])
  );

  vi.spyOn(reader, 'readAllDocsFromRootDoc').mockImplementation(
    () => new Map(docsInRootDoc)
  );

  try {
    sync.start();
    await crawlStarted.promise;

    let completed = false;
    let docCompleted = false;

    const waitForCompleted = sync.waitForCompleted().then(() => {
      completed = true;
    });
    const waitForDocCompleted = sync.waitForDocCompleted('doc1').then(() => {
      docCompleted = true;
    });

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(completed).toBe(false);
    expect(docCompleted).toBe(false);

    releaseCrawl.resolve();

    await waitForCompleted;
    await waitForDocCompleted;
  } finally {
    await sync.stop();
  }
});

test('indexer priority requests accumulate', async () => {
  const docsInRootDoc = new Map([
    ['doc-low', { title: 'Doc Low' }],
    ['doc-high', { title: 'Doc High' }],
  ]);
  const crawled: string[] = [];
  const rootDocCrawlStarted = deferred<void>();
  const releaseRootDocCrawl = deferred<void>();
  const docStorage = new TestDocStorage(
    'workspace-id',
    new Map([
      ['doc-low', new Date('2026-01-01T00:00:00.000Z')],
      ['doc-high', new Date('2026-01-01T00:00:00.000Z')],
    ]),
    async docId => {
      crawled.push(docId);
      return { title: docId, summary: 'summary', blocks: [] };
    }
  );
  const indexer = new TrackingIndexerStorage([], 30_000);
  // hold the loop inside the root doc crawl, so both docs stay queued while
  // their priorities are changed
  let holding = false;
  vi.spyOn(indexer, 'insert').mockImplementation(async () => {
    if (!holding) {
      holding = true;
      rootDocCrawlStarted.resolve();
      await releaseRootDocCrawl.promise;
    }
  });
  const sync = new IndexerSyncImpl(
    docStorage,
    {
      local: indexer,
      remotes: {},
    },
    new TrackingIndexerSyncStorage([])
  );

  vi.spyOn(reader, 'readAllDocsFromRootDoc').mockImplementation(
    () => new Map(docsInRootDoc)
  );

  try {
    sync.start();
    await rootDocCrawlStarted.promise;

    sync.addPriority('doc-low', 5);
    // two holders on the same doc, one of them goes away
    sync.addPriority('doc-high', 10);
    const releaseSecondHolder = sync.addPriority('doc-high', 10);
    releaseSecondHolder();

    releaseRootDocCrawl.resolve();

    await vi.waitFor(() => {
      expect(crawled).toHaveLength(2);
    });

    // the remaining holder still asked for +10, so `doc-high` must outrank the
    // +5 of `doc-low`
    expect(crawled).toEqual(['doc-high', 'doc-low']);
  } finally {
    releaseRootDocCrawl.resolve();
    await sync.stop();
  }
});

test('connection-scoped readonly peers ignore persisted clocks on every connection', async () => {
  const local = new IndexedDBDocStorage({
    id: 'readonly-epochs',
    flavour: 'local',
    type: 'workspace',
  });
  const metadata = new IndexedDBDocSyncStorage({
    id: 'readonly-epochs',
    flavour: 'local',
    type: 'workspace',
  });
  local.connection.connect();
  metadata.connection.connect();
  await Promise.all([
    local.connection.waitForConnected(),
    metadata.connection.waitForConnected(),
  ]);
  const clock = { docId: 'doc', timestamp: new Date(100) };
  await metadata.setPeerPulledRemoteClock('disk', clock);
  await metadata.setPeerRemoteClock('disk', clock);
  const remote = new TestDocStorage(
    'readonly-epochs',
    new Map([['doc', new Date(1)]]),
    async () => null
  );
  remote.isReadonly = true;
  remote.syncMetadataScope = 'connection';
  const document = new YDoc();
  const diff = vi.spyOn(remote, 'getDocDiff');
  const timestamps = vi.spyOn(remote, 'getDocTimestamps');
  const persisted = vi.spyOn(metadata, 'setPeerPulledRemoteClock');
  const peer = new DocSyncPeer('disk', local, metadata, remote);
  try {
    for (const revision of [1, 2]) {
      document.getMap('test').set('revision', revision);
      diff.mockResolvedValue({
        docId: 'doc',
        missing: encodeStateAsUpdate(document),
        state: encodeStateVector(document),
        timestamp: new Date(1),
      });
      const abort = new AbortController();
      const running = peer.mainLoop(abort.signal);
      try {
        await vi.waitFor(async () => {
          const record = await local.getDoc('doc');
          expect(record).not.toBeNull();
          expectYjsEqual(record!.bin, { test: { revision } });
        });
      } finally {
        abort.abort();
        await running;
      }
    }
    expect(timestamps.mock.calls.every(([after]) => after === undefined)).toBe(
      true
    );
    expect(persisted).not.toHaveBeenCalled();
  } finally {
    local.connection.disconnect();
    metadata.connection.disconnect();
    document.destroy();
  }
});

test.each([0, 7000])(
  'blob stop drains a missing download during backoff at %i ms',
  async elapsed => {
    vi.useFakeTimers();
    const remote = new IndexedDBBlobStorage({
      id: 'missing-backoff',
      flavour: 'remote',
      type: 'workspace',
    });
    const get = vi.spyOn(remote, 'get').mockResolvedValue(null);
    const sync = new BlobSyncImpl(
      { local: new DummyBlobStorage(), remotes: { remote } },
      new DummyBlobSyncStorage()
    );
    const download = sync.downloadBlob('missing');
    const rejected = expect(download).rejects.toMatchObject({
      name: 'AbortError',
    });
    try {
      await vi.advanceTimersByTimeAsync(elapsed);
      const attempts = elapsed === 0 ? 1 : 4;
      expect(get).toHaveBeenCalledTimes(attempts);
      let stopped = false;
      const stopping = sync.stop().then(() => {
        stopped = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(stopped).toBe(true);
      await stopping;
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(8000);
      expect(get).toHaveBeenCalledTimes(attempts);
    } finally {
      await vi.runAllTimersAsync();
      await sync.stop();
      vi.useRealTimers();
    }
  }
);

test('remote replacement preserves subscriptions, priorities, sources and sync instances', async () => {
  const local = new SpaceStorage({
    doc: new IndexedDBDocStorage({
      id: 'reconfigure',
      flavour: 'local',
      type: 'workspace',
    }),
  });
  const remoteDoc = new TimestampBlindDocStorage({
    id: 'reconfigure',
    flavour: 'remote',
    type: 'workspace',
  });
  const awareness = new DummyAwarenessStorage();
  const awarenessSubscribe = vi.spyOn(awareness, 'subscribeUpdate');
  const registerSource = vi.fn(async () => {});
  const remote = new SpaceStorage({
    doc: remoteDoc,
    awareness,
    blob: Object.assign(new DummyBlobStorage(), {
      registerSource,
      unregisterSource: vi.fn(async () => {}),
      async *readableSources() {},
    }),
  });
  local.connect();
  remote.connect();
  await local.waitForConnected();
  await remote.waitForConnected();
  const document = new YDoc();
  document.getMap('test').set('remote', true);
  await remoteDoc.pushDocUpdate({
    docId: 'prioritized',
    bin: encodeStateAsUpdate(document),
  });
  const sync = new Sync({ local, remotes: {} });
  const original = [sync.doc, sync.blob, sync.indexer, sync.awareness];
  const updates: boolean[] = [];
  const subscription = sync.doc
    .docState$('prioritized')
    .subscribe(state => updates.push(state.synced));
  const priority = sync.doc.addPriority('prioritized', 100);
  const awarenessCallback = vi.fn();
  const unsubscribeAwareness = sync.awareness.subscribeUpdate(
    'prioritized',
    awarenessCallback,
    async () => null
  );
  await sync.blob.registerSource({
    type: 'currentDoc',
    workspaceId: 'reconfigure',
    docId: 'prioritized',
  });
  sync.start();
  try {
    await sync.reconfigure({ disk: remote });
    expect([sync.doc, sync.blob, sync.indexer, sync.awareness]).toEqual(
      original
    );
    expect(registerSource).toHaveBeenCalledTimes(1);
    expect(awarenessSubscribe).toHaveBeenCalledWith(
      'prioritized',
      awarenessCallback,
      expect.any(Function)
    );
    await vi.waitFor(async () => {
      const record = await local.get('doc').getDoc('prioritized');
      expect(record).not.toBeNull();
      expectYjsEqual(record!.bin, { test: { remote: true } });
    });
    await vi.waitFor(() => expect(updates.at(-1)).toBe(true));
    await sync.reconfigure({});
    expect(await firstValueFrom(sync.doc.state$)).toMatchObject({
      synced: true,
      total: 0,
    });
  } finally {
    subscription.unsubscribe();
    priority();
    unsubscribeAwareness();
    await sync.stop();
    local.disconnect();
    remote.disconnect();
    document.destroy();
  }
});

test('store opens serialize A to B to A, propagate failures and drain before close', async () => {
  const channel = new MessageChannel();
  const consumer = new OpConsumer<WorkerManagerOps>(channel.port1);
  const register = vi.spyOn(consumer, 'registerAll');
  const manager = new StoreManagerConsumer([]);
  manager.bindConsumer(consumer);
  const handlers = register.mock.calls[0][0];
  const context = { signal: new AbortController().signal };
  const a: StoreInitOptions = { local: {}, remotes: {} };
  const b: StoreInitOptions = { local: {}, remotes: { disk: {} } };
  const gate = deferred();
  const entered = deferred();
  const reconfigure = StoreConsumer.prototype.reconfigure;
  const order: StoreInitOptions[] = [];
  vi.spyOn(StoreConsumer.prototype, 'reconfigure').mockImplementation(
    async function (this: StoreConsumer, options) {
      order.push(options);
      if (options === b) {
        entered.resolve();
        await gate.promise;
      }
      return reconfigure.call(this, options);
    }
  );
  const destroyed = vi.spyOn(StoreConsumer.prototype, 'destroy');
  const channels: MessageChannel[] = [];
  const open = (closeKey: string, options: StoreInitOptions) => {
    const ports = new MessageChannel();
    channels.push(ports);
    return handlers.open(
      { key: 'workspace', closeKey, options, port: ports.port1 },
      context
    );
  };
  try {
    await open('a', a);
    const openingB = open('b', b);
    await entered.promise;
    const openingA = open('a2', a);
    const closingA = handlers.close('a', context);
    const closingB = handlers.close('b', context);
    expect(order).toEqual([b]);
    expect(destroyed).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([openingB, openingA, closingA, closingB]);
    expect(order).toEqual([b, a]);
    await expect(
      open('bad', {
        local: {},
        remotes: {
          disk: {
            doc: {
              name: 'IndexedDBDocStorage',
              opts: { id: 'bad', flavour: 'bad', type: 'workspace' },
            },
          },
        },
      })
    ).rejects.toThrow('not found');
    await open('recovered', a);
    await handlers.close('a2', context);
    await handlers.close('recovered', context);
    expect(destroyed).toHaveBeenCalledTimes(1);
  } finally {
    gate.resolve();
    channel.port1.close();
    channel.port2.close();
    for (const ports of channels) {
      ports.port1.close();
      ports.port2.close();
    }
  }
});
