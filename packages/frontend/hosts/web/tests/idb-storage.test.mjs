import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bootWebHost, flushBeforeNavigation } from '../src/host.js';
import {
  addLocalWorkspaceId,
  createIdbV1ReadonlyReader,
  createIdbWorkspaceStorage,
  createPendingWriteFlusher,
  formatIdbChannelName,
  formatIdbName,
  getLocalWorkspaceIds,
  getWebPreference,
  IDB_SCHEMA_VERSION,
  IDB_STORE_NAMES,
  LOCAL_WORKSPACE_CHANGED_CHANNEL,
  LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
  removeLocalWorkspaceId,
  setWebPreference,
  V1_CONST_TIMESTAMP,
} from '../src/idb-storage.js';

/**
 * Deterministic key serialization matching IndexedDB scalar, Date, and compound
 * array keys for our W3C-semantics in-memory IDBFactory test harness.
 */
function serializeKey(key) {
  if (key instanceof Date) {
    return `D:${key.getTime()}`;
  }
  if (Array.isArray(key)) {
    return `A:[${key.map(serializeKey).join(',')}]`;
  }
  if (key instanceof ArrayBuffer) {
    return `B:${Buffer.from(key).toString('hex')}`;
  }
  return `${typeof key}:${String(key)}`;
}

function extractKey(value, keyPath) {
  if (Array.isArray(keyPath)) {
    return keyPath.map(part => value[part]);
  }
  return value[keyPath];
}

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: key => {
      map.delete(key);
    },
  };
}

function createBroadcastBus() {
  /** @type {Map<string, Set<{ listeners: Set<Function>, closed: boolean }>>} */
  const channels = new Map();

  class MemoryBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.listeners = new Set();
      this.closed = false;
      if (!channels.has(name)) {
        channels.set(name, new Set());
      }
      channels.get(name).add(this);
    }

    addEventListener(type, fn) {
      if (type === 'message') {
        this.listeners.add(fn);
      }
    }

    removeEventListener(type, fn) {
      if (type === 'message') {
        this.listeners.delete(fn);
      }
    }

    postMessage(data) {
      if (this.closed) {
        return;
      }
      const peers = channels.get(this.name);
      if (!peers) {
        return;
      }
      for (const peer of peers) {
        if (peer === this || peer.closed) {
          continue;
        }
        const event = { data };
        for (const fn of peer.listeners) {
          fn(event);
        }
      }
    }

    close() {
      this.closed = true;
      channels.get(this.name)?.delete(this);
    }
  }

  return MemoryBroadcastChannel;
}

/**
 * In-memory W3C IDBFactory supporting versioned upgrades, compound keyPaths,
 * indexes, `oncomplete`/`onerror`/`onabort` transaction lifecycle, rollback on
 * abort, and deterministic fault injection.
 */
