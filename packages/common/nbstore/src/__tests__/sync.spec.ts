import 'fake-indexeddb/auto';

import * as reader from '@affine/reader';
import { NEVER } from 'rxjs';
import { afterEach, expect, test, vi } from 'vitest';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVectorFromUpdate,
  Map as YMap,
} from 'yjs';

import {
  type Connection,
  type ConnectionStatus,
  DummyConnection,
} from '../connection';
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
  type DocSyncStorage,
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
import { Sync } from '../sync';
import { DocSyncImpl } from '../sync/doc';
import { DocSyncPeer } from '../sync/doc/peer';
import { IndexerSyncImpl } from '../sync/indexer';
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

class ManualConnection implements Connection<undefined> {
  status: ConnectionStatus = 'connecting';
  readonly inner = undefined;
  error?: Error;
  waitCount = 0;
  private readonly connected = deferred();

  connect(): void {
    this.status = 'connecting';
  }

  disconnect(): void {
    this.status = 'closed';
  }

  waitForConnected(): Promise<void> {
    this.waitCount++;
    if (this.status === 'connected') {
      return Promise.resolve();
    }
    return this.connected.promise;
  }

  onStatusChanged(): () => void {
    return () => {};
  }

  resolveConnected() {
    this.status = 'connected';
    this.connected.resolve();
  }
}

class TestDocSyncStorage implements DocSyncStorage {
  readonly storageType = 'docSync' as const;
  clearClocksCount = 0;

  constructor(
    readonly connection: Connection,
    private readonly clearClocksImpl: () => Promise<void> = async () => {}
  ) {}

  async getPeerRemoteClock(): Promise<DocClock | null> {
    return null;
  }

  async getPeerRemoteClocks(): Promise<DocClocks> {
    return {};
  }

  async setPeerRemoteClock(): Promise<void> {
    return;
  }

  async getPeerPulledRemoteClock(): Promise<DocClock | null> {
    return null;
  }

  async getPeerPulledRemoteClocks(): Promise<DocClocks> {
    return {};
  }

  async setPeerPulledRemoteClock(): Promise<void> {
    return;
  }

  async getPeerPushedClock(): Promise<DocClock | null> {
    return null;
  }

  async getPeerPushedClocks(): Promise<DocClocks> {
    return {};
  }

  async setPeerPushedClock(): Promise<void> {
    return;
  }

  async clearClocks(): Promise<void> {
    this.clearClocksCount++;
    await this.clearClocksImpl();
  }
}

class TestDocStorage implements DocStorage {
  readonly storageType = 'doc' as const;
  readonly connection = new DummyConnection();
  readonly isReadonly = false;
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

