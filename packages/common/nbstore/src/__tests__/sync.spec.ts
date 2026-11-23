import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';

import * as reader from '@affine/reader';
import { OpClient, OpConsumer } from '@toeverything/infra/op';
import { BehaviorSubject, firstValueFrom, NEVER } from 'rxjs';
import { afterEach, expect, test, vi } from 'vitest';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
  Map as YMap,
  mergeUpdates,
} from 'yjs';

import { DummyConnection } from '../connection';
import { DocFrontend } from '../frontend/doc';
import {
  IndexedDBBlobStorage,
  IndexedDBBlobSyncStorage,
  IndexedDBDocStorage,
  IndexedDBDocSyncStorage,
  IndexedDBIndexerStorage,
} from '../impls/idb';
import { IndexedDBV1DocStorage } from '../impls/idb/v1';
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
  IndexerDocument,
  type IndexerSchema,
  type IndexerStorage,
  IndexerStorageBase,
  IndexerSyncStorageBase,
  type PeerWorkspaceState,
  type Query,
  type SearchOptions,
  type SearchResult,
  SpaceStorage,
  type WorkspaceState,
} from '../storage';
import { DummyAwarenessStorage } from '../storage/dummy/awareness';
import { DummyBlobStorage } from '../storage/dummy/blob';
import { DummyBlobSyncStorage } from '../storage/dummy/blob-sync';
import { Sync } from '../sync';
import { BlobSyncImpl } from '../sync/blob';
import { BlobSyncPeer } from '../sync/blob/peer';
import { DocSyncImpl } from '../sync/doc';
import { DocSyncPeer } from '../sync/doc/peer';
import { IndexerSyncImpl } from '../sync/indexer';
import { StoreClient } from '../worker/client';
import { StoreManagerConsumer } from '../worker/consumer';
import type {
  StoreInitOptions,
  WorkerManagerOps,
  WorkerOps,
} from '../worker/ops';
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
      expect(remoteDiff.mock.calls.some(([id]) => id === workspaceId)).toBe(
        true
      );
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