function createMemoryIdbFactory() {
  /** @type {Map<string, { name: string, version: number, stores: Map<string, { name: string, keyPath: any, autoIncrement: boolean, nextId: number, records: Map<string, { key: any, value: any }>, indexes: Map<string, { name: string, keyPath: any, unique: boolean }> }> }>} */
  const dbs = new Map();
  let databasesCalls = 0;
  let nextTxFailure = null;

  function cloneRecordMap(map) {
    return new Map(
      [...map.entries()].map(([k, v]) => [k, { key: v.key, value: v.value }])
    );
  }

  function makeRequest(executor, onSettled) {
    const req = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    };
    queueMicrotask(() => {
      try {
        req.result = executor();
        req.onsuccess?.({ target: req });
        onSettled?.(null);
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
        onSettled?.(err);
      }
    });
    return req;
  }

  function wrapDb(meta) {
    const listeners = new Map();

    const dbApi = {
      get name() {
        return meta.name;
      },
      get version() {
        return meta.version;
      },
      get objectStoreNames() {
        const names = [...meta.stores.keys()];
        return {
          length: names.length,
          contains: name => meta.stores.has(name),
          [Symbol.iterator]: () => names[Symbol.iterator](),
        };
      },
      createObjectStore(name, opts = {}) {
        const storeMeta = {
          name,
          keyPath: opts.keyPath ?? null,
          autoIncrement: Boolean(opts.autoIncrement),
          nextId: 1,
          records: new Map(),
          indexes: new Map(),
        };
        meta.stores.set(name, storeMeta);
        return {
          createIndex(indexName, keyPath, indexOpts = {}) {
            storeMeta.indexes.set(indexName, {
              name: indexName,
              keyPath,
              unique: Boolean(indexOpts.unique),
            });
            return { name: indexName, keyPath };
          },
        };
      },
      transaction(storeNames, mode = 'readonly') {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        for (const name of names) {
          if (!meta.stores.has(name)) {
            throw new Error(`Missing objectStore ${name}`);
          }
        }
        const snapshots = new Map();
        if (mode === 'readwrite') {
          for (const name of names) {
            snapshots.set(name, cloneRecordMap(meta.stores.get(name).records));
          }
        }

        let finished = false;
        let pendingOps = 0;
        let commitRequested = false;

        const tx = {
          mode,
          error: null,
          oncomplete: null,
          onerror: null,
          onabort: null,
          abort(err) {
            if (finished) {
              return;
            }
            finished = true;
            if (mode === 'readwrite') {
              for (const [name, snap] of snapshots.entries()) {
                meta.stores.get(name).records = snap;
              }
            }
            tx.error = err || new Error('Transaction aborted');
            queueMicrotask(() => {
              tx.onabort?.({ target: tx });
            });
          },
          commit() {
            commitRequested = true;
            maybeComplete();
          },
          objectStore(storeName) {
            if (!names.includes(storeName)) {
              throw new Error(`Store ${storeName} not in transaction scope`);
            }
            const storeMeta = meta.stores.get(storeName);

            const track = executor => {
              pendingOps += 1;
              return makeRequest(
                () => {
                  if (finished) {
                    throw new Error('Transaction already finished');
                  }
                  if (mode === 'readwrite' && nextTxFailure) {
                    const err = nextTxFailure;
                    nextTxFailure = null;
                    tx.abort(err);
                    throw err;
                  }
                  return executor();
                },
                err => {
                  pendingOps -= 1;
                  if (err) {
                    if (!finished) {
                      tx.abort(err);
                    }
                  } else {
                    maybeComplete();
                  }
                }
              );
            };

            return {
              get: key =>
                track(() => storeMeta.records.get(serializeKey(key))?.value),
              getAll: () =>
                track(() => [...storeMeta.records.values()].map(r => r.value)),
              getAllKeys: () =>
                track(() => [...storeMeta.records.values()].map(r => r.key)),
              add: (value, explicitKey) =>
                track(() => {
                  if (mode !== 'readwrite') {
                    throw new Error('ReadOnlyError');
                  }
                  const key =
                    explicitKey !== undefined
                      ? explicitKey
                      : storeMeta.keyPath
                        ? extractKey(value, storeMeta.keyPath)
                        : storeMeta.nextId++;
                  const sk = serializeKey(key);
                  if (storeMeta.records.has(sk)) {
                    throw new Error(`ConstraintError: duplicate key ${sk}`);
                  }
                  storeMeta.records.set(sk, { key, value });
                  return key;
                }),
              put: (value, explicitKey) =>
                track(() => {
                  if (mode !== 'readwrite') {
                    throw new Error('ReadOnlyError');
                  }
                  const key =
                    explicitKey !== undefined
                      ? explicitKey
                      : storeMeta.keyPath
                        ? extractKey(value, storeMeta.keyPath)
                        : storeMeta.nextId++;
                  const sk = serializeKey(key);
                  storeMeta.records.set(sk, { key, value });
                  return key;
                }),
              delete: key =>
                track(() => {
                  if (mode !== 'readwrite') {
                    throw new Error('ReadOnlyError');
                  }
                  storeMeta.records.delete(serializeKey(key));
                }),
              index(indexName) {
                const idx = storeMeta.indexes.get(indexName);
                if (!idx) {
                  throw new Error(`Missing index ${indexName} on ${storeName}`);
                }
                return {
                  getAll: queryKey =>
                    track(() => {
                      const target = serializeKey(queryKey);
                      const out = [];
                      for (const { value } of storeMeta.records.values()) {
                        const actual = extractKey(value, idx.keyPath);
                        if (serializeKey(actual) === target) {
                          out.push(value);
                        }
                      }
                      return out;
                    }),
                };
              },
            };
          },
        };

        function maybeComplete() {
          if (finished || pendingOps > 0) {
            return;
          }
          if (commitRequested || mode === 'readonly') {
            finished = true;
            queueMicrotask(() => {
              tx.oncomplete?.({ target: tx });
            });
          }
        }

        // Readonly transactions auto-complete once all microtask ops drain.
        if (mode === 'readonly') {
          queueMicrotask(() => maybeComplete());
        }

        return tx;
      },
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      close() {},
    };

    return dbApi;
  }

  return {
    open(name, version = 1) {
      const req = {
        result: null,
        error: null,
        transaction: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        let meta = dbs.get(name);
        const existed = Boolean(meta);
        const oldVersion = meta ? meta.version : 0;
        if (!meta) {
          meta = { name, version, stores: new Map() };
          dbs.set(name, meta);
        } else if (version > meta.version) {
          meta.version = version;
        }
        const db = wrapDb(meta);
        req.result = db;
        let upgradeAborted = false;
        req.transaction = {
          abort() {
            upgradeAborted = true;
            if (!existed) {
              dbs.delete(name);
            } else {
              meta.version = oldVersion;
            }
          },
        };
        if (oldVersion < version) {
          req.onupgradeneeded?.({
            target: req,
            oldVersion,
            newVersion: version,
          });
        }
        req.transaction = null;
        if (upgradeAborted) {
          req.error = new Error('Upgrade transaction aborted');
          req.onerror?.({ target: req });
          return;
        }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
    async databases() {
      databasesCalls += 1;
      return [...dbs.values()].map(d => ({ name: d.name, version: d.version }));
    },
    getMeta: name => dbs.get(name),
    getDatabasesCallCount: () => databasesCalls,
    failNextWriteTransaction(err) {
      nextTxFailure = err;
    },
  };
}

void test('IDB v3 schema freezes at version 3 with all 12 0.27.5 objectStores and indexes', async () => {
  const idb = createMemoryIdbFactory();
  const BroadcastChannelImpl = createBroadcastBus();
  const storage = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-schema',
    indexedDB: idb,
    BroadcastChannelImpl,
  });

  assert.equal(
    formatIdbName({ flavour: 'local', type: 'workspace', id: 'ws-schema' }),
    'local:workspace:ws-schema'
  );
  assert.equal(
    formatIdbChannelName('local:workspace:ws-schema'),
    'idb:local:workspace:ws-schema'
  );
  assert.equal(IDB_SCHEMA_VERSION, 3);
  assert.equal(IDB_STORE_NAMES.length, 12);

  const db = await storage.open();
  assert.equal(db.version, 3);
  for (const storeName of IDB_STORE_NAMES) {
    assert.ok(
      db.objectStoreNames.contains(storeName),
      `missing 0.27.5 objectStore: ${storeName}`
    );
  }

  const meta = idb.getMeta('local:workspace:ws-schema');
  assert.deepEqual(
    [...meta.stores.get('snapshots').indexes.keys()],
    ['updatedAt']
  );
  assert.deepEqual([...meta.stores.get('updates').indexes.keys()], ['docId']);
  assert.deepEqual(
    [...meta.stores.get('clocks').indexes.keys()],
    ['timestamp']
  );
  assert.deepEqual([...meta.stores.get('peerClocks').indexes.keys()], ['peer']);
  assert.deepEqual([...meta.stores.get('blobSync').indexes.keys()], ['peer']);
  assert.deepEqual(
    [...meta.stores.get('indexerRecords').indexes.keys()],
    ['table', 'id']
  );
  assert.deepEqual(
    [...meta.stores.get('invertedIndex').indexes.keys()],
    ['key', 'nid']
  );

  storage.close();
});