  async getDocTimestamps(): Promise<DocClocks> {
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

class TimestampBlindRemoteDocStorage implements DocStorage {
  readonly storageType = 'doc' as const;
  readonly connection = new DummyConnection();
  readonly isReadonly = false;
  loadCount = 0;

  constructor(
    readonly spaceId: string,
    private readonly record: DocRecord
  ) {}

  async getDoc(docId: string): Promise<DocRecord | null> {
    return docId === this.record.docId ? this.record : null;
  }

  async getDocDiff(
    docId: string,
    _state?: Uint8Array
  ): Promise<DocDiff | null> {
    this.loadCount++;
    if (docId !== this.record.docId) {
      return null;
    }
    return {
      docId,
      missing: this.record.bin,
      state: encodeStateVectorFromUpdate(this.record.bin),
      timestamp: this.record.timestamp,
    };
  }

  async pushDocUpdate(update: DocUpdate): Promise<DocClock> {
    return { docId: update.docId, timestamp: this.record.timestamp };
  }

  async getDocTimestamp(docId: string): Promise<DocClock | null> {
    return docId === this.record.docId
      ? { docId, timestamp: this.record.timestamp }
      : null;
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

test('doc reset waits for sync storage and restarts after clear failure', async () => {
  const connection = new ManualConnection();
  const docSyncStorage = new TestDocSyncStorage(connection, async () => {
    throw new Error('clear failed');
  });
  const sync = new DocSyncImpl(
    {
      local: new TestDocStorage('ws1', new Map(), async () => null),
      remotes: {},
    },
    docSyncStorage
  );
  const start = vi.spyOn(sync, 'start');

  sync.start();
  const reset = sync.resetSync();
  await Promise.resolve();

  expect(connection.waitCount).toBe(1);
  expect(docSyncStorage.clearClocksCount).toBe(0);

  connection.resolveConnected();
  await expect(reset).rejects.toThrow('clear failed');

  expect(docSyncStorage.clearClocksCount).toBe(1);
  expect(start).toHaveBeenCalledTimes(2);
});

test('doc sync peer does not publish retrying state after manual abort', async () => {
  const peer = new DocSyncPeer(
    'remote',
    new TestDocStorage('ws1', new Map(), async () => null),
    new TestDocSyncStorage(new DummyConnection()),
    new TestDocStorage('ws1', new Map(), async () => null)
  );
  const states: Array<{ retrying: boolean; synced: boolean }> = [];
  const subscription = peer.peerState$.subscribe(({ retrying, synced }) => {
    states.push({ retrying, synced });
  });
  const abort = new AbortController();

  const running = peer.mainLoop(abort.signal);
  await vi.waitFor(() => {
    expect(states.some(state => state.synced && !state.retrying)).toBe(true);
  });

  abort.abort('manual abort');
  await running;

  expect(states.at(-1)?.retrying).toBe(false);
  subscription.unsubscribe();
});

test('doc', async () => {
  const doc = new YDoc();
  doc.getMap('test').set('hello', 'world');
  const update = encodeStateAsUpdate(doc);

  const peerADoc = new IndexedDBDocStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const peerASync = new IndexedDBDocSyncStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const peerBDoc = new IndexedDBDocStorage({
    id: 'ws1',
    flavour: 'b',
    type: 'workspace',
  });
  const peerCDoc = new IndexedDBDocStorage({
    id: 'ws1',
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
  }

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
});

test('doc sync peer pulls priority docs when remote timestamp list is empty', async () => {
  const workspaceId = 'ws-priority-empty-timestamps';
  const remoteYDoc = new YDoc();
  remoteYDoc.getMap('meta').set('name', 'Self-host workspace');
  const remoteRecord = {
    docId: workspaceId,
    bin: encodeStateAsUpdate(remoteYDoc),
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
  };
  const local = new IndexedDBDocStorage({
    id: workspaceId,
    flavour: 'local-priority',
    type: 'workspace',
  });
  const syncMetadata = new IndexedDBDocSyncStorage({
    id: workspaceId,
    flavour: 'local-priority',
    type: 'workspace',
  });
  const remote = new TimestampBlindRemoteDocStorage(workspaceId, remoteRecord);
  const peer = new DocSyncPeer(
    'remote-empty-timestamps',
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
    peer.addPriority(workspaceId, 100);
    void peer.mainLoop(abort.signal);

    await vi.waitFor(async () => {
      expect(await local.getDoc(workspaceId)).not.toBeNull();
    });

    const pulledRootDoc = await local.getDoc(workspaceId);
    expect(remote.loadCount).toBeGreaterThan(0);
    expectYjsEqual(pulledRootDoc!.bin, {
      meta: {
        name: 'Self-host workspace',
      },
    });
  } finally {
    abort.abort();
    local.connection.disconnect();
    syncMetadata.connection.disconnect();
  }
});

test('doc sync peer refreshes priority docs with stale local data and no remote clock', async () => {
  const workspaceId = 'ws-priority-stale-local';
  const peerId = 'remote-stale-local';
  const remoteTimestamp = new Date('2026-01-02T00:00:00.000Z');

  const localYDoc = new YDoc();
  localYDoc.getMap('meta').set('name', 'Local cached workspace');

  const remoteYDoc = new YDoc();
  remoteYDoc.getMap('meta').set(
    'pages',
    YArray.from([
      new YMap([
        ['id', 'doc-1'],
        ['title', 'Remote doc'],
        ['createDate', remoteTimestamp.getTime()],
        ['tags', new YArray()],
      ]),
    ])
  );

  const local = new IndexedDBDocStorage({
    id: workspaceId,
    flavour: 'local-priority-stale',
    type: 'workspace',
  });
  const syncMetadata = new IndexedDBDocSyncStorage({
    id: workspaceId,
    flavour: 'local-priority-stale',
    type: 'workspace',
  });
  const remote = new TimestampBlindRemoteDocStorage(workspaceId, {
    docId: workspaceId,
    bin: encodeStateAsUpdate(remoteYDoc),
    timestamp: remoteTimestamp,
  });
  const peer = new DocSyncPeer(peerId, local, syncMetadata, remote);
  const abort = new AbortController();

  local.connection.connect();
  syncMetadata.connection.connect();
  await local.connection.waitForConnected();
  await syncMetadata.connection.waitForConnected();
  const localClock = await local.pushDocUpdate({
    docId: workspaceId,
    bin: encodeStateAsUpdate(localYDoc),
  });
  await syncMetadata.setPeerPushedClock(peerId, localClock);

  try {
    peer.addPriority(workspaceId, 100);
    void peer.mainLoop(abort.signal);

    await vi.waitFor(
      async () => {
        expect(remote.loadCount).toBeGreaterThan(0);
        const rootRecord = await local.getDoc(workspaceId);
        expect(rootRecord).not.toBeNull();
        const rootDoc = new YDoc();
        applyUpdate(rootDoc, rootRecord!.bin);
        expect(rootDoc.getMap('meta').get('pages')).toBeInstanceOf(YArray);
      },
      { timeout: 1_000 }
    );

    const pulledRootDoc = await local.getDoc(workspaceId);
    expect(remote.loadCount).toBeGreaterThan(0);
    expectYjsEqual(pulledRootDoc!.bin, {
      meta: {
        name: 'Local cached workspace',
        pages: [
          {
            id: 'doc-1',
            title: 'Remote doc',
            createDate: remoteTimestamp.getTime(),
            tags: [],
          },
        ],
      },
    });
  } finally {
    abort.abort();
    local.connection.disconnect();
    syncMetadata.connection.disconnect();
  }
});

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

    sync.stop();

    await vi.waitFor(() => {
      expect(calls).toContain('setClock:doc1');
    });

    const lastRefreshIndex = calls.lastIndexOf('refresh');
    const setClockIndex = calls.indexOf('setClock:doc1');

    expect(lastRefreshIndex).toBeGreaterThanOrEqual(0);
    expect(setClockIndex).toBeGreaterThan(lastRefreshIndex);
  } finally {
    sync.stop();
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
    sync.stop();
  }
});