test.each([
  'permission',
  'local',
  'remote',
  'snapshot',
  'readonly',
  'partial',
] as const)(
  'doc sync peer isolates errors and recovers %s sources',
  async mode => {
    const options = { id: `ws-recovery-${mode}`, type: 'workspace' as const };
    const local = new IndexedDBDocStorage({
      ...options,
      flavour: 'recovery-local',
    });
    const syncMetadata = new IndexedDBDocSyncStorage({
      ...options,
      flavour: 'recovery-local',
    });
    const remote = new IndexedDBDocStorage({
      ...options,
      flavour: 'recovery-remote',
      readonlyMode: mode === 'readonly',
    });
    const peer = new DocSyncPeer('remote', local, syncMetadata, remote);
    const abort = new AbortController();
    const doc = new YDoc();
    const remoteEditor = new YDoc();
    const pending = new YDoc();
    const entered = deferred();
    const release = deferred();
    let hold = false;
    let broken = mode !== 'permission' && mode !== 'snapshot';
    let running: Promise<void> | undefined;

    for (const storage of [local, syncMetadata, remote])
      storage.connection.connect();
    await Promise.all(
      [local, syncMetadata, remote].map(storage =>
        storage.connection.waitForConnected()
      )
    );
    const publish = remote.pushDocUpdate.bind(remote);
    const pushes = vi.spyOn(remote, 'pushDocUpdate');
    const getRemote = remote.getDocDiff.bind(remote);
    vi.spyOn(remote, 'getDocDiff').mockImplementation(async (id, state) => {
      if (id === 'doc-recover') {
        if (mode === 'permission') {
          throw Object.assign(new Error('No permission'), {
            name: 'DOC_ACTION_DENIED',
          });
        }
        if (hold) {
          hold = false;
          entered.resolve();
          await release.promise;
        }
      }
      return getRemote(id, state);
    });
    const getLocal = local.getDoc.bind(local);
    const localReads = vi.spyOn(local, 'getDoc').mockImplementation(id => {
      if (id === 'doc-recover' && broken) throw new Error('invalid_binary');
      return getLocal(id);
    });

    try {
      doc.getMap('test').set('hello', 'world');
      const initial = encodeStateAsUpdate(doc);
      applyUpdate(remoteEditor, initial);
      await local.pushDocUpdate({ docId: 'doc-recover', bin: initial });
      await local.pushDocUpdate({ docId: 'doc-good', bin: initial });
      await publish({ docId: 'doc-recover', bin: initial });
      await publish({ docId: 'doc-good', bin: initial });
      if (mode === 'snapshot') {
        const transaction = local.db.transaction(
          ['snapshots', 'updates'],
          'readwrite'
        );
        await transaction.objectStore('snapshots').put({
          docId: 'doc-recover',
          bin: new Uint8Array([255]),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        for (const update of await transaction
          .objectStore('updates')
          .index('docId')
          .getAll('doc-recover')) {
          await transaction
            .objectStore('updates')
            .delete([update.docId, update.createdAt]);
        }
        await transaction.done;
      }
      if (mode === 'partial') {
        pending.getMap('pending').set('prefix', true);
        const state = encodeStateVector(pending);
        pending.getMap('pending').set('tail', true);
        pending.getMap('pending').delete('prefix');
        await local.pushDocUpdate({
          docId: 'doc-recover',
          bin: encodeStateAsUpdate(pending, state),
        });
      }
      running = peer.mainLoop(abort.signal);
      await vi.waitFor(async () => {
        expect(
          await firstValueFrom(peer.docState$('doc-recover'))
        ).toMatchObject({
          syncing: false,
          synced: false,
          retrying: false,
          errorMessage: expect.stringContaining(
            mode === 'permission' ? 'No permission' : 'invalid_binary'
          ),
        });
        expect(await firstValueFrom(peer.docState$('doc-good'))).toMatchObject({
          synced: true,
        });
      });
      expect(await firstValueFrom(peer.peerState$)).toMatchObject({
        synced: false,
      });

      if (mode === 'readonly') {
        // Empty client state takes the raw remote path; its state vector alone
        // cannot detect this truncated delete set.
        for (const storage of [local, remote]) {
          const transaction = storage.db.transaction(
            ['snapshots', 'updates'],
            'readwrite'
          );
          await transaction.objectStore('snapshots').delete('doc-recover');
          for (const update of await transaction
            .objectStore('updates')
            .index('docId')
            .getAll('doc-recover')) {
            await transaction
              .objectStore('updates')
              .delete([update.docId, update.createdAt]);
          }
          await transaction.done;
        }
        await remote.db.put('snapshots', {
          docId: 'doc-recover',
          bin: new Uint8Array([0, 1]),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        broken = false;
        await publish({ docId: 'doc-recover', bin: new Uint8Array([0, 0]) });
        await vi.waitFor(async () => {
          expect((await getLocal('doc-recover'))?.bin).toEqual(
            new Uint8Array([0, 1])
          );
          expect(
            await firstValueFrom(peer.docState$('doc-recover'))
          ).toMatchObject({
            syncing: false,
            synced: false,
            errorMessage: 'invalid_binary',
          });
        });
        broken = true;
        await local.db.delete('snapshots', 'doc-recover');
        await remote.db.delete('snapshots', 'doc-recover');
      }

      const readsBeforeRetry = localReads.mock.calls.filter(
        ([id]) => id === 'doc-recover'
      ).length;
      doc.getMap('test').set('duringError', true);
      await local.pushDocUpdate({
        docId: 'doc-recover',
        bin: encodeStateAsUpdate(doc),
      });
      await vi.waitFor(async () => {
        if (mode !== 'permission') {
          expect(
            localReads.mock.calls.filter(([id]) => id === 'doc-recover').length
          ).toBeGreaterThan(readsBeforeRetry);
        }
        expect(
          await firstValueFrom(peer.docState$('doc-recover'))
        ).toMatchObject({
          syncing: false,
          synced: false,
          errorMessage: expect.stringContaining(
            mode === 'permission' ? 'No permission' : 'invalid_binary'
          ),
        });
      });
      if (mode === 'permission') {
        await publish({ docId: 'doc-recover', bin: initial });
        expect(
          pushes.mock.calls.filter(([update]) => update.docId === 'doc-recover')
        ).toHaveLength(0);
        return;
      }
      if (mode === 'snapshot') {
        // Preserve edits made while paused; remove only the injected corrupt snapshot.
        await local.db.delete('snapshots', 'doc-recover');
      }
      broken = false;
      if (mode === 'local') {
        await local.pushDocUpdate({
          docId: 'doc-recover',
          bin: encodeStateAsUpdate(doc),
        });
      } else {
        hold = true;
        remoteEditor.getMap('test').set('remoteRepair', true);
        await publish({
          docId: 'doc-recover',
          bin: encodeStateAsUpdate(remoteEditor),
        });
        await entered.promise;
        doc.getMap('test').set('duringRecovery', true);
        await local.pushDocUpdate({
          docId: 'doc-recover',
          bin: encodeStateAsUpdate(doc),
        });
        release.resolve();
      }
      await vi.waitFor(async () => {
        expect(
          await firstValueFrom(peer.docState$('doc-recover'))
        ).toMatchObject({
          synced: true,
          errorMessage: null,
        });
      });
      doc.getMap('test').set('afterRecovery', true);
      await local.pushDocUpdate({
        docId: 'doc-recover',
        bin: encodeStateAsUpdate(doc),
      });
      await vi.waitFor(async () => {
        const actual = new YDoc();
        try {
          applyUpdate(actual, (await remote.getDoc('doc-recover'))!.bin);
          expect(actual.getMap('test').get('duringError')).toBe(
            mode === 'readonly' ? undefined : true
          );
          expect(actual.getMap('test').get('afterRecovery')).toBe(
            mode === 'readonly' ? undefined : true
          );
          if (mode !== 'local' && mode !== 'readonly')
            expect(actual.getMap('test').get('duringRecovery')).toBe(true);
          if (mode === 'partial') {
            expect(actual.store.pendingStructs).not.toBeNull();
            expect(actual.store.pendingDs).not.toBeNull();
          }
        } finally {
          actual.destroy();
        }
      });
      if (mode === 'readonly') {
        expect(pushes).not.toHaveBeenCalled();
      }
    } finally {
      release.resolve();
      abort.abort();
      await running;
      doc.destroy();
      remoteEditor.destroy();
      pending.destroy();
      for (const storage of [local, syncMetadata, remote])
        storage.connection.disconnect();
    }
  }
);

test.each(['DISK_SOURCE_REVIEW_REQUIRED', 'DISK_SOURCE_EXPORT_FAILED'])(
  'source %s pauses only its doc and resumes after source acceptance',
  async errorName => {
    const local = new IndexedDBDocStorage({
      id: 'ws-disk-review',
      flavour: 'local-disk-review',
      type: 'workspace',
    });
    const syncMetadata = new IndexedDBDocSyncStorage({
      id: 'ws-disk-review',
      flavour: 'local-disk-review',
      type: 'workspace',
    });
    const remote = new TestDocStorage(
      'ws-disk-review',
      new Map(),
      async () => null
    );
    const pushRemote = remote.pushDocUpdate.bind(remote);
    let needsReview = true;
    const push = vi
      .spyOn(remote, 'pushDocUpdate')
      .mockImplementation((update, origin) => {
        if (update.docId === 'doc-review' && needsReview) {
          const error = new Error('Review Markdown source candidate');
          error.name = errorName;
          throw error;
        }
        return pushRemote(update, origin);
      });
    const peer = new DocSyncPeer('disk-review', local, syncMetadata, remote);
    const abort = new AbortController();

    local.connection.connect();
    syncMetadata.connection.connect();
    await Promise.all([
      local.connection.waitForConnected(),
      syncMetadata.connection.waitForConnected(),
    ]);
    const doc = new YDoc();
    doc.getMap('test').set('value', 1);
    for (const docId of ['doc-review', 'doc-healthy']) {
      await local.pushDocUpdate({ docId, bin: encodeStateAsUpdate(doc) });
    }

    const running = peer.mainLoop(abort.signal);
    try {
      await vi.waitFor(async () => {
        expect(await remote.getDocTimestamp('doc-healthy')).not.toBeNull();
        let state:
          | { errorMessage: string | null; retrying: boolean }
          | undefined;
        const dispose = peer.docState$('doc-review').subscribe(next => {
          state = next;
        });
        dispose.unsubscribe();
        expect(state?.errorMessage).toContain(
          'Review Markdown source candidate'
        );
        expect(state?.retrying).toBe(false);
      });

      expect((await firstValueFrom(peer.peerState$)).error).toMatchObject({
        docId: 'doc-review',
        name: errorName,
      });
      const attempts = push.mock.calls.filter(
        ([update]) => update.docId === 'doc-review'
      ).length;
      doc.getMap('test').set('value', 2);
      await local.pushDocUpdate({
        docId: 'doc-review',
        bin: encodeStateAsUpdate(doc),
      });
      await vi.waitFor(() => {
        expect(
          push.mock.calls.filter(([update]) => update.docId === 'doc-review')
            .length
        ).toBeGreaterThan(attempts);
      });

      needsReview = false;
      await pushRemote(
        { docId: 'doc-review', bin: new Uint8Array([0, 0]) },
        'disk:source-discovered'
      );
      await vi.waitFor(async () => {
        expect(await remote.getDocTimestamp('doc-review')).not.toBeNull();
        let state: { errorMessage: string | null; synced: boolean } | undefined;
        const dispose = peer.docState$('doc-review').subscribe(next => {
          state = next;
        });
        dispose.unsubscribe();
        expect(state).toMatchObject({ errorMessage: null, synced: true });
      });
    } finally {
      abort.abort();
      await running;
      local.connection.disconnect();
      syncMetadata.connection.disconnect();
      doc.destroy();
    }
  }
);

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

test.each([
  'complete',
  'partial',
  'malformed',
  'empty-id',
  'duplicate',
  'any',
  'meta-sequence',
  'inventory',
  'inventory-partial',
] as const)(
  'indexer defers indexed clocks and reconciles %s root members from durable snapshots',
  async rootMode => {
    const cloud = rootMode === 'inventory' || rootMode === 'inventory-partial';
    const authoritative =
      cloud || rootMode === 'complete' || rootMode === 'any';
    const partialRoot =
      rootMode === 'partial' || rootMode === 'inventory-partial';
    const calls: string[] = [];
    const root = new YDoc();
    const pages = new YArray<YMap<unknown>>();
    root.getMap('meta').set('pages', pages);
    const page = new YMap<unknown>();
    page.set('id', 'doc1');
    page.set('title', 'Doc 1');
    if (cloud) page.set('trash', true);
    pages.push([page]);
    if (
      rootMode === 'malformed' ||
      rootMode === 'empty-id' ||
      rootMode === 'duplicate'
    ) {
      const invalid = new YMap<unknown>();
      invalid.set(
        'id',
        rootMode === 'duplicate' ? 'doc1' : rootMode === 'empty-id' ? '' : 1
      );
      pages.push([invalid]);
    }
    if (rootMode === 'any')
      root.getMap('meta').set('pages', [{ id: 'doc1', title: 'Doc 1' }]);
    const missingPrefix = new YDoc();
    missingPrefix.getMap('unrelated').set('prefix', true);
    const prefixClock = encodeStateVector(missingPrefix);
    missingPrefix.getMap('unrelated').set('tail', true);
    const partial = encodeStateAsUpdate(missingPrefix, prefixClock);
    const sequenceRoot = new YDoc();
    sequenceRoot.getArray('meta').push([{}]);
    const sequence = encodeStateAsUpdate(sequenceRoot);
    let rootBin = mergeUpdates([
      encodeStateAsUpdate(root),
      ...(partialRoot ? [partial] : []),
      ...(rootMode === 'meta-sequence' ? [sequence] : []),
    ]);
    const docStorage = new TestDocStorage(
      'workspace-id',
      new Map([
        ['doc1', new Date('2026-01-01T00:00:00.000Z')],
        ['doc2', new Date('2026-01-01T00:00:00.000Z')],
        ['retained', new Date('2026-01-01T00:00:00.000Z')],
      ]),
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
    const cachedDocs: SearchResult<'doc', { fields: ['docId', 'title'] }> = {
      pagination: { count: 1, limit: 1, skip: 0, hasMore: false },
      nodes: [
        {
          id: 'retained',
          score: 0,
          fields: { docId: 'retained', title: 'Retained' },
        },
      ],
    };
    vi.spyOn(indexer, 'search').mockResolvedValue(cachedDocs);
    const originalGetDoc = docStorage.getDoc.bind(docStorage);
    vi.spyOn(docStorage, 'getDoc').mockImplementation(async docId =>
      docId === 'workspace-id'
        ? { docId, bin: rootBin, timestamp: new Date() }
        : originalGetDoc(docId)
    );
    const indexerSyncStorage = new TrackingIndexerSyncStorage(calls);
    const inventory = new BehaviorSubject<PeerWorkspaceState | null>({
      ready: true,
      cacheToken: 1,
      clocks: {},
      docs: [
        {
          docId: 'doc1',
          timestamp: 1,
          lifecycle: null,
          lifecycleChangedAt: null,
        },
      ],
    });
    const sync = new IndexerSyncImpl(
      docStorage,
      {
        local: indexer,
        remotes: {},
      },
      indexerSyncStorage,
      cloud ? inventory : undefined
    );

    try {
      sync.start();
      await sync.waitForCompleted();

      const docUpdate = update.mock.calls.find(
        ([table, doc]) => table === 'doc' && doc.id === 'doc1'
      );
      expect(docUpdate).toBeDefined();
      expect([...(docUpdate?.[1].fields ?? [])]).toEqual(
        expect.arrayContaining([
          ['docId', ['doc1']],
          ['title', ['Doc 1']],
          ['summary', ['summary']],
        ])
      );
      expect(calls).not.toContain('setClock:doc1');
      expect(calls.includes('delete:doc:retained')).toBe(authoritative);
      expect(calls.includes('insert:block:retained:block-1')).toBe(
        !authoritative
      );
      const timestamps = vi.spyOn(docStorage, 'getDocTimestamp');

      if (rootMode !== 'any') page.set('title', 'Renamed');
      const addedPage = new YMap<unknown>();
      addedPage.set('id', 'doc2');
      if (rootMode !== 'any') pages.push([addedPage]);
      if (rootMode === 'any')
        root
          .getMap('meta')
          .set('pages', [{ id: 'doc1', title: 'Renamed' }, { id: 'doc2' }]);
      rootBin = mergeUpdates([
        encodeStateAsUpdate(root),
        ...(partialRoot ? [partial] : []),
        ...(rootMode === 'meta-sequence' ? [sequence] : []),
      ]);
      await docStorage.pushDocUpdate({
        docId: 'workspace-id',
        bin: encodeStateAsUpdate(new YDoc()),
      });
      if (cloud) {
        await sync.waitForCompleted();
        expect(calls).not.toContain('insert:doc:doc2');
        inventory.next({
          ...inventory.value!,
          docs: [
            ...inventory.value!.docs,
            {
              docId: 'doc2',
              timestamp: 1,
              lifecycle: null,
              lifecycleChangedAt: null,
            },
          ],
        });
      }
      await vi.waitFor(() => {
        expect(calls).toContain('insert:doc:doc2');
        expect(calls).toContain('insert:block:doc2:block-1');
        expect(timestamps.mock.calls.map(([id]) => id)).toEqual(['doc2']);
        expect(update).toHaveBeenCalledWith(
          'doc',
          expect.objectContaining({
            fields: new Map([
              ['docId', ['doc1']],
              ['title', [cloud ? 'Doc 1' : 'Renamed']],
              ['summary', ['summary']],
            ]),
          })
        );
      });
      expect(calls.includes('delete:doc:retained')).toBe(authoritative);
      if (cloud) {
        const bodyTitle = update.mock.calls.find(
          ([table, doc]) => table === 'doc' && doc.id === 'doc2'
        );
        expect([...(bodyTitle?.[1].fields ?? [])]).toEqual(
          expect.arrayContaining([['title', ['Doc 1']]])
        );
      }

      if (rootMode !== 'any') pages.delete(0, 1);
      if (
        rootMode === 'malformed' ||
        rootMode === 'empty-id' ||
        rootMode === 'duplicate'
      )
        pages.delete(0, 1);
      if (rootMode === 'any')
        root.getMap('meta').set('pages', [{ id: 'doc2' }]);
      rootBin = encodeStateAsUpdate(root);
      await docStorage.pushDocUpdate({
        docId: 'workspace-id',
        bin: encodeStateAsUpdate(new YDoc()),
      });
      if (cloud) {
        await sync.waitForCompleted();
        expect(calls).not.toContain('delete:doc:doc1');
        inventory.next({
          ...inventory.value!,
          docs: inventory.value!.docs.filter(doc => doc.docId !== 'doc1'),
        });
      }
      await vi.waitFor(() => {
        expect(calls).toContain('delete:doc:doc1');
        expect(calls).toContain('clearClock:doc1');
        expect(calls).toContain('delete:doc:retained');
      });

      await sync.stop();

      await vi.waitFor(() => {
        expect(calls).toContain('setClock:doc1');
      });

      const setClockIndex = calls.indexOf('setClock:doc1');
      const lastRefreshIndex = calls
        .slice(0, setClockIndex)
        .lastIndexOf('refresh');

      expect(lastRefreshIndex).toBeGreaterThanOrEqual(0);
      expect(setClockIndex).toBeGreaterThan(lastRefreshIndex);
    } finally {
      await sync.stop();
    }
  }
);

test.each([
  'native',
  'fallback',
  'partial',
  'malformed',
  'reader-error',
  'empty',
  'rootless',
  'storage-error',
  'root-read-error',
] as const)(
  'indexer completion waits for the current job and preserves failed %s sources',
  async mode => {
    const readAllBlocksFromDoc = reader.readAllBlocksFromDoc;
    const docsInRootDoc = new Map([
      ['doc1', { title: 'Doc 1' }],
      ['doc2', { title: 'Doc 2' }],
    ]);
    let recovered = false;
    const calls: string[] = [];
    const crawlStarted = deferred<void>();
    const releaseCrawl = deferred<void>();
    const failedParseStarted = deferred<void>();
    const releaseFailedParse = deferred<void>();
    const docStorage = new TestDocStorage(
      'workspace-id',
      new Map([
        ['doc1', new Date('2026-01-01T00:00:00.000Z')],
        ['doc2', new Date('2026-01-01T00:00:00.000Z')],
      ]),
      async docId => {
        if (docId === 'doc1') {
          crawlStarted.resolve();
          await releaseCrawl.promise;
          if (mode !== 'native') throw new Error('Native parser unavailable');
        }
        return {
          title: 'Doc 1',
          summary: 'summary',
          blocks: [
            { blockId: 'block-1', flavour: 'affine:image', blob: ['blob-1'] },
          ],
        };
      }
    );
    const root = new YDoc();
    root.getMap('meta').set(
      'pages',
      [...docsInRootDoc].map(([id, metadata]) => ({ id, ...metadata }))
    );
    const prefix = new YDoc();
    prefix.getMap('test').set('prefix', true);
    const prefixClock = encodeStateVector(prefix);
    prefix.getMap('test').set('tail', true);
    const pendingBin = encodeStateAsUpdate(prefix, prefixClock);
    const rootless = new YDoc();
    const image = new YMap();
    image.set('sys:flavour', 'affine:image');
    image.set('prop:sourceId', 'blob-1');
    rootless.getMap('blocks').set('image', image);
    const getDoc = vi
      .spyOn(docStorage, 'getDoc')
      .mockImplementation(async docId => {
        if (
          docId === 'workspace-id' &&
          mode === 'root-read-error' &&
          !recovered
        )
          throw new Error('invalid_binary');
        if (docId === 'doc1' && mode === 'storage-error' && !recovered)
          throw new Error('invalid_binary');
        const doc = {
          docId,
          bin: encodeStateAsUpdate(
            docId === 'workspace-id' ? root : new YDoc()
          ),
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
        };
        if (docId !== 'doc1' || recovered) return doc;
        return {
          ...doc,
          bin:
            mode === 'partial'
              ? mergeUpdates([
                  readFileSync(
                    `${process.cwd()}/packages/common/reader/__tests__/__fixtures__/test-doc.snapshot.bin`
                  ),
                  pendingBin,
                ])
              : mode === 'malformed'
                ? new Uint8Array([255])
                : mode === 'rootless'
                  ? encodeStateAsUpdate(rootless)
                  : doc.bin,
        };
      });
    const crawl = vi
      .spyOn(reader, 'readAllBlocksFromDoc')
      .mockImplementation(async options => {
        if (mode === 'partial' || mode === 'rootless')
          return readAllBlocksFromDoc(options);
        if (mode === 'reader-error' && !recovered) {
          failedParseStarted.resolve();
          await releaseFailedParse.promise;
          throw new Error('Unreadable blocks');
        }
        if (mode === 'empty') return undefined;
        return { blocks: [], title: 'Doc 1', summary: 'Fallback summary' };
      });
    const indexer = new TrackingIndexerStorage(calls, 0);
    if (mode === 'root-read-error') {
      const cachedDocs: SearchResult<'doc', { fields: ['docId', 'title'] }> = {
        pagination: { count: 2, limit: 2, skip: 0, hasMore: false },
        nodes: [...docsInRootDoc].map(([id, metadata]) => ({
          id,
          score: 0,
          fields: { docId: id, ...metadata },
        })),
      };
      vi.spyOn(indexer, 'search').mockResolvedValue(cachedDocs);
    }
    const deleteBlocks = vi.spyOn(indexer, 'deleteByQuery');
    const metadata = new TrackingIndexerSyncStorage(calls);
    await metadata.setDocIndexedClock({
      docId: 'doc1',
      timestamp: new Date(0),
      indexerVersion: 1,
    });
    calls.length = 0;
    const sync = new IndexerSyncImpl(
      docStorage,
      {
        local: indexer,
        remotes: {},
      },
      metadata
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

      if (mode === 'reader-error') {
        await failedParseStarted.promise;
        expect(await metadata.getDocIndexedClock('doc1')).toMatchObject({
          timestamp: new Date(0),
        });
        expect(
          deleteBlocks.mock.calls.some(
            ([, query]) => 'match' in query && query.match === 'doc1'
          )
        ).toBe(false);
        recovered = true;
        await docStorage.pushDocUpdate({
          docId: 'doc1',
          bin: encodeStateAsUpdate(prefix),
        });
        releaseFailedParse.resolve();
      }
      if (mode === 'malformed' || mode === 'storage-error') {
        await sync.waitForDocCompleted('doc2');
        expect(completed).toBe(false);
        expect(docCompleted).toBe(false);
        expect(await metadata.getDocIndexedClock('doc1')).toMatchObject({
          timestamp: new Date(0),
        });
        expect(
          calls.filter(call => call === 'deleteByQuery:block')
        ).toHaveLength(1);
        expect(crawl).not.toHaveBeenCalled();
        recovered = true;
        await docStorage.pushDocUpdate({
          docId: 'doc1',
          bin: encodeStateAsUpdate(prefix),
        });
      }
      if (mode === 'root-read-error') {
        await waitForDocCompleted;
        await sync.waitForDocCompleted('doc2');
        expect(completed).toBe(false);
        expect(calls).toContain('setClock:doc1');
        expect(calls).toContain('setClock:doc2');
        recovered = true;
        await docStorage.pushDocUpdate({
          docId: 'workspace-id',
          bin: encodeStateAsUpdate(root),
        });
      }
      await waitForCompleted;
      await waitForDocCompleted;
      expect((await firstValueFrom(sync.state$)).errorMessage).toBeNull();
      if (mode === 'partial') {
        expect(crawl).toHaveBeenCalled();
        expect(
          calls.filter(call => call.startsWith('insert:block:doc1:'))
        ).toHaveLength(42);
      }
      if (mode === 'rootless') {
        expect(deleteBlocks).toHaveBeenCalledWith('block', {
          type: 'match',
          field: 'docId',
          match: 'doc1',
        });
        expect(
          calls.filter(call => call.startsWith('insert:block:doc1:'))
        ).toHaveLength(0);
      }
      if (mode === 'native')
        expect(getDoc.mock.calls.map(([id]) => id)).toEqual(['workspace-id']);
      expect(await metadata.getDocIndexedClock('doc1')).toMatchObject({
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      });
    } finally {
      releaseFailedParse.resolve();
      releaseCrawl.resolve();
      await sync.stop();
    }
  }
);

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
  const root = new YDoc();
  root.getMap('meta').set(
    'pages',
    [...docsInRootDoc].map(([id, metadata]) => ({ id, ...metadata }))
  );
  vi.spyOn(docStorage, 'getDoc').mockImplementation(async docId => ({
    docId,
    bin: encodeStateAsUpdate(root),
    timestamp: new Date(0),
  }));
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

test('store opens serialize changes and drain writes before deletion and close', async () => {
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

    const store = new StoreConsumer([IndexedDBDocStorage], {
      local: {
        doc: {
          name: 'IndexedDBDocStorage',
          opts: { id: 'delete-drain', flavour: 'local', type: 'workspace' },
        },
      },
      remotes: {
        cloud: {
          doc: {
            name: 'IndexedDBDocStorage',
            opts: { id: 'delete-drain', flavour: 'remote', type: 'workspace' },
          },
        },
      },
    });
    const clients = [0, 1].map(() => {
      const ports = new MessageChannel();
      channels.push(ports);
      store.bindConsumer(new OpConsumer<WorkerOps>(ports.port1));
      const client = new StoreClient(new OpClient<WorkerOps>(ports.port2));
      client.docFrontend.start();
      return client;
    });
    const disconnects = clients.map(client =>
      vi.spyOn(client.docFrontend, 'disconnectDoc')
    );
    const local = store.docStorage;
    const remote = store.docSync.storages.remotes.cloud;
    const docs = clients.map(() => new YDoc({ guid: 'P' }));
    const rpcEntered = deferred();
    const rpcRelease = deferred();
    const readEntered = deferred();
    const readRelease = deferred();
    const mergeEntered = deferred();
    const mergeRelease = deferred();
    let holdMerge = false;
    const lateFrontend = new DocFrontend(
      clients[1].docFrontend.storage,
      DocSyncImpl.dummy,
      {
        mergeUpdates: async updates => {
          if (holdMerge) {
            holdMerge = false;
            mergeEntered.resolve();
            await mergeRelease.promise;
          }
          return mergeUpdates(updates);
        },
      }
    );
    const lateDoc = new YDoc({ guid: 'P' });
    const otherDoc = new YDoc({ guid: 'other-ui' });
    lateFrontend.start();
    try {
      await local.connection.waitForConnected();
      await remote.connection.waitForConnected();
      const source = new YDoc();
      source.getMap('test').set('content', 'retained');
      await remote.pushDocUpdate({
        docId: 'P',
        bin: encodeStateAsUpdate(source),
      });
      await remote.pushDocUpdate({
        docId: 'G',
        bin: encodeStateAsUpdate(source),
      });
      clients.forEach((client, i) => client.docFrontend.connectDoc(docs[i]));
      await vi.waitFor(async () =>
        expect(await local.getDoc('G')).not.toBeNull()
      );
      await store.docSync.waitForSynced('P');
      await Promise.all(
        clients.map(client => client.docFrontend.waitForUpdated('P'))
      );
      lateFrontend.connectDoc(lateDoc);
      await lateFrontend.waitForDocReady('P');
      await lateFrontend.waitForUpdated('P');
      holdMerge = true;
      lateDoc.getMap('test').set('editing', true);
      await mergeEntered.promise;
      const getDiff = remote.getDocDiff.bind(remote);
      vi.spyOn(remote, 'getDocDiff').mockImplementationOnce(async (...args) => {
        const captured = await getDiff(...args);
        readEntered.resolve();
        await readRelease.promise;
        return captured;
      });
      await remote.pushDocUpdate({ docId: 'P', bin: new Uint8Array() });
      await readEntered.promise;
      const append = local.pushDocUpdate.bind(local);
      vi.spyOn(local, 'pushDocUpdate').mockImplementation(
        async (update, origin) => {
          if (origin === 'held-rpc') {
            rpcEntered.resolve();
            await rpcRelease.promise;
          }
          return append(update, origin);
        }
      );
      const writing = clients[1].docFrontend.storage.pushDocUpdate(
        { docId: 'P', bin: encodeStateAsUpdate(source) },
        'held-rpc'
      );
      await rpcEntered.promise;
      Object.assign(remote, {
        applyDocLifecycle: vi.fn(async () => ({
          timestamp: new Date(),
          deletedDocIds: ['P', 'G'],
        })),
      });
      const purge = vi.spyOn(local, 'deleteDoc');
      const deleting = clients[0].docFrontend.applyDocLifecycle('P', 'delete');
      await vi.waitFor(() => expect(store.docSync.isDeleted('P')).toBe(true));
      await expect(
        clients[1].docFrontend.storage.pushDocUpdate({
          docId: 'P',
          bin: encodeStateAsUpdate(source),
        })
      ).rejects.toMatchObject({ name: 'DOC_DELETED' });
      expect(purge).not.toHaveBeenCalled();
      rpcRelease.resolve();
      await writing;
      expect(purge).not.toHaveBeenCalled();
      readRelease.resolve();
      await deleting;
      mergeRelease.resolve();
      await lateFrontend.waitForUpdated('P');
      otherDoc.getMap('test').set('still-saving', true);
      lateFrontend.connectDoc(otherDoc);
      await lateFrontend.waitForUpdated('other-ui');
      expectYjsEqual((await local.getDoc('other-ui'))!.bin, {
        test: { 'still-saving': true },
      });
      expect(await local.getDoc('P')).toBeNull();
      expect(await local.getDoc('G')).toBeNull();
      await vi.waitFor(() => {
        disconnects.forEach((disconnect, i) =>
          expect(disconnect).toHaveBeenCalledWith(docs[i])
        );
      });
      docs.forEach(doc => doc.getMap('test').set('late', true));
      await clients[1].docFrontend.storage.pushDocUpdate({
        docId: 'other',
        bin: encodeStateAsUpdate(source),
      });
      expect(await local.getDoc('P')).toBeNull();
      expect(await local.getDoc('other')).not.toBeNull();
      source.destroy();
    } finally {
      rpcRelease.resolve();
      readRelease.resolve();
      mergeRelease.resolve();
      lateFrontend.stop();
      lateDoc.destroy();
      otherDoc.destroy();
      clients.forEach(client => client.docFrontend.stop());
      docs.forEach(doc => doc.destroy());
      await store.destroy();
    }
    for (const flavour of ['affine-cloud', 'local']) {
      const legacyStore = new StoreConsumer(
        [IndexedDBDocStorage, IndexedDBV1DocStorage],
        {
          local: {
            doc: {
              name: 'IndexedDBDocStorage',
              opts: { id: `delete-v1-${flavour}`, flavour, type: 'workspace' },
            },
          },
          remotes: {
            v1: {
              doc: {
                name: 'IndexedDBV1DocStorage',
                opts: { id: `delete-v1-${flavour}`, type: 'workspace' },
              },
            },
          },
        }
      );
      const ports = new MessageChannel();
      channels.push(ports);
      legacyStore.bindConsumer(new OpConsumer<WorkerOps>(ports.port1));
      const client = new StoreClient(new OpClient<WorkerOps>(ports.port2));
      const source = new YDoc({ guid: 'local-doc' });
      source.getMap('test').set('content', 'local');
      try {
        await legacyStore.docStorage.connection.waitForConnected();
        await client.docFrontend.storage.pushDocUpdate({
          docId: source.guid,
          bin: encodeStateAsUpdate(source),
        });
        if (flavour === 'local') {
          await client.docFrontend.applyDocLifecycle(source.guid, 'delete');
          expect(await legacyStore.docStorage.getDoc(source.guid)).toBeNull();
        } else {
          await expect(
            client.docFrontend.applyDocLifecycle(source.guid, 'delete')
          ).rejects.toThrow('Document lifecycle is unavailable');
          expect(
            await legacyStore.docStorage.getDoc(source.guid)
          ).not.toBeNull();
        }
      } finally {
        source.destroy();
        await legacyStore.destroy();
      }
    }
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

test.each(['none', 'local', 'remote'])(
  'sync preserves durable updates through %s upload interleavings',
  async evidence => {
    const options = {
      id: `root-notification-order-${evidence}`,
      type: 'workspace' as const,
    };
    const local = new IndexedDBDocStorage({
      ...options,
      flavour: 'root-order-local',
    });
    const remote = new IndexedDBDocStorage({
      ...options,
      flavour: 'root-order-remote',
    });
    const metadata = new IndexedDBDocSyncStorage({
      ...options,
      flavour: 'root-order-metadata',
    });
    let notify: Parameters<DocStorage['subscribeDocUpdate']>[0] | undefined;
    vi.spyOn(local, 'subscribeDocUpdate').mockImplementation(callback => {
      notify = callback;
      return () => {};
    });
    for (const storage of [local, remote, metadata])
      storage.connection.connect();
    await Promise.all(
      [local, remote, metadata].map(storage =>
        storage.connection.waitForConnected()
      )
    );
    const doc = new YDoc();
    doc.getMap('meta').set('name', 'base');
    await local.pushDocUpdate({
      docId: options.id,
      bin: encodeStateAsUpdate(doc),
    });
    const peer = new DocSyncPeer('root-order', local, metadata, remote);
    const abort = new AbortController();
    const running = peer.mainLoop(abort.signal);
    try {
      await vi.waitFor(async () => {
        expectYjsEqual((await remote.getDoc(options.id))!.bin, {
          meta: { name: 'base' },
        });
      });
      await vi.waitFor(async () =>
        expect(
          await metadata.getPeerPushedClock('root-order', options.id)
        ).not.toBeNull()
      );
      const uploading = deferred();
      const release = deferred();
      const push = remote.pushDocUpdate.bind(remote);
      if (evidence !== 'none') {
        vi.spyOn(remote, 'pushDocUpdate').mockImplementationOnce(
          async (update, origin) => {
            uploading.resolve();
            await release.promise;
            return push(update, origin);
          }
        );
      }
      let state = encodeStateVector(doc);
      doc.getMap('meta').set('name', 'A');
      await local.pushDocUpdate({
        docId: options.id,
        bin: encodeStateAsUpdate(doc, state),
      });
      state = encodeStateVector(doc);
      doc.getMap('meta').set('avatar', 'B');
      const update = encodeStateAsUpdate(doc, state);
      const clock = await local.pushDocUpdate({
        docId: options.id,
        bin: update,
      });
      notify!({ docId: options.id, bin: update, timestamp: clock.timestamp });
      if (evidence !== 'none') {
        await uploading.promise;
        doc.getMap('meta').set('duringFlight', evidence);
        if (evidence === 'local') {
          const bin = encodeStateAsUpdate(doc);
          const next = await local.pushDocUpdate({ docId: options.id, bin });
          notify!({ docId: options.id, bin, timestamp: next.timestamp });
        } else {
          await push(
            { docId: options.id, bin: encodeStateAsUpdate(doc) },
            'other-source'
          );
        }
        release.resolve();
      }
      await vi.waitFor(async () => {
        expectYjsEqual((await remote.getDoc(options.id))!.bin, {
          meta: {
            name: 'A',
            avatar: 'B',
            ...(evidence === 'none' ? {} : { duringFlight: evidence }),
          },
        });
        expectYjsEqual((await local.getDoc(options.id))!.bin, {
          meta: {
            name: 'A',
            avatar: 'B',
            ...(evidence === 'none' ? {} : { duringFlight: evidence }),
          },
        });
        let synced = false;
        const state = peer.docState$(options.id).subscribe(value => {
          synced = value.synced;
        });
        state.unsubscribe();
        expect(synced).toBe(true);
      });
    } finally {
      abort.abort();
      await running;
      for (const storage of [local, remote, metadata])
        storage.connection.disconnect();
    }
  }
);

test.each(['same-millisecond', 'clock-backwards', 'transaction-abort'])(
  'IDB preserves %s writes after compaction',
  async mode => {
    const storage = new IndexedDBDocStorage({
      id: `clock-${mode}`,
      flavour: 'clock-regression',
      type: 'workspace',
    });
    storage.connection.connect();
    await storage.connection.waitForConnected();
    const doc = new YDoc();
    const now = new Date('2026-11-10T00:00:00.000Z');
    vi.setSystemTime(now);
    try {
      doc.getMap('meta').set('value', 'first');
      const first = await storage.pushDocUpdate({
        docId: 'doc',
        bin: encodeStateAsUpdate(doc),
      });
      await storage.getDoc('doc');
      if (mode === 'clock-backwards')
        vi.setSystemTime(new Date(now.getTime() - 1000));
      doc.getMap('meta').set('value', 'second');
      if (mode === 'transaction-abort') {
        const transaction = storage.db.transaction('updates', 'readwrite');
        await transaction.store.add({
          docId: 'doc',
          bin: encodeStateAsUpdate(doc),
          createdAt: new Date(first.timestamp.getTime() + 1),
        });
        transaction.commit();
        await transaction.done;
        const listener = vi.fn();
        const unsubscribe = storage.subscribeDocUpdate(listener);
        try {
          await expect(
            storage.pushDocUpdate({
              docId: 'doc',
              bin: encodeStateAsUpdate(doc),
              createForPeer: 'rolled-back-account',
            })
          ).rejects.toMatchObject({ name: 'ConstraintError' });
          expect(listener).not.toHaveBeenCalled();
          expect(
            await storage.db.get('peerClocks', ['rolled-back-account', 'doc'])
          ).toBeUndefined();
          expect((await storage.getDocTimestamp('doc'))?.timestamp).toEqual(
            first.timestamp
          );
        } finally {
          unsubscribe();
        }
        return;
      }
      const second = await storage.pushDocUpdate({
        docId: 'doc',
        bin: encodeStateAsUpdate(doc),
      });
      expect(second.timestamp.getTime()).toBe(first.timestamp.getTime() + 1);
      expect((await storage.getDocTimestamp('doc'))?.timestamp).toEqual(
        second.timestamp
      );
      expectYjsEqual((await storage.getDoc('doc'))!.bin, {
        meta: { value: 'second' },
      });
      expectYjsEqual((await storage.getDoc('doc'))!.bin, {
        meta: { value: 'second' },
      });
    } finally {
      vi.useRealTimers();
      storage.connection.disconnect();
      doc.destroy();
    }
  }
);

test('a recovered connection clears its transient message without masking a subsequent doc error', async () => {
  const options = {
    id: 'reconnect-error-message',
    flavour: 'reconnect-error-message',
    type: 'workspace' as const,
  };
  const local = new IndexedDBDocStorage(options);
  const metadata = new IndexedDBDocSyncStorage(options);
  const remote = new PermissionDeniedRemoteDocStorage(options.id);
  vi.spyOn(remote.connection, 'waitForConnected').mockRejectedValueOnce(
    new Error('temporary connection error')
  );
  local.connection.connect();
  metadata.connection.connect();
  await Promise.all([
    local.connection.waitForConnected(),
    metadata.connection.waitForConnected(),
  ]);
  const doc = new YDoc();
  doc.getMap('test').set('value', 'kept');
  const peer = new DocSyncPeer(
    'reconnect-error-message',
    local,
    metadata,
    remote
  );
  const abort = new AbortController();
  const running = peer.mainLoop(abort.signal);
  try {
    await vi.waitFor(async () => {
      expect((await firstValueFrom(peer.peerState$)).errorMessage).toContain(
        'temporary connection error'
      );
    });
    await vi.waitFor(
      async () => {
        const state = await firstValueFrom(peer.peerState$);
        expect(state.retrying).toBe(false);
        expect(state.errorMessage).toBeNull();
        expect(state.error).toBeUndefined();
      },
      { timeout: 6500 }
    );
    await local.pushDocUpdate({
      docId: 'doc-denied-after-reconnect',
      bin: encodeStateAsUpdate(doc),
    });
    await vi.waitFor(
      async () => {
        const state = await firstValueFrom(peer.peerState$);
        expect(state.errorMessage).toContain('No permission to update doc');
        expect(state.errorMessage).not.toContain('temporary connection error');
        expect(state.retrying).toBe(false);
        expect(state.error?.name).toBe('DOC_ACTION_DENIED');
      },
      { timeout: 6500 }
    );
  } finally {
    abort.abort();
    await running;
    local.connection.disconnect();
    metadata.connection.disconnect();
    doc.destroy();
  }
}, 10000);

test('cloud inventory replaces membership, fences stale installs and preserves explicit offline creates', async () => {
  const options = {
    id: 'inventory-workspace',
    flavour: 'inventory-local',
    type: 'workspace' as const,
  };
  const local = new IndexedDBDocStorage(options);
  const metadata = new IndexedDBDocSyncStorage(options);
  const otherTab = new IndexedDBDocSyncStorage(options);
  const localIndexer = new IndexedDBIndexerStorage(options);
  const remoteStorage = new IndexedDBDocStorage({
    ...options,
    flavour: 'inventory-remote',
  });
  for (const storage of [
    local,
    metadata,
    otherTab,
    remoteStorage,
    localIndexer,
  ])
    storage.connection.connect();
  await Promise.all(
    [local, metadata, otherTab, remoteStorage, localIndexer].map(storage =>
      storage.connection.waitForConnected()
    )
  );
  const body = new YDoc();
  body.getMap('content').set('value', 42);
  const liveClock = await remoteStorage.pushDocUpdate({
    docId: 'live',
    bin: encodeStateAsUpdate(body),
  });
  for (const docId of [
    'orphan-cache',
    'constructor',
    'toString',
    'db$unknown',
    'userdata$other$settings',
    'db$folders',
  ]) {
    await local.pushDocUpdate({ docId, bin: encodeStateAsUpdate(body) });
  }
  let state: WorkspaceState = {
    docs: [
      {
        docId: 'live',
        timestamp: liveClock.timestamp.getTime(),
        lifecycle: null,
        lifecycleChangedAt: null,
      },
    ],
    clocks: {},
  };
  let invalidated: (() => void) | undefined;
  const getState = vi.fn(async () => structuredClone(state));
  const remote = Object.assign(remoteStorage, {
    workspaceStateScope: 'account-a',
    localReservedDocIds: ['db$folders', 'userdata$account-a$settings'],
    getWorkspaceState: getState,
    subscribeWorkspaceStateInvalidation: (callback: () => void) => {
      invalidated = callback;
      return () => {
        invalidated = undefined;
      };
    },
  });
  const originalPush = remote.pushDocUpdate.bind(remote);
  const pushes = vi
    .spyOn(remote, 'pushDocUpdate')
    .mockImplementation(async (update, origin) => {
      const clock = await originalPush(update, origin);
      if (
        update.intent === 'create' &&
        !state.docs.some(doc => doc.docId === update.docId)
      ) {
        state.docs.push({
          docId: update.docId,
          timestamp: clock.timestamp.getTime(),
          lifecycle: null,
          lifecycleChangedAt: null,
        });
      }
      return clock;
    });
  const peer = new DocSyncPeer('cloud', local, metadata, remote);
  const abort = new AbortController();
  const running = peer.mainLoop(abort.signal);
  const pullFetched = deferred();
  const releasePull = deferred();
  try {
    await vi.waitFor(async () => {
      expect(peer.workspaceState$.value?.ready).toBe(true);
      expect(await local.getDoc('live')).not.toBeNull();
      expect((await firstValueFrom(peer.peerState$)).synced).toBe(true);
    });
    await vi.waitFor(async () =>
      expect(await remote.getDoc('db$folders')).not.toBeNull()
    );
    await local.pushDocUpdate({
      docId: 'userdata$account-a$settings',
      bin: encodeStateAsUpdate(body),
    });
    await vi.waitFor(async () =>
      expect(await remote.getDoc('userdata$account-a$settings')).not.toBeNull()
    );
    expect(
      pushes.mock.calls.find(([update]) => update.docId === 'db$folders')?.[0]
        .intent
    ).toBe('update');
    for (const docId of [
      'constructor',
      'toString',
      'db$unknown',
      'userdata$other$settings',
    ]) {
      peer.addPriority(docId, 100);
      expect(await remote.getDoc(docId)).toBeNull();
    }
    peer.addPriority('orphan-cache', 100);
    expect(await remote.getDoc('orphan-cache')).toBeNull();
    expect(
      pushes.mock.calls.some(([update]) => update.docId === 'orphan-cache')
    ).toBe(false);
    await peer.createDoc('created');
    await vi.waitFor(async () => {
      expect(await remote.getDoc('created')).not.toBeNull();
      expect(
        peer.workspaceState$.value?.docs.find(doc => doc.docId === 'created')
          ?.pendingCreate
      ).toBe(false);
    });
    expect(
      pushes.mock.calls.find(([update]) => update.docId === 'created')?.[0]
        .intent
    ).toBe('create');

    await vi.waitFor(async () =>
      expect((await firstValueFrom(peer.peerState$)).synced).toBe(true)
    );
    const getDiff = remote.getDocDiff.bind(remote);
    vi.spyOn(remote, 'getDocDiff').mockImplementationOnce(async (...args) => {
      expect(args[0]).toBe('live');
      const result = await getDiff(...args);
      pullFetched.resolve();
      await releasePull.promise;
      return result;
    });
    await originalPush({ docId: 'live', bin: new Uint8Array([0, 0]) });
    await pullFetched.promise;

    const fetched = deferred();
    const release = deferred();
    getState.mockImplementationOnce(async () => {
      const stale = structuredClone(state);
      fetched.resolve();
      await release.promise;
      return stale;
    });
    const refresh = peer.refreshWorkspaceState();
    await fetched.promise;
    state = {
      docs: [
        {
          docId: 'created',
          timestamp: 2000,
          lifecycle: 'trashed',
          lifecycleChangedAt: 3000,
        },
      ],
      clocks: {},
    };
    await otherTab.invalidatePeerWorkspaceState('account-a', options.id);
    const before = await otherTab.getPeerWorkspaceState(
      'account-a',
      options.id
    );
    expect(
      await otherTab.installPeerWorkspaceState(
        'account-a',
        options.id,
        before.cacheToken,
        state
      )
    ).toBe(true);
    release.resolve();
    await refresh;
    expect(peer.workspaceState$.value?.docs.map(doc => doc.docId)).toEqual([
      'created',
    ]);
    expect(peer.workspaceState$.value?.docs[0].lifecycle).toBe('trashed');
    expect((await firstValueFrom(peer.peerState$)).synced).toBe(false);
    expect((await firstValueFrom(peer.docState$('live'))).synced).toBe(false);
    releasePull.resolve();
    await vi.waitFor(async () =>
      expect((await firstValueFrom(peer.docState$('live'))).synced).toBe(true)
    );
    expect(await local.getDoc('live')).not.toBeNull();
    expect(
      await metadata.getPeerPulledRemoteClock('account-a', 'live')
    ).not.toBeNull();
    expect(
      (await metadata.getPeerWorkspaceState('account-b', options.id)).docs
    ).toEqual([]);
    await originalPush({ docId: 'live', bin: encodeStateAsUpdate(body) });
    invalidated?.();
    await peer.refreshWorkspaceState();
    expect(peer.workspaceState$.value?.docs.map(doc => doc.docId)).toEqual([
      'created',
    ]);
    const denied = Object.assign(new Error('Workspace access revoked'), {
      name: 'SPACE_ACCESS_DENIED',
    });
    getState.mockRejectedValueOnce(denied);
    await expect(peer.refreshWorkspaceState()).rejects.toBe(denied);
    expect(peer.workspaceState$.value?.docs).toEqual([]);
    expect(await local.getDoc('live')).not.toBeNull();
    await peer.refreshWorkspaceState();
    await local.deleteDoc('live');
    expect(await local.getDoc('live')).toBeNull();
  } finally {
    releasePull.resolve();
    abort.abort();
    await running;
  }

  const queryInventory = new BehaviorSubject<PeerWorkspaceState | null>({
    ready: false,
    cacheToken: 0,
    docs: [],
    clocks: {},
  });
  const querySync = new IndexerSyncImpl(
    local,
    { local: localIndexer, remotes: {} },
    new TrackingIndexerSyncStorage([]),
    queryInventory
  );
  const indexWriter: IndexerStorage = localIndexer;
  for (const docId of ['private-a', 'visible-b']) {
    await indexWriter.insert(
      'doc',
      IndexerDocument.from<'doc'>(docId, {
        docId,
        title: docId,
        summary: `${docId}-summary`,
      })
    );
    await indexWriter.insert(
      'block',
      IndexerDocument.from<'block'>(`${docId}:block`, {
        docId,
        blockId: 'block',
        flavour: `${docId}-flavour`,
      })
    );
  }
  await localIndexer.refresh('doc');
  await localIndexer.refresh('block');
  expect(
    (await localIndexer.search('doc', { type: 'all' })).nodes
  ).toHaveLength(2);
  expect((await querySync.search('doc', { type: 'all' })).nodes).toEqual([]);
  queryInventory.next({
    ready: true,
    cacheToken: 1,
    docs: [
      {
        docId: 'visible-b',
        timestamp: 1,
        lifecycle: null,
        lifecycleChangedAt: null,
      },
    ],
    clocks: {},
  });
  const scoped = await querySync.search(
    'doc',
    { type: 'all' },
    { pagination: { limit: 1 }, fields: ['docId', 'summary'] }
  );
  expect(scoped.pagination.count).toBe(1);
  expect(scoped.nodes[0].fields).toMatchObject({
    docId: 'visible-b',
    summary: 'visible-b-summary',
  });
  expect(
    (
      await querySync.aggregate('block', { type: 'all' }, 'flavour')
    ).buckets.map(bucket => bucket.key)
  ).toEqual(['visible-b-flavour']);
  const observed = new BehaviorSubject<string[]>([]);
  const querySubscription = querySync
    .search$('doc', { type: 'all' })
    .subscribe(result => observed.next(result.nodes.map(node => node.id)));
  await vi.waitFor(() => expect(observed.value).toEqual(['visible-b']));
  queryInventory.next({
    ready: true,
    cacheToken: 2,
    docs: [
      {
        docId: 'visible-b',
        timestamp: 1,
        lifecycle: 'trashed',
        lifecycleChangedAt: 2,
      },
    ],
    clocks: {},
  });
  expect(await firstValueFrom(querySync.docTitles$)).toEqual({
    'visible-b': 'visible-b',
  });
  expect((await querySync.search('doc', { type: 'all' })).nodes).toEqual([]);
  queryInventory.next({ ready: true, cacheToken: 3, docs: [], clocks: {} });
  await vi.waitFor(() => expect(observed.value).toEqual([]));
  expect(
    (await localIndexer.search('doc', { type: 'all' })).nodes
  ).toHaveLength(2);
  expect(await firstValueFrom(querySync.docTitles$)).toEqual({});
  querySubscription.unsubscribe();
  queryInventory.complete();
  await querySync.stop();

  const lateFetchStarted = deferred();
  const releaseLateFetch = deferred();
  getState.mockImplementationOnce(async () => {
    lateFetchStarted.resolve();
    await releaseLateFetch.promise;
    return {
      docs: [
        {
          docId: 'late-old-session',
          timestamp: 1,
          lifecycle: null,
          lifecycleChangedAt: null,
        },
      ],
      clocks: {},
    };
  });
  const cached = new DocSyncImpl(
    { local, remotes: { cloud: remote } },
    metadata
  );
  const frontend = new DocFrontend(local, cached);
  const view = new BehaviorSubject<PeerWorkspaceState | null>(null);
  const subscription = frontend.workspaceState$.subscribe(view);
  cached.start();
  try {
    await lateFetchStarted.promise;
    await vi.waitFor(() =>
      expect(view.value?.docs.map(doc => doc.docId)).toEqual(['created'])
    );
    const oldReadStarted = deferred();
    const releaseOldRead = deferred();
    const read = metadata.getPeerWorkspaceState.bind(metadata);
    vi.spyOn(metadata, 'getPeerWorkspaceState').mockImplementationOnce(
      async (...args) => {
        const captured = await read(...args);
        oldReadStarted.resolve();
        await releaseOldRead.promise;
        return captured;
      }
    );
    const olderCreate = frontend.createDoc('offline-retracted');
    expect(
      view.value?.docs.some(doc => doc.docId === 'offline-retracted')
    ).toBe(true);
    await oldReadStarted.promise;
    const beforeConfirm = await read('account-a', options.id);
    await metadata.confirmPeerDocCreate('account-a', 'offline-retracted');
    expect((await read('account-a', options.id)).cacheToken).toBeGreaterThan(
      beforeConfirm.cacheToken
    );
    await frontend.createDoc('offline-created');
    releaseOldRead.resolve();
    await olderCreate;
    expect(
      view.value?.docs.some(doc => doc.docId === 'offline-retracted')
    ).toBe(false);
    expect(view.value?.docs.some(doc => doc.docId === 'offline-created')).toBe(
      true
    );
    expect(
      (await metadata.getPeerWorkspaceState('account-a', options.id)).docs.some(
        doc => doc.docId === 'offline-created' && doc.pendingCreate
      )
    ).toBe(true);
    expect(await local.getDoc('offline-created')).not.toBeNull();
    const beforeDelete = await metadata.getPeerWorkspaceState(
      'account-a',
      options.id
    );
    await local.deleteDoc('offline-created');
    await vi.waitFor(() =>
      expect(
        view.value?.docs.some(doc => doc.docId === 'offline-created')
      ).toBe(false)
    );
    const afterDelete = await metadata.getPeerWorkspaceState(
      'account-a',
      options.id
    );
    expect(afterDelete.cacheToken).toBeGreaterThan(beforeDelete.cacheToken);
    expect(await local.getDoc('offline-created')).toBeNull();
  } finally {
    frontend.stop();
    expect(view.value?.docs).toEqual([]);
    const stopping = cached.stop();
    releaseLateFetch.resolve();
    await stopping;
    expect(view.value?.docs).toEqual([]);
    expect(
      (await metadata.getPeerWorkspaceState('account-a', options.id)).docs.some(
        doc => doc.docId === 'late-old-session'
      )
    ).toBe(false);
    subscription.unsubscribe();
    for (const storage of [local, metadata, otherTab, remote, localIndexer])
      storage.connection.disconnect();
    body.destroy();
  }
});