function testMergeFrames(frames) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return encoder.encode(frames.map(f => decoder.decode(f)).join(''));
}

void test('pre-populated 0.27.5 data opens offline, persists 1-char edit, syncs peer clocks, and broadcasts across tabs', async () => {
  const idb = createMemoryIdbFactory();
  const BroadcastChannelImpl = createBroadcastBus();
  let fakeNow = 1_750_000_000_000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const tabA = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-0275',
    indexedDB: idb,
    BroadcastChannelImpl,
    now: () => ++fakeNow,
    mergeUpdates: testMergeFrames,
  });
  const tabB = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-0275',
    indexedDB: idb,
    BroadcastChannelImpl,
    now: () => ++fakeNow,
    mergeUpdates: testMergeFrames,
  });
  const rawOnlyTab = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-0275',
    indexedDB: idb,
    BroadcastChannelImpl,
    now: () => ++fakeNow,
  });

  // Seed realistic 0.27.5 snapshot + blob + peer clock before opening offline.
  const db = await tabA.open();
  const seedTx = db.transaction(
    ['snapshots', 'clocks', 'blobs', 'blobData'],
    'readwrite'
  );
  seedTx.objectStore('snapshots').put({
    docId: 'doc-1',
    bin: encoder.encode('Hello'),
    createdAt: new Date(1_740_000_000_000),
    updatedAt: new Date(1_740_000_000_500),
  });
  seedTx.objectStore('clocks').put({
    docId: 'doc-1',
    timestamp: new Date(1_740_000_000_500),
  });
  seedTx.objectStore('blobs').put({
    key: 'blob-cover',
    mime: 'image/png',
    size: 4,
    createdAt: new Date(1_740_000_000_500),
    deletedAt: null,
  });
  seedTx.objectStore('blobData').put({
    key: 'blob-cover',
    data: new Uint8Array([137, 80, 78, 71]),
  });
  await new Promise((resolve, reject) => {
    seedTx.oncomplete = resolve;
    seedTx.onabort = reject;
    seedTx.commit();
  });

  await tabB.open();
  const tabBReceived = [];
  const unsub = tabB.subscribeDocUpdate((update, origin) => {
    tabBReceived.push({ update, origin });
  });

  // Offline open original document.
  const initialDoc = await tabA.getDoc('doc-1');
  assert.equal(decoder.decode(initialDoc.bin), 'Hello');
  const blob = await tabA.getBlob('blob-cover');
  assert.equal(blob.mime, 'image/png');
  assert.deepEqual([...blob.data], [137, 80, 78, 71]);

  // Append 1-character CRDT edit and persist to same-origin IDB.
  const pushed = await tabA.pushDocUpdate(
    { docId: 'doc-1', bin: encoder.encode('!') },
    'local-editor'
  );
  assert.ok(pushed.timestamp.getTime() > 1_740_000_000_500);

  // Cross-tab BroadcastChannel('idb:local:workspace:ws-0275') delivers update to Tab B.
  assert.equal(tabBReceived.length, 1);
  assert.equal(tabBReceived[0].origin, 'local-editor');
  assert.equal(tabBReceived[0].update.docId, 'doc-1');
  assert.equal(decoder.decode(tabBReceived[0].update.bin), '!');

  // Simulate cloud sync push & indexer sync clocks.
  await tabA.setPeerPushedClock('cloud', {
    docId: 'doc-1',
    timestamp: pushed.timestamp,
  });
  await tabA.setPeerRemoteClock('cloud', {
    docId: 'doc-1',
    timestamp: pushed.timestamp,
  });
  await tabA.setPeerPulledRemoteClock('cloud', {
    docId: 'doc-1',
    timestamp: pushed.timestamp,
  });
  await tabA.setBlobUploadedAt('cloud', 'blob-cover', pushed.timestamp);
  await tabA.setDocIndexedClock({
    docId: 'doc-1',
    timestamp: pushed.timestamp,
    indexerVersion: 2,
  });

  // Without mergeUpdates, getDoc must throw instead of raw-concatenating CRDT frames;
  // getDocRaw returns raw ordered frames for Rust y-octo to apply safely.
  await assert.rejects(() => rawOnlyTab.getDoc('doc-1'), TypeError);
  const rawFrames = await rawOnlyTab.getDocRaw('doc-1');
  assert.equal(decoder.decode(rawFrames.snapshot), 'Hello');
  assert.deepEqual(
    rawFrames.updates.map(u => decoder.decode(u)),
    ['!']
  );

  // Concurrent write during async mergeUpdates must NOT be overwritten/dropped by compact: true.
  let releaseMerge;
  const mergeBarrier = new Promise(resolve => {
    releaseMerge = resolve;
  });
  const compactPromise = tabB.getDoc('doc-1', {
    compact: true,
    mergeUpdates: async frames => {
      await mergeBarrier;
      return testMergeFrames(frames);
    },
  });
  // While compact read->merge is in flight, mutate snapshot concurrently.
  const concurrentDb = await tabA.open();
  const concTx = concurrentDb.transaction('snapshots', 'readwrite');
  concTx.objectStore('snapshots').put({
    docId: 'doc-1',
    bin: encoder.encode('Hello-concurrent'),
    createdAt: new Date(1_740_000_000_000),
    updatedAt: new Date(1_740_000_001_000),
  });
  await new Promise((resolve, reject) => {
    concTx.oncomplete = resolve;
    concTx.onabort = reject;
    concTx.commit();
  });
  releaseMerge();
  const staleRead = await compactPromise;
  assert.equal(decoder.decode(staleRead.bin), 'Hello!');
  // Concurrent snapshot and pending '!' update must both remain intact.
  const afterRace = await rawOnlyTab.getDocRaw('doc-1');
  assert.equal(decoder.decode(afterRace.snapshot), 'Hello-concurrent');
  assert.deepEqual(
    afterRace.updates.map(u => decoder.decode(u)),
    ['!']
  );

  // Tab B reads back merged document with clean compaction and sync clocks consistently.
  const readBack = await tabB.getDoc('doc-1', { compact: true });
  assert.equal(decoder.decode(readBack.bin), 'Hello-concurrent!');
  assert.equal(
    (await tabB.getPeerPushedClock('cloud', 'doc-1')).timestamp.getTime(),
    pushed.timestamp.getTime()
  );
  assert.equal(
    (await tabB.getBlobUploadedAt('cloud', 'blob-cover')).getTime(),
    pushed.timestamp.getTime()
  );
  assert.equal((await tabB.getDocIndexedClock('doc-1')).indexerVersion, 2);

  unsub();
  rawOnlyTab.close();
  tabA.close();
  tabB.close();
});

