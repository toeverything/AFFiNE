import 'fake-indexeddb/auto';

import * as reader from '@affine/reader';
import { NEVER } from 'rxjs';
import { afterEach, expect, test, vi } from 'vitest';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

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
import { Sync } from '../sync';
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