void test('V1 readonly fallback reads legacy affine-local docs and blobs without creating empty DBs', async () => {
  const idb = createMemoryIdbFactory();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // When no V1 DB exists (even without indexedDB.databases()), reader aborts
  // upgrade, returns null, and creates zero empty DBs.
  const idbNoDatabases = { open: idb.open.bind(idb) };
  const emptyReader = createIdbV1ReadonlyReader({
    workspaceId: 'ws-missing',
    indexedDB: idbNoDatabases,
  });
  assert.equal(emptyReader.readonly, true);
  assert.equal(await emptyReader.getV1Doc('ws-missing'), null);
  assert.equal(await emptyReader.getV1Blob('b1'), null);
  assert.equal(idb.getMeta('affine-local'), undefined);
  assert.equal(idb.getMeta('ws-missing_blob'), undefined);

  // Seed legacy V1 doc DB ('affine-local') and blob DB ('ws-v1_blob').
  const docDb = await new Promise((resolve, reject) => {
    const req = idb.open('affine-local', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('workspace', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const docTx = docDb.transaction('workspace', 'readwrite');
  docTx.objectStore('workspace').put({
    id: 'ws-v1',
    updates: [
      { timestamp: 100, update: encoder.encode('V1-') },
      { timestamp: 200, update: encoder.encode('DOC') },
    ],
  });
  docTx.objectStore('workspace').put({
    id: 'page-subdoc-1',
    updates: [{ timestamp: 250, update: encoder.encode('SUBDOC') }],
  });
  docTx.objectStore('workspace').put({
    id: 'other-ws-subdoc',
    updates: [{ timestamp: 255, update: encoder.encode('OTHER-SUBDOC') }],
  });
  docTx.objectStore('workspace').put({
    id: 'db$ws-v1$page-1',
    updates: [{ timestamp: 300, update: encoder.encode('PAGE') }],
  });
  docTx.objectStore('workspace').put({
    id: 'userdata$u1$ws-v1',
    updates: [{ timestamp: 301, update: encoder.encode('USER') }],
  });
  docTx.objectStore('workspace').put({
    id: 'userdata$u1$ws-v1$doc-9',
    updates: [{ timestamp: 302, update: encoder.encode('USER-DOC') }],
  });
  docTx.objectStore('workspace').put({
    id: 'other-ws',
    updates: [{ timestamp: 400, update: encoder.encode('OTHER') }],
  });
  await new Promise((resolve, reject) => {
    docTx.oncomplete = resolve;
    docTx.onabort = reject;
    docTx.commit();
  });

  const blobDb = await new Promise((resolve, reject) => {
    const req = idb.open('ws-v1_blob', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('blob');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const blobTx = blobDb.transaction('blob', 'readwrite');
  blobTx.objectStore('blob').put(new Uint8Array([1, 2, 3]).buffer, 'img-1');
  await new Promise((resolve, reject) => {
    blobTx.oncomplete = resolve;
    blobTx.onabort = reject;
    blobTx.commit();
  });

  const v1RawOnly = createIdbV1ReadonlyReader({
    workspaceId: 'ws-v1',
    indexedDB: idb,
  });
  await assert.rejects(() => v1RawOnly.getV1Doc('ws-v1'), TypeError);
  const v1Raw = await v1RawOnly.getV1DocRaw('ws-v1');
  assert.deepEqual(
    v1Raw.updates.map(u => decoder.decode(u)),
    ['V1-', 'DOC']
  );

  const v1 = createIdbV1ReadonlyReader({
    workspaceId: 'ws-v1',
    indexedDB: idb,
    mergeUpdates: testMergeFrames,
  });
  const rootDoc = await v1.getV1Doc('ws-v1');
  assert.equal(decoder.decode(rootDoc.bin), 'V1-DOC');
  assert.equal(rootDoc.timestamp.getTime(), V1_CONST_TIMESTAMP.getTime());
  assert.deepEqual(
    await v1.listV1DocIds({
      extractSubdocIds: rootUpdates => {
        assert.equal(rootUpdates.length, 2);
        return ['page-subdoc-1', 'missing-subdoc-999', 'ws-v1'];
      },
    }),
    [
      'ws-v1',
      'page-subdoc-1',
      'db$ws-v1$page-1',
      'userdata$u1$ws-v1',
      'userdata$u1$ws-v1$doc-9',
    ]
  );
  const v1Blob = await v1.getV1Blob('img-1');
  assert.deepEqual([...v1Blob.data], [1, 2, 3]);
});

void test('Iron Rule F1: deleted workspace with leftover IDB has 0 resurrection and never calls indexedDB.databases()', async () => {
  const idb = createMemoryIdbFactory();
  const BroadcastChannelImpl = createBroadcastBus();

  // Both ws-keep and ws-deleted have populated IDB databases on disk.
  const keepStore = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-keep',
    indexedDB: idb,
    BroadcastChannelImpl,
  });
  const deletedStore = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-deleted',
    indexedDB: idb,
    BroadcastChannelImpl,
  });
  await keepStore.open();
  await deletedStore.open();

  // localStorage only lists ws-keep (ws-deleted was removed in 0.27.5).
  const localStorage = createMemoryStorage({
    [LOCAL_WORKSPACE_LOCAL_STORAGE_KEY]: JSON.stringify(['ws-keep']),
  });
  const peerChannel = new BroadcastChannelImpl(LOCAL_WORKSPACE_CHANGED_CHANNEL);
  const myChannel = new BroadcastChannelImpl(LOCAL_WORKSPACE_CHANGED_CHANNEL);
  const notifications = [];
  peerChannel.addEventListener('message', ev => notifications.push(ev.data));

  const listed = getLocalWorkspaceIds(localStorage);
  assert.deepEqual(listed, ['ws-keep']);
  assert.equal(
    idb.getDatabasesCallCount(),
    0,
    'local workspace enumeration must never call indexedDB.databases()'
  );

  addLocalWorkspaceId('ws-new', localStorage, myChannel);
  assert.deepEqual(getLocalWorkspaceIds(localStorage), ['ws-keep', 'ws-new']);
  removeLocalWorkspaceId('ws-keep', localStorage, myChannel);
  assert.deepEqual(getLocalWorkspaceIds(localStorage), ['ws-new']);
  assert.deepEqual(notifications, ['ws-new', 'ws-keep']);

  // Preferences helper reads/writes same-origin localStorage cleanly.
  setWebPreference('affine-theme', 'dark', localStorage);
  assert.equal(getWebPreference('affine-theme', localStorage), 'dark');
  setWebPreference('affine-theme', null, localStorage);
  assert.equal(getWebPreference('affine-theme', localStorage), null);

  peerChannel.close();
  myChannel.close();
  keepStore.close();
  deletedStore.close();
});

void test('real IDB flushBeforeNavigation retains buffered writes and aborts navigation on transaction failure, then succeeds on retry', async () => {
  const idb = createMemoryIdbFactory();
  const BroadcastChannelImpl = createBroadcastBus();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const storage = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-flush',
    indexedDB: idb,
    BroadcastChannelImpl,
    now: () => 1_760_000_000_000,
  });
  const flusher = createPendingWriteFlusher(storage);
  flusher.enqueue({
    docId: 'doc-unsaved',
    bin: encoder.encode('critical-edit'),
    origin: 'editor',
  });
  assert.equal(flusher.pendingCount(), 1);

  // Inject real IDB transaction abort/failure.
  idb.failNextWriteTransaction(new Error('QuotaExceededError'));
  const events = [];
  const aborted = await flushBeforeNavigation({
    pauseInput: () => events.push('pause'),
    flushPendingWrites: () => flusher.flush(),
    navigate: url => events.push(`nav:${url}`),
    resumeInput: () => events.push('resume'),
    targetUrl: '/sign-in',
  });

  assert.equal(aborted.navigated, false);
  assert.equal(aborted.reason, 'flush-rejected');
  assert.deepEqual(events, ['pause', 'resume']);
  assert.equal(
    flusher.pendingCount(),
    1,
    'failed IDB flush must retain pending CRDT writes in buffer'
  );
  assert.equal(await storage.getDoc('doc-unsaved'), null);

  // Retry without fault -> commits to IDB oncomplete, drains buffer, navigates.
  const retryEvents = [];
  const ok = await flushBeforeNavigation({
    pauseInput: () => retryEvents.push('pause'),
    flushPendingWrites: () => flusher.flush(),
    navigate: url => retryEvents.push(`nav:${url}`),
    resumeInput: () => retryEvents.push('resume'),
    targetUrl: '/sign-in',
  });

  assert.deepEqual(ok, { navigated: true });
  assert.deepEqual(retryEvents, ['pause', 'nav:/sign-in']);
  assert.equal(flusher.pendingCount(), 0);
  const persisted = await storage.getDoc('doc-unsaved');
  assert.equal(decoder.decode(persisted.bin), 'critical-edit');

  // Verify bootWebHost wires real IDB pendingWrites into navigateWithFlush.
  const assigned = [];
  const fakeIme = { readOnly: false, tabIndex: 0, blur() {} };
  const host = await bootWebHost({
    win: {
      navigator: { gpu: {} },
      location: {
        href: 'https://app.affine.pro/workspace/ws-flush/doc-unsaved',
        assign: url => assigned.push(url),
      },
      localStorage: createMemoryStorage({
        [LOCAL_WORKSPACE_LOCAL_STORAGE_KEY]: JSON.stringify(['ws-flush']),
      }),
    },
    doc: {
      createElement: () => ({ getContext: () => ({}) }),
      getElementById(id) {
        if (id === 'affine-build-manifest') {
          return {
            textContent: JSON.stringify({
              shellVersion: 'mobile-v1',
              buildHash: 'test-hash',
              appEntryJs: null,
              workers: {},
              fonts: {},
            }),
          };
        }
        if (id === 'ime') return fakeIme;
        return null;
      },
    },
    workspaceStorage: storage,
    BroadcastChannelImpl,
  });

  // Verify bootWebHost broadcasts and subscribes local workspace list changes.
  const peerListChannel = new BroadcastChannelImpl(
    LOCAL_WORKSPACE_CHANGED_CHANNEL
  );
  const peerNotices = [];
  peerListChannel.addEventListener('message', ev => peerNotices.push(ev.data));
  const hostNotices = [];
  const unsubHostList = host.subscribeLocalWorkspaceIds((ids, changedId) => {
    hostNotices.push({ ids, changedId });
  });
  host.setLocalWorkspaceIds(['ws-flush', 'ws-extra'], 'ws-extra');
  assert.deepEqual(peerNotices, ['ws-extra']);
  peerListChannel.postMessage('ws-peer');
  assert.equal(hostNotices.length, 1);
  assert.equal(hostNotices[0].changedId, 'ws-peer');
  assert.deepEqual(hostNotices[0].ids, ['ws-flush', 'ws-extra']);
  unsubHostList();
  peerListChannel.close();

  host.pendingWrites.enqueue({
    docId: 'doc-nav',
    bin: encoder.encode('nav-edit'),
  });
  const navRes = await host.navigateWithFlush('/sign-in');
  assert.deepEqual(navRes, { navigated: true });
  assert.deepEqual(assigned, ['/sign-in']);
  assert.equal(
    decoder.decode((await storage.getDoc('doc-nav')).bin),
    'nav-edit'
  );

  host.dispose();
});

void test('single-flight overlapping flush, compactDocWithMerged CAS, built-in Yjs v1 subdoc extractor, and attachWorkspace', async () => {
  const idb = createMemoryIdbFactory();
  const BroadcastChannelImpl = createBroadcastBus();
  let fakeNow = 1_770_000_000_000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const storage = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-r4',
    indexedDB: idb,
    BroadcastChannelImpl,
    now: () => ++fakeNow,
  });

  // 1. Overlapping flush() + concurrent enqueue('c') persists all 3 items once each with 0 drops.
  const flusher = createPendingWriteFlusher(storage);
  flusher.enqueue({ docId: 'd-a', bin: encoder.encode('a') });
  flusher.enqueue({ docId: 'd-b', bin: encoder.encode('b') });
  const p1 = flusher.flush();
  const p2 = flusher.flush();
  flusher.enqueue({ docId: 'd-c', bin: encoder.encode('c') });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(flusher.pendingCount(), 0);
  assert.equal((await storage.getDocRaw('d-a')).updates.length, 1);
  assert.equal((await storage.getDocRaw('d-b')).updates.length, 1);
  assert.equal((await storage.getDocRaw('d-c')).updates.length, 1);

  // 2. compactDocWithMerged requires explicit finite coveredUpTo, compacts on CAS match, and skips on mismatch.
  await assert.rejects(
    () =>
      storage.compactDocWithMerged({
        docId: 'd-a',
        mergedBin: encoder.encode('no-cutoff'),
        expectedUpdatedAt: null,
      }),
    TypeError
  );
  const beforeCompact = await storage.getDocRaw('d-a');
  const compacted = await storage.compactDocWithMerged({
    docId: 'd-a',
    mergedBin: encoder.encode('a-merged'),
    expectedUpdatedAt: null,
    coveredUpTo: beforeCompact.timestamp,
  });
  assert.equal(compacted.compacted, true);
  const afterCompact = await storage.getDocRaw('d-a');
  assert.equal(decoder.decode(afterCompact.snapshot), 'a-merged');
  assert.equal(afterCompact.updates.length, 0);
  const staleCompact = await storage.compactDocWithMerged({
    docId: 'd-a',
    mergedBin: encoder.encode('stale'),
    expectedUpdatedAt: new Date(1),
    coveredUpTo: beforeCompact.timestamp,
  });
  assert.equal(staleCompact.compacted, false);

  // 3. Built-in pure-JS Yjs v1 ContentDoc subdoc extractor discovers top-level subdoc GUID without external callback.
  const encStr = str => {
    const b = encoder.encode(str);
    return [b.byteLength, ...b];
  };
  const yjsV1Root = new Uint8Array([
    1, // numClients
    1, // numStructs
    1, // clientId
    0, // clock
    0x20 | 9, // hasParentSub | ContentDoc (tag=9)
    1, // hasParentYKey
    ...encStr('spaces'),
    ...encStr('page-1'),
    ...encStr('guid-page-1'),
    126, // lib0 null opts
    0, // empty DeleteSet (numDsClients = 0)
  ]);
  const v1Db = await new Promise((resolve, reject) => {
    const req = idb.open('affine-local', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('workspace', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const v1Tx = v1Db.transaction('workspace', 'readwrite');
  v1Tx.objectStore('workspace').put({
    id: 'ws-yjs-v1',
    updates: [{ timestamp: 1, update: yjsV1Root }],
  });
  v1Tx.objectStore('workspace').put({
    id: 'guid-page-1',
    updates: [{ timestamp: 2, update: encoder.encode('body') }],
  });
  await new Promise((resolve, reject) => {
    v1Tx.oncomplete = resolve;
    v1Tx.onabort = reject;
    v1Tx.commit();
  });
  const defaultV1 = createIdbV1ReadonlyReader({
    workspaceId: 'ws-yjs-v1',
    indexedDB: idb,
  });
  assert.deepEqual(await defaultV1.listV1DocIds(), [
    'ws-yjs-v1',
    'guid-page-1',
  ]);

  // 4. bootWebHost unbound -> attachWorkspace dynamically binds storage & flusher.
  const host = await bootWebHost({
    win: {
      navigator: { gpu: {} },
      location: { href: 'https://app.affine.pro/', assign() {} },
    },
    doc: {
      createElement: () => ({ getContext: () => ({}) }),
      getElementById: id =>
        id === 'affine-build-manifest'
          ? {
              textContent: JSON.stringify({
                shellVersion: 'mobile-v1',
                buildHash: 'r4',
                appEntryJs: null,
                workers: {},
                fonts: {},
              }),
            }
          : null,
    },
    indexedDB: idb,
    BroadcastChannelImpl,
  });
  assert.equal(host.workspaceBound, false);
  host.attachWorkspace({
    peer: 'local',
    spaceType: 'workspace',
    spaceId: 'ws-dyn',
  });
  assert.equal(host.workspaceBound, true);
  assert.equal(host.workspaceStorage.dbName, 'local:workspace:ws-dyn');

  // attachWorkspace refuses to discard unflushed writes; switchWorkspace flushes first.
  host.pendingWrites.enqueue({ docId: 'doc-switch', bin: encoder.encode('s') });
  assert.throws(
    () =>
      host.attachWorkspace({
        peer: 'local',
        spaceType: 'workspace',
        spaceId: 'ws-dyn-2',
      }),
    /unflushed/
  );
  const prevStorage = host.workspaceStorage;
  await host.switchWorkspace({
    peer: 'local',
    spaceType: 'workspace',
    spaceId: 'ws-dyn-2',
  });
  assert.equal(host.workspaceStorage.dbName, 'local:workspace:ws-dyn-2');
  const prevCheck = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-dyn',
    indexedDB: idb,
    BroadcastChannelImpl,
  });
  assert.equal((await prevCheck.getDocRaw('doc-switch')).updates.length, 1);
  prevCheck.close();
  prevStorage.close();
  host.dispose();
  storage.close();
});

// Genuine Yjs v1 binary fixtures generated offline with `yjs` (zero runtime dependency).
const REAL_YJS_FIXTURES = {
  // 1. meta.name renamed twice, then 2 pages created (merged single snapshot)
  renamedTwiceTwoPages: new Uint8Array([
    1, 11, 101, 0, 33, 1, 4, 109, 101, 116, 97, 4, 110, 97, 109, 101, 1, 168,
    101, 0, 1, 119, 12, 87, 111, 114, 107, 115, 112, 97, 99, 101, 32, 118, 50,
    39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 101, 2, 1,
    40, 0, 101, 3, 2, 105, 100, 1, 119, 6, 112, 97, 103, 101, 45, 49, 40, 0,
    101, 3, 5, 116, 105, 116, 108, 101, 1, 119, 8, 80, 97, 103, 101, 32, 79,
    110, 101, 135, 101, 3, 1, 40, 0, 101, 6, 2, 105, 100, 1, 119, 6, 112, 97,
    103, 101, 45, 50, 40, 0, 101, 6, 5, 116, 105, 116, 108, 101, 1, 119, 8, 80,
    97, 103, 101, 32, 84, 119, 111, 41, 1, 6, 115, 112, 97, 99, 101, 115, 6,
    112, 97, 103, 101, 45, 49, 13, 103, 117, 105, 100, 45, 99, 97, 115, 101, 49,
    45, 112, 49, 118, 0, 41, 1, 6, 115, 112, 97, 99, 101, 115, 6, 112, 97, 103,
    101, 45, 50, 13, 103, 117, 105, 100, 45, 99, 97, 115, 101, 49, 45, 112, 50,
    118, 0, 1, 101, 1, 0, 1,
  ]),
  // 2. p1 created, meta.pages[0].title edited twice, then p2 created
  titleEditedTwiceThenP2: new Uint8Array([
    1, 11, 102, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7,
    0, 102, 0, 1, 40, 0, 102, 1, 2, 105, 100, 1, 119, 2, 112, 49, 33, 0, 102, 1,
    5, 116, 105, 116, 108, 101, 1, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112,
    49, 13, 103, 117, 105, 100, 45, 99, 97, 115, 101, 50, 45, 112, 49, 118, 0,
    161, 102, 3, 1, 168, 102, 5, 1, 119, 11, 70, 105, 110, 97, 108, 32, 84, 105,
    116, 108, 101, 135, 102, 1, 1, 40, 0, 102, 7, 2, 105, 100, 1, 119, 2, 112,
    50, 40, 0, 102, 7, 5, 116, 105, 116, 108, 101, 1, 119, 11, 83, 101, 99, 111,
    110, 100, 32, 80, 97, 103, 101, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2,
    112, 50, 13, 103, 117, 105, 100, 45, 99, 97, 115, 101, 50, 45, 112, 50, 118,
    0, 1, 102, 2, 3, 1, 5, 1,
  ]),
  // 3. Y.XmlFragment + Y.XmlElement in root doc before page creation
  xmlFragmentBeforePage: new Uint8Array([
    1, 7, 103, 0, 39, 1, 4, 109, 101, 116, 97, 5, 110, 111, 116, 101, 115, 4, 7,
    0, 103, 0, 3, 9, 112, 97, 114, 97, 103, 114, 97, 112, 104, 39, 1, 4, 109,
    101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 103, 2, 1, 40, 0, 103, 3,
    2, 105, 100, 1, 119, 5, 112, 45, 120, 109, 108, 40, 0, 103, 3, 5, 116, 105,
    116, 108, 101, 1, 119, 17, 65, 102, 116, 101, 114, 32, 88, 109, 108, 70,
    114, 97, 103, 109, 101, 110, 116, 41, 1, 6, 115, 112, 97, 99, 101, 115, 5,
    112, 45, 120, 109, 108, 14, 103, 117, 105, 100, 45, 99, 97, 115, 101, 51,
    45, 120, 109, 108, 118, 0, 0,
  ]),
  // 4a. spaces.set('p1', oldDoc) overwritten by liveDoc + foreignDoc in otherMap (merged snapshot)
  overwrittenAndForeignSnapshot: new Uint8Array([
    1, 7, 104, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7,
    0, 104, 0, 1, 40, 0, 104, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 104, 1,
    5, 116, 105, 116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103,
    101, 33, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 1, 169, 104, 4, 9,
    108, 105, 118, 101, 45, 103, 117, 105, 100, 118, 0, 41, 1, 8, 111, 116, 104,
    101, 114, 77, 97, 112, 7, 102, 111, 114, 101, 105, 103, 110, 12, 102, 111,
    114, 101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0, 1, 104, 1, 4, 1,
  ]),
  // 4b. Multi-frame incremental updates where update[1] DeleteSet deletes update[0]'s old-guid
  overwrittenAndForeignIncremental: [
    new Uint8Array([
      1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0,
      7, 0, 105, 0, 1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0,
      105, 1, 5, 116, 105, 116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80,
      97, 103, 101, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 8, 111,
      108, 100, 45, 103, 117, 105, 100, 118, 0, 41, 1, 8, 111, 116, 104, 101,
      114, 77, 97, 112, 7, 102, 111, 114, 101, 105, 103, 110, 12, 102, 111, 114,
      101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0, 0,
    ]),
    new Uint8Array([
      1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100,
      118, 0, 1, 105, 1, 4, 1,
    ]),
  ],
  // 5. meta.pages had p1 then deleted all pages while spaces still holds p1 -> must return []
  emptyPagesWithOrphanSpace: new Uint8Array([
    1, 4, 106, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 1,
    0, 106, 0, 1, 0, 1, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 11,
    111, 114, 112, 104, 97, 110, 45, 103, 117, 105, 100, 118, 0, 1, 106, 1, 1,
    2,
  ]),
};

void test('real Yjs v1 binary fixtures decode overwrites, Y.XmlFragment, DeleteSet live spaces, and 3/4-segment userdata keys', async () => {
  const { extractYjsV1SubdocIds } = await import('../src/idb-storage.js');

  assert.deepEqual(
    extractYjsV1SubdocIds([REAL_YJS_FIXTURES.renamedTwiceTwoPages]),
    ['guid-case1-p1', 'guid-case1-p2']
  );
  assert.deepEqual(
    extractYjsV1SubdocIds([REAL_YJS_FIXTURES.titleEditedTwiceThenP2]),
    ['guid-case2-p1', 'guid-case2-p2']
  );
  assert.deepEqual(
    extractYjsV1SubdocIds([REAL_YJS_FIXTURES.xmlFragmentBeforePage]),
    ['guid-case3-xml']
  );
  assert.deepEqual(
    extractYjsV1SubdocIds([REAL_YJS_FIXTURES.overwrittenAndForeignSnapshot]),
    ['live-guid']
  );
  assert.deepEqual(
    extractYjsV1SubdocIds(REAL_YJS_FIXTURES.overwrittenAndForeignIncremental),
    ['live-guid']
  );
  assert.deepEqual(
    extractYjsV1SubdocIds([REAL_YJS_FIXTURES.emptyPagesWithOrphanSpace]),
    []
  );
  // Malformed/truncated frames (including missing trailing DeleteSet) must throw RangeError.
  assert.throws(
    () => extractYjsV1SubdocIds([new Uint8Array([1, 1, 1, 0, 0x20 | 9, 1])]),
    RangeError
  );
  assert.throws(
    () =>
      extractYjsV1SubdocIds([
        REAL_YJS_FIXTURES.overwrittenAndForeignSnapshot.subarray(
          0,
          REAL_YJS_FIXTURES.overwrittenAndForeignSnapshot.byteLength - 5
        ),
      ]),
    RangeError
  );

  // Concurrent Y.Map overwrite (client 21 -> g21 vs client 42 -> g42): both arrival orders yield ONLY g42.
  const { extractYjsV1SubdocEntries } = await import('../src/idb-storage.js');
  const encStr = str => {
    const b = new TextEncoder().encode(str);
    return [b.byteLength, ...b];
  };
  const concurrent21 = new Uint8Array([
    1,
    1,
    21,
    0,
    0x20 | 9,
    1,
    ...encStr('spaces'),
    ...encStr('p'),
    ...encStr('g21'),
    126,
    0,
  ]);
  const concurrent42 = new Uint8Array([
    1,
    1,
    42,
    0,
    0x20 | 9,
    1,
    ...encStr('spaces'),
    ...encStr('p'),
    ...encStr('g42'),
    126,
    0,
  ]);
  for (const pair of [
    [concurrent21, concurrent42],
    [concurrent42, concurrent21],
  ]) {
    const out = extractYjsV1SubdocEntries(pair);
    assert.deepEqual(out.guids, ['g42']);
    assert.equal(out.pageIdToGuid.get('p'), 'g42');
  }

  // Verify listV1DocIds matches both 3-segment (userdata$u$ws) and 4-segment (userdata$u$ws$fav) keys.
  const idb = createMemoryIdbFactory();
  const encoder = new TextEncoder();
  const v1Db = await new Promise((resolve, reject) => {
    const req = idb.open('affine-local', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('workspace', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = v1Db.transaction('workspace', 'readwrite');
  tx.objectStore('workspace').put({
    id: 'ws',
    updates: REAL_YJS_FIXTURES.overwrittenAndForeignIncremental.map(
      (update, idx) => ({ timestamp: idx + 1, update })
    ),
  });
  for (const key of [
    'live-guid',
    'old-guid',
    'foreign-guid',
    'userdata$u$ws',
    'userdata$u$ws$fav',
    'userdata$u$ws$fav$extra',
    'userdata$u$other',
  ]) {
    tx.objectStore('workspace').put({
      id: key,
      updates: [{ timestamp: 10, update: encoder.encode(key) }],
    });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = reject;
    tx.commit();
  });

  const reader = createIdbV1ReadonlyReader({
    workspaceId: 'ws',
    indexedDB: idb,
  });
  assert.deepEqual(await reader.listV1DocIds(), [
    'ws',
    'live-guid',
    'userdata$u$ws',
    'userdata$u$ws$fav',
  ]);
});

void test('empty flush microtask race and throwing post-commit update listener never drop or duplicate writes', async () => {
  const idb = createMemoryIdbFactory();
  const BroadcastChannelImpl = createBroadcastBus();
  let fakeNow = 1_780_000_000_000;
  const encoder = new TextEncoder();

  const storage = createIdbWorkspaceStorage({
    flavour: 'local',
    type: 'workspace',
    id: 'ws-r5-flush',
    indexedDB: idb,
    BroadcastChannelImpl,
    now: () => ++fakeNow,
  });
  const flusher = createPendingWriteFlusher(storage);

  // 1. Empty flush() followed in same microtask turn by enqueue(B) + flushBeforeNavigation
  // must persist B before navigation callback runs.
  let navCheckPromise = null;
  await flusher.flush().then(async () => {
    flusher.enqueue({ docId: 'doc-b', bin: encoder.encode('b') });
    const navRes = await flushBeforeNavigation({
      pauseInput() {},
      resumeInput() {},
      flushPendingWrites: () => flusher.flush(),
      navigate: () => {
        navCheckPromise = storage.getDocRaw('doc-b');
      },
    });
    assert.equal(navRes.navigated, true);
  });
  const docBAtNav = await navCheckPromise;
  assert.equal(docBAtNav?.updates.length, 1);
  assert.equal(flusher.pendingCount(), 0);

  // 2. Throwing updateListener after IDB commit must NOT fail flush() or cause duplicate persistence on next flush.
  const unsubBad = storage.subscribeDocUpdate(() => {
    throw new Error('subscriber boom');
  });
  flusher.enqueue({ docId: 'doc-sub', bin: encoder.encode('once') });
  const r1 = await flusher.flush();
  assert.equal(r1.ok, true);
  assert.equal(flusher.pendingCount(), 0);
  unsubBad();
  const r2 = await flusher.flush();
  assert.equal(r2.ok, true);
  assert.equal((await storage.getDocRaw('doc-sub')).updates.length, 1);

  storage.close();
});
