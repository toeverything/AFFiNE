// @ts-check

/**
 * Same-origin IndexedDB v3 (12-store) + V1 read-only fallback + BroadcastChannel
 * bridge for the zero-build Web Mobile thin host.
 *
 * Schema layout, store names, key paths, indexes, database naming
 * (`${flavour}:${type}:${id}`), channel naming (`idb:${dbName}`), and
 * `localStorage['affine-local-workspace']` semantics match AFFiNE 0.27.5
 * (`packages/common/nbstore/src/impls/idb/**` and
 * `packages/frontend/core/src/modules/workspace-engine/impls/local.ts`).
 */

export const IDB_SCHEMA_VERSION = 3;

export const IDB_STORE_NAMES = Object.freeze([
  'snapshots',
  'updates',
  'clocks',
  'peerClocks',
  'blobs',
  'blobData',
  'locks',
  'blobSync',
  'indexerMetadata',
  'indexerRecords',
  'invertedIndex',
  'indexerSync',
]);

export const LOCAL_WORKSPACE_LOCAL_STORAGE_KEY = 'affine-local-workspace';
export const LOCAL_WORKSPACE_CHANGED_CHANNEL = 'affine-local-workspace-changed';
export const V1_DOC_DB_NAME = 'affine-local';
export const V1_CONST_TIMESTAMP = new Date(1893456000000);

/**
 * @typedef {Object} IdbSpaceOptions
 * @property {string} flavour
 * @property {'workspace' | 'userspace'} type
 * @property {string} id
 */

/**
 * @typedef {Object} PendingDocWrite
 * @property {string} docId
 * @property {Uint8Array} bin
 * @property {string} [editor]
 * @property {'create' | 'update'} [intent]
 * @property {string} [createForPeer]
 * @property {string} [origin]
 */

/**
 * Formats the canonical 0.27.5 IndexedDB database name.
 *
 * @param {IdbSpaceOptions} opts
 * @returns {string}
 */
export function formatIdbName(opts) {
  if (!opts || !opts.flavour || !opts.type || !opts.id) {
    throw new TypeError('flavour, type, and id are required for IDB name');
  }
  return `${opts.flavour}:${opts.type}:${opts.id}`;
}

/**
 * Formats the canonical 0.27.5 BroadcastChannel name for an IndexedDB database.
 *
 * @param {string} dbName
 * @returns {string}
 */
export function formatIdbChannelName(dbName) {
  return `idb:${dbName}`;
}

/**
 * Normalizes a parsed workspace ID list to an ordered array of strings.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeWorkspaceIds(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(item => typeof item === 'string' && item.length > 0);
}

/**
 * Deduplicates workspace IDs while preserving first-seen order.
 *
 * @param {string[]} ids
 * @returns {string[]}
 */
export function dedupeWorkspaceIds(ids) {
  return [...new Set(ids)];
}

/**
 * Reads the ordered local workspace ID list strictly from same-origin
 * `localStorage['affine-local-workspace']`. Never scans `indexedDB.databases()`,
 * preventing deleted workspaces with leftover IDB files from resurrecting.
 *
 * @param {Pick<Storage, 'getItem'> | null | undefined} [storage]
 * @returns {string[]}
 */
export function getLocalWorkspaceIds(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }
  try {
    const raw = storage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return dedupeWorkspaceIds(normalizeWorkspaceIds(JSON.parse(raw)));
  } catch {
    return [];
  }
}

/**
 * Persists the ordered local workspace ID list to same-origin
 * `localStorage['affine-local-workspace']` and optionally notifies peer tabs.
 *
 * @param {string[] | ((ids: string[]) => string[])} idsOrUpdater
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [storage]
 * @param {Pick<BroadcastChannel, 'postMessage'> | null} [notifyChannel]
 * @param {string | null} [changedId]
 * @returns {string[]}
 */
export function setLocalWorkspaceIds(
  idsOrUpdater,
  storage = globalThis.localStorage,
  notifyChannel = null,
  changedId = null
) {
  const next =
    typeof idsOrUpdater === 'function'
      ? idsOrUpdater(getLocalWorkspaceIds(storage))
      : idsOrUpdater;
  const deduplicated = dedupeWorkspaceIds(normalizeWorkspaceIds(next));
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(
      LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
      JSON.stringify(deduplicated)
    );
  }
  if (notifyChannel && typeof notifyChannel.postMessage === 'function') {
    notifyChannel.postMessage(changedId);
  }
  return deduplicated;
}

/**
 * Appends a local workspace ID if not already present.
 *
 * @param {string} workspaceId
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [storage]
 * @param {Pick<BroadcastChannel, 'postMessage'> | null} [notifyChannel]
 * @returns {string[]}
 */
export function addLocalWorkspaceId(
  workspaceId,
  storage = globalThis.localStorage,
  notifyChannel = null
) {
  return setLocalWorkspaceIds(
    ids => [...ids, workspaceId],
    storage,
    notifyChannel,
    workspaceId
  );
}

/**
 * Removes a local workspace ID from `localStorage['affine-local-workspace']`.
 *
 * @param {string} workspaceId
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [storage]
 * @param {Pick<BroadcastChannel, 'postMessage'> | null} [notifyChannel]
 * @returns {string[]}
 */
export function removeLocalWorkspaceId(
  workspaceId,
  storage = globalThis.localStorage,
  notifyChannel = null
) {
  return setLocalWorkspaceIds(
    ids => ids.filter(id => id !== workspaceId),
    storage,
    notifyChannel,
    workspaceId
  );
}

/**
 * Reads a same-origin preference value from `localStorage`.
 *
 * @param {string} key
 * @param {Pick<Storage, 'getItem'> | null | undefined} [storage]
 * @returns {string | null}
 */
export function getWebPreference(key, storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes or removes a same-origin preference value in `localStorage`.
 *
 * @param {string} key
 * @param {string | null | undefined} value
 * @param {Pick<Storage, 'setItem' | 'removeItem'> | null | undefined} [storage]
 */
export function setWebPreference(
  key,
  value,
  storage = globalThis.localStorage
) {
  if (!storage) {
    return;
  }
  if (value === null || value === undefined) {
    storage.removeItem?.(key);
  } else {
    storage.setItem?.(key, String(value));
  }
}

/**
 * Creates a default `peerClocks` record matching 0.27.5 `createPeerClock`.
 *
 * @param {string} peer
 * @param {string} docId
 */
export function createPeerClock(peer, docId) {
  return {
    peer,
    docId,
    clock: new Date(0),
    pulledClock: new Date(0),
    pushedClock: new Date(0),
  };
}

/**
 * Applies the frozen 0.27.5 v1 -> v2 -> v3 schema migrations creating all 12
 * object stores and their indexes.
 *
 * @param {IDBDatabase} db
 * @param {number} oldVersion
 */
export function upgradeIdbSchema(db, oldVersion) {
  const fromVersion = Number.isFinite(oldVersion) ? oldVersion : 0;

  if (fromVersion < 1) {
    const snapshots = db.createObjectStore('snapshots', {
      keyPath: 'docId',
      autoIncrement: false,
    });
    snapshots.createIndex('updatedAt', 'updatedAt', { unique: false });

    const updates = db.createObjectStore('updates', {
      keyPath: ['docId', 'createdAt'],
      autoIncrement: false,
    });
    updates.createIndex('docId', 'docId', { unique: false });

    const clocks = db.createObjectStore('clocks', {
      keyPath: 'docId',
      autoIncrement: false,
    });
    clocks.createIndex('timestamp', 'timestamp', { unique: false });

    const peerClocks = db.createObjectStore('peerClocks', {
      keyPath: ['peer', 'docId'],
      autoIncrement: false,
    });
    peerClocks.createIndex('peer', 'peer', { unique: false });

    db.createObjectStore('blobs', {
      keyPath: 'key',
      autoIncrement: false,
    });

    db.createObjectStore('blobData', {
      keyPath: 'key',
      autoIncrement: false,
    });

    db.createObjectStore('locks', {
      keyPath: 'key',
      autoIncrement: false,
    });
  }

  if (fromVersion < 2) {
    const blobSync = db.createObjectStore('blobSync', {
      keyPath: ['peer', 'key'],
      autoIncrement: false,
    });
    blobSync.createIndex('peer', 'peer', { unique: false });
  }

  if (fromVersion < 3) {
    db.createObjectStore('indexerMetadata', {
      keyPath: 'key',
    });

    const indexRecordsStore = db.createObjectStore('indexerRecords', {
      autoIncrement: true,
    });
    indexRecordsStore.createIndex('table', 'table', { unique: false });
    indexRecordsStore.createIndex('id', ['table', 'id'], { unique: true });

    const invertedIndexStore = db.createObjectStore('invertedIndex', {
      autoIncrement: true,
    });
    invertedIndexStore.createIndex('key', ['table', 'key'], { unique: false });
    invertedIndexStore.createIndex('nid', 'nid', { unique: false });

    db.createObjectStore('indexerSync', {
      keyPath: 'docId',
      autoIncrement: false,
    });
  }
}

/**
 * Wraps a W3C `IDBRequest` into a Promise.
 *
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('IndexedDB request failed'));
  });
}

/**
 * Resolves when a W3C `IDBTransaction` fires `oncomplete`, or rejects on
 * `onerror` / `onabort`.
 *
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () =>
      reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Opens an AFFiNE v3 workspace IndexedDB database at frozen version 3.
 *
 * @param {IdbSpaceOptions} space
 * @param {{ indexedDB?: IDBFactory }} [env]
 * @returns {Promise<IDBDatabase>}
 */
export function openWorkspaceIdb(space, env = {}) {
  const factory = env.indexedDB || globalThis.indexedDB;
  if (!factory || typeof factory.open !== 'function') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }
  const dbName = formatIdbName(space);
  return new Promise((resolve, reject) => {
    const req = factory.open(dbName, IDB_SCHEMA_VERSION);
    req.onupgradeneeded = event => {
      const target = /** @type {IDBOpenDBRequest} */ (event.target || req);
      const oldVersion =
        typeof event.oldVersion === 'number' ? event.oldVersion : 0;
      upgradeIdbSchema(target.result, oldVersion);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error(`Failed to open IndexedDB ${dbName}`));
    req.onblocked = () =>
      reject(new Error(`IndexedDB open blocked for ${dbName}`));
  });
}

/**
 * Normalizes a Date or numeric timestamp into a Date instance.
 *
 * @param {Date | number | string | null | undefined} value
 * @returns {Date}
 */
function toDate(value) {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return new Date(value);
  }
  return new Date(0);
}

/**
 * Byte-for-byte equality check for two optional `Uint8Array` buffers.
 *
 * @param {Uint8Array | null | undefined} a
 * @param {Uint8Array | null | undefined} b
 * @returns {boolean}
 */
function bytesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a same-origin IndexedDB v3 + `BroadcastChannel` storage bridge for a
 * workspace, matching AFFiNE 0.27.5 `IndexedDBDocStorage`,
 * `IndexedDBDocSyncStorage`, `IndexedDBBlobStorage`, `IndexedDBBlobSyncStorage`,
 * and `IndexedDBIndexerSyncStorage`.
 *
 * @param {IdbSpaceOptions & {
 *   indexedDB?: IDBFactory,
 *   BroadcastChannelImpl?: typeof BroadcastChannel,
 *   now?: () => number,
 *   mergeUpdates?: (updates: Uint8Array[]) => Uint8Array | Promise<Uint8Array>,
 *   readonlyMode?: boolean,
 * }} options
 */
export function createIdbWorkspaceStorage(options) {
  const dbName = formatIdbName(options);
  const channelName = formatIdbChannelName(dbName);
  const now = options.now || (() => Date.now());
  const configuredMergeUpdates =
    typeof options.mergeUpdates === 'function' ? options.mergeUpdates : null;
  const readonlyMode = Boolean(options.readonlyMode);
  const BroadcastChannelCtor =
    options.BroadcastChannelImpl || globalThis.BroadcastChannel;

  /** @type {IDBDatabase | null} */
  let db = null;
  /** @type {Promise<IDBDatabase> | null} */
  let openPromise = null;
  let openGen = 0;
  /** @type {BroadcastChannel | null} */
  let channel = null;
  /** @type {Error | null} */
  let versionError = null;
  /** @type {Set<(update: any, origin?: string) => void>} */
  const updateListeners = new Set();
  /** @type {Set<(docId: string) => void>} */
  const deleteListeners = new Set();

  /** @param {MessageEvent} event */
  function handleChannelMessage(event) {
    const data = event?.data;
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.type === 'update' && data.update) {
      for (const listener of updateListeners) {
        listener(data.update, data.origin);
      }
    } else if (data.type === 'delete' && typeof data.docId === 'string') {
      for (const listener of deleteListeners) {
        listener(data.docId);
      }
    }
  }

  /** @param {IDBVersionChangeEvent} event */
  function handleVersionChange(event) {
    if (event.newVersion !== IDB_SCHEMA_VERSION) {
      versionError = new Error(
        `Database version mismatch, expected ${IDB_SCHEMA_VERSION} but got ${event.newVersion}`
      );
      openPromise = null;
      db?.close();
      db = null;
    }
  }

  async function open() {
    if (versionError) {
      throw versionError;
    }
    if (!db) {
      if (!openPromise) {
        const gen = openGen;
        const attempt = openWorkspaceIdb(options, {
          indexedDB: options.indexedDB,
        })
          .then(conn => {
            if (gen !== openGen || versionError) {
              conn.close();
              if (openPromise === attempt) {
                openPromise = null;
              }
              throw versionError || new Error('IndexedDB storage was closed');
            }
            db = conn;
            if (typeof db.addEventListener === 'function') {
              db.addEventListener('versionchange', handleVersionChange);
            }
            return db;
          })
          .catch(err => {
            if (openPromise === attempt) {
              openPromise = null;
            }
            throw err;
          });
        openPromise = attempt;
      }
      await openPromise;
    }
    if (!channel && typeof BroadcastChannelCtor === 'function') {
      channel = new BroadcastChannelCtor(channelName);
      channel.addEventListener('message', handleChannelMessage);
    }
    return /** @type {IDBDatabase} */ (db);
  }

  function close() {
    openGen += 1;
    openPromise = null;
    if (channel) {
      channel.removeEventListener('message', handleChannelMessage);
      channel.close();
      channel = null;
    }
    if (db) {
      if (typeof db.removeEventListener === 'function') {
        db.removeEventListener('versionchange', handleVersionChange);
      }
      db.close();
      db = null;
    }
  }

  /**
   * Commits one or more CRDT updates atomically inside a single `readwrite`
   * IndexedDB transaction and broadcasts them after `tx.oncomplete`.
   *
   * @param {PendingDocWrite[]} batch
   * @returns {Promise<Array<{ docId: string, timestamp: Date }>>}
   */
  async function pushDocUpdatesBatch(batch) {
    if (readonlyMode) {
      throw new Error('Cannot write to readonly IDB storage');
    }
    if (!batch.length) {
      return [];
    }
    const conn = await open();
    const tx = conn.transaction(
      ['updates', 'clocks', 'peerClocks'],
      'readwrite'
    );
    const done = transactionDone(tx);
    const updatesStore = tx.objectStore('updates');
    const clocksStore = tx.objectStore('clocks');
    const peerClocksStore = tx.objectStore('peerClocks');

    /** @type {Array<{ update: PendingDocWrite, timestamp: Date }>} */
    const committed = [];

    try {
      for (const item of batch) {
        const prev = await requestToPromise(clocksStore.get(item.docId));
        const prevMs = prev ? toDate(prev.timestamp).getTime() : 0;
        const timestamp = new Date(Math.max(now(), prevMs + 1));

        /** @type {Record<string, unknown>} */
        const updateRecord = {
          docId: item.docId,
          bin: item.bin,
          createdAt: timestamp,
        };
        if (item.editor !== undefined) {
          updateRecord.editor = item.editor;
        }
        if (item.intent !== undefined) {
          updateRecord.intent = item.intent;
        }
        if (item.createForPeer !== undefined) {
          updateRecord.createForPeer = item.createForPeer;
        }

        await requestToPromise(updatesStore.add(updateRecord));
        await requestToPromise(
          clocksStore.put({ docId: item.docId, timestamp })
        );

        if (item.createForPeer) {
          const existing =
            (await requestToPromise(
              peerClocksStore.get([item.createForPeer, item.docId])
            )) || createPeerClock(item.createForPeer, item.docId);
          await requestToPromise(
            peerClocksStore.put({ ...existing, pendingCreate: true })
          );
          const root =
            (await requestToPromise(
              peerClocksStore.get([item.createForPeer, options.id])
            )) || createPeerClock(item.createForPeer, options.id);
          await requestToPromise(
            peerClocksStore.put({
              ...root,
              cacheToken: (root.cacheToken || 0) + 1,
            })
          );
        }

        committed.push({ update: item, timestamp });
      }
      if (typeof tx.commit === 'function') {
        tx.commit();
      }
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Ignore if transaction already aborted or finished.
      }
      await done.catch(() => {});
      throw error;
    }

    for (const { update, timestamp } of committed) {
      const payload = {
        docId: update.docId,
        bin: update.bin,
        timestamp,
        editor: update.editor,
        createForPeer: update.createForPeer,
      };
      for (const listener of updateListeners) {
        try {
          listener(payload, update.origin);
        } catch {
          // Post-commit listener errors must not cause committed batches to be retried.
        }
      }
      if (channel) {
        try {
          channel.postMessage({
            type: 'update',
            update: payload,
            origin: update.origin,
          });
        } catch {
          // Broadcast errors must not cause committed batches to be retried.
        }
      }
    }

    return committed.map(({ update, timestamp }) => ({
      docId: update.docId,
      timestamp,
    }));
  }

  /**
   * @param {PendingDocWrite} update
   * @param {string} [origin]
   */
  async function pushDocUpdate(update, origin) {
    const [res] = await pushDocUpdatesBatch([
      { ...update, origin: origin ?? update.origin },
    ]);
    return res;
  }

  /**
   * Reads raw unmerged snapshot + ordered update frames for a document so a
   * native CRDT engine (for example Rust `y-octo`) can apply them in order
   * without requiring a JS `mergeUpdates` callback.
   *
   * @param {string} docId
   * @returns {Promise<{ docId: string, snapshot: Uint8Array | null, updates: Uint8Array[], timestamp: Date } | null>}
   */
  async function getDocRaw(docId) {
    const conn = await open();
    const readTx = conn.transaction(['snapshots', 'updates'], 'readonly');
    const readDone = transactionDone(readTx);
    const [snapshot, updates] = await Promise.all([
      requestToPromise(readTx.objectStore('snapshots').get(docId)),
      requestToPromise(
        readTx.objectStore('updates').index('docId').getAll(docId)
      ),
    ]);
    await readDone;

    if (!snapshot && !updates.length) {
      return null;
    }

    updates.sort(
      (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime()
    );
    const timestamp = new Date(
      Math.max(
        snapshot ? toDate(snapshot.updatedAt).getTime() : 0,
        updates.length
          ? toDate(updates[updates.length - 1].createdAt).getTime()
          : 0
      )
    );
    return {
      docId,
      snapshot: snapshot ? snapshot.bin : null,
      updates: updates.map(entry => entry.bin),
      timestamp,
    };
  }

  /**
   * Reads a document snapshot + pending updates from same-origin IDB v3.
   * When multiple CRDT frames exist, requires a `mergeUpdates` callback (never
   * raw-concatenates Yjs/y-octo V1 frames). When `opts.compact` is true,
   * re-verifies snapshot and updates inside the `readwrite` transaction before
   * compacting so concurrent writes are never lost.
   *
   * @param {string} docId
   * @param {{ compact?: boolean, mergeUpdates?: (updates: Uint8Array[]) => Uint8Array | Promise<Uint8Array> }} [opts]
   */
  async function getDoc(docId, opts = {}) {
    const conn = await open();
    const readTx = conn.transaction(['snapshots', 'updates'], 'readonly');
    const readDone = transactionDone(readTx);
    const [snapshot, updates] = await Promise.all([
      requestToPromise(readTx.objectStore('snapshots').get(docId)),
      requestToPromise(
        readTx.objectStore('updates').index('docId').getAll(docId)
      ),
    ]);
    await readDone;

    if (!updates.length) {
      return snapshot
        ? {
            docId,
            bin: snapshot.bin,
            timestamp: toDate(snapshot.updatedAt),
          }
        : null;
    }

    updates.sort(
      (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime()
    );
    const sources = [
      ...(snapshot ? [snapshot.bin] : []),
      ...updates.map(entry => entry.bin),
    ];
    const merger =
      typeof opts.mergeUpdates === 'function'
        ? opts.mergeUpdates
        : configuredMergeUpdates;
    if (sources.length > 1 && !merger) {
      throw new TypeError(
        'mergeUpdates callback is required to merge multiple CRDT updates; use getDocRaw() for raw frames'
      );
    }
    const mergedBin = sources.length === 1 ? sources[0] : await merger(sources);
    const timestamp = new Date(
      Math.max(
        snapshot ? toDate(snapshot.updatedAt).getTime() : 0,
        toDate(updates[updates.length - 1].createdAt).getTime()
      )
    );

    if (opts.compact && !readonlyMode) {
      const writeTx = conn.transaction(['snapshots', 'updates'], 'readwrite');
      const writeDone = transactionDone(writeTx);
      const snapshotsStore = writeTx.objectStore('snapshots');
      const updatesStore = writeTx.objectStore('updates');
      const [currentSnapshot, currentUpdates] = await Promise.all([
        requestToPromise(snapshotsStore.get(docId)),
        Promise.all(
          updates.map(entry =>
            requestToPromise(updatesStore.get([docId, entry.createdAt]))
          )
        ),
      ]);
      const snapshotUnchanged =
        (currentSnapshot
          ? toDate(currentSnapshot.updatedAt).getTime()
          : null) ===
          (snapshot ? toDate(snapshot.updatedAt).getTime() : null) &&
        bytesEqual(currentSnapshot?.bin, snapshot?.bin);
      const updatesUnchanged = updates.every((entry, idx) =>
        bytesEqual(currentUpdates[idx]?.bin, entry.bin)
      );
      if (snapshotUnchanged && updatesUnchanged) {
        await requestToPromise(
          snapshotsStore.put({
            docId,
            bin: mergedBin,
            createdAt: currentSnapshot
              ? toDate(currentSnapshot.createdAt)
              : timestamp,
            updatedAt: timestamp,
          })
        );
        for (const entry of updates) {
          await requestToPromise(updatesStore.delete([docId, entry.createdAt]));
        }
      }
      if (typeof writeTx.commit === 'function') {
        writeTx.commit();
      }
      await writeDone;
    }

    return { docId, bin: mergedBin, timestamp };
  }

  /**
   * Compacts a document using an externally merged CRDT snapshot (for example
   * produced by Rust/Wasm `y-octo`) inside a `readwrite` transaction with
   * compare-and-swap verification on `expectedUpdatedAt` so concurrent writes
   * are never overwritten.
   *
   * @param {{
   *   docId: string,
   *   mergedBin: Uint8Array,
   *   expectedUpdatedAt: Date | number | null,
   *   coveredUpTo: Date | number,
   * }} params
   * @returns {Promise<{ compacted: boolean }>}
   */
  async function compactDocWithMerged(params) {
    if (readonlyMode) {
      throw new Error('Cannot compact readonly IDB storage');
    }
    const { docId, mergedBin, expectedUpdatedAt, coveredUpTo } = params;
    if (coveredUpTo === undefined || coveredUpTo === null) {
      throw new TypeError(
        'compactDocWithMerged requires an explicit finite coveredUpTo timestamp'
      );
    }
    const cutoffMs = toDate(coveredUpTo).getTime();
    if (!Number.isFinite(cutoffMs)) {
      throw new TypeError(
        'compactDocWithMerged requires an explicit finite coveredUpTo timestamp'
      );
    }
    const expectedMs =
      expectedUpdatedAt === null || expectedUpdatedAt === undefined
        ? null
        : toDate(expectedUpdatedAt).getTime();
    const conn = await open();
    const tx = conn.transaction(['snapshots', 'updates'], 'readwrite');
    const done = transactionDone(tx);
    const snapshotsStore = tx.objectStore('snapshots');
    const updatesStore = tx.objectStore('updates');
    let compacted = false;
    try {
      const [currentSnapshot, currentUpdates] = await Promise.all([
        requestToPromise(snapshotsStore.get(docId)),
        requestToPromise(updatesStore.index('docId').getAll(docId)),
      ]);
      const currentSnapMs = currentSnapshot
        ? toDate(currentSnapshot.updatedAt).getTime()
        : null;
      if (currentSnapMs === expectedMs) {
        const covered = currentUpdates.filter(
          entry => toDate(entry.createdAt).getTime() <= cutoffMs
        );
        const nextTs = new Date(
          Math.max(
            currentSnapMs ?? 0,
            ...covered.map(e => toDate(e.createdAt).getTime())
          )
        );
        await requestToPromise(
          snapshotsStore.put({
            docId,
            bin: mergedBin,
            createdAt: currentSnapshot
              ? toDate(currentSnapshot.createdAt)
              : nextTs,
            updatedAt: nextTs,
          })
        );
        for (const entry of covered) {
          await requestToPromise(updatesStore.delete([docId, entry.createdAt]));
        }
        compacted = true;
      }
      if (typeof tx.commit === 'function') {
        tx.commit();
      }
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Ignore if already finished.
      }
      await done.catch(() => {});
      throw error;
    }
    return { compacted };
  }

  /**
   * @param {string} docId
   */
  async function deleteDoc(docId) {
    if (readonlyMode) {
      throw new Error('Cannot delete from readonly IDB storage');
    }
    const conn = await open();
    const tx = conn.transaction(
      ['snapshots', 'updates', 'clocks', 'peerClocks'],
      'readwrite'
    );
    const done = transactionDone(tx);
    const updates = await requestToPromise(
      tx.objectStore('updates').index('docId').getAll(docId)
    );
    for (const entry of updates) {
      await requestToPromise(
        tx.objectStore('updates').delete([entry.docId, entry.createdAt])
      );
    }
    await requestToPromise(tx.objectStore('snapshots').delete(docId));
    await requestToPromise(tx.objectStore('clocks').delete(docId));
    const peersStore = tx.objectStore('peerClocks');
    const allPeers = await requestToPromise(peersStore.getAll());
    for (const record of allPeers) {
      if (record.docId !== docId || !record.pendingCreate) {
        continue;
      }
      await requestToPromise(
        peersStore.put({ ...record, pendingCreate: false })
      );
      const root =
        (await requestToPromise(peersStore.get([record.peer, options.id]))) ||
        createPeerClock(record.peer, options.id);
      await requestToPromise(
        peersStore.put({ ...root, cacheToken: (root.cacheToken || 0) + 1 })
      );
    }
    if (typeof tx.commit === 'function') {
      tx.commit();
    }
    await done;

    for (const listener of deleteListeners) {
      listener(docId);
    }
    channel?.postMessage({ type: 'delete', docId });
  }

  /**
   * @param {Date} [after]
   * @returns {Promise<Record<string, Date>>}
   */
  async function getDocTimestamps(after = new Date(0)) {
    const conn = await open();
    const tx = conn.transaction('clocks', 'readonly');
    const done = transactionDone(tx);
    const records = await requestToPromise(tx.objectStore('clocks').getAll());
    await done;
    /** @type {Record<string, Date>} */
    const out = {};
    for (const cur of records) {
      const ts = toDate(cur.timestamp);
      if (ts > after) {
        out[cur.docId] = ts;
      }
    }
    return out;
  }

  /**
   * @param {string} docId
   */
  async function getDocTimestamp(docId) {
    const conn = await open();
    const tx = conn.transaction('clocks', 'readonly');
    const done = transactionDone(tx);
    const record = await requestToPromise(tx.objectStore('clocks').get(docId));
    await done;
    return record
      ? { docId: record.docId, timestamp: toDate(record.timestamp) }
      : null;
  }

  /**
   * @param {string} peer
   * @param {string} docId
   * @param {'clock' | 'pulledClock' | 'pushedClock'} field
   */
  async function getPeerField(peer, docId, field) {
    const conn = await open();
    const tx = conn.transaction('peerClocks', 'readonly');
    const done = transactionDone(tx);
    const record = await requestToPromise(
      tx.objectStore('peerClocks').get([peer, docId])
    );
    await done;
    return record
      ? { docId: record.docId, timestamp: toDate(record[field]) }
      : null;
  }

  /**
   * @param {string} peer
   * @param {'clock' | 'pulledClock' | 'pushedClock'} field
   */
  async function getPeerFieldMap(peer, field) {
    const conn = await open();
    const tx = conn.transaction('peerClocks', 'readonly');
    const done = transactionDone(tx);
    const records = await requestToPromise(
      tx.objectStore('peerClocks').index('peer').getAll(peer)
    );
    await done;
    /** @type {Record<string, Date>} */
    const out = {};
    for (const record of records) {
      out[record.docId] = toDate(record[field]);
    }
    return out;
  }

  /**
   * @param {string} peer
   * @param {{ docId: string, timestamp: Date }} clock
   * @param {'clock' | 'pulledClock' | 'pushedClock'} field
   */
  async function setPeerField(peer, clock, field) {
    const conn = await open();
    const tx = conn.transaction('peerClocks', 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore('peerClocks');
    const record = await requestToPromise(store.get([peer, clock.docId]));
    const nextTs = toDate(clock.timestamp);
    if (!record || toDate(record[field]) < nextTs) {
      const base = record || createPeerClock(peer, clock.docId);
      await requestToPromise(store.put({ ...base, [field]: nextTs }));
    }
    if (typeof tx.commit === 'function') {
      tx.commit();
    }
    await done;
  }

  /**
   * @param {string} key
   */
  async function getBlob(key) {
    const conn = await open();
    const tx = conn.transaction(['blobs', 'blobData'], 'readonly');
    const done = transactionDone(tx);
    const [meta, payload] = await Promise.all([
      requestToPromise(tx.objectStore('blobs').get(key)),
      requestToPromise(tx.objectStore('blobData').get(key)),
    ]);
    await done;
    if (!meta || meta.deletedAt || !payload) {
      return null;
    }
    return { ...meta, data: payload.data };
  }

  /**
   * @param {{ key: string, mime: string, data: Uint8Array }} blob
   */
  async function setBlob(blob) {
    const conn = await open();
    const tx = conn.transaction(['blobs', 'blobData'], 'readwrite');
    const done = transactionDone(tx);
    await requestToPromise(
      tx.objectStore('blobs').put({
        key: blob.key,
        mime: blob.mime,
        size: blob.data.byteLength,
        createdAt: new Date(now()),
        deletedAt: null,
      })
    );
    await requestToPromise(
      tx.objectStore('blobData').put({
        key: blob.key,
        data: blob.data,
      })
    );
    if (typeof tx.commit === 'function') {
      tx.commit();
    }
    await done;
  }

  /**
   * @param {string} peer
   * @param {string} key
   * @param {Date | null} uploadedAt
   */
  async function setBlobUploadedAt(peer, key, uploadedAt) {
    const conn = await open();
    const tx = conn.transaction('blobSync', 'readwrite');
    const done = transactionDone(tx);
    await requestToPromise(
      tx.objectStore('blobSync').put({ peer, key, uploadedAt })
    );
    if (typeof tx.commit === 'function') {
      tx.commit();
    }
    await done;
  }

  /**
   * @param {string} peer
   * @param {string} key
   * @returns {Promise<Date | null>}
   */
  async function getBlobUploadedAt(peer, key) {
    const conn = await open();
    const tx = conn.transaction('blobSync', 'readonly');
    const done = transactionDone(tx);
    const record = await requestToPromise(
      tx.objectStore('blobSync').get([peer, key])
    );
    await done;
    return record?.uploadedAt ? toDate(record.uploadedAt) : null;
  }

  /**
   * @param {string} docId
   */
  async function getDocIndexedClock(docId) {
    const conn = await open();
    const tx = conn.transaction('indexerSync', 'readonly');
    const done = transactionDone(tx);
    const record = await requestToPromise(
      tx.objectStore('indexerSync').get(docId)
    );
    await done;
    return record
      ? {
          docId: record.docId,
          timestamp: toDate(record.indexedClock),
          indexerVersion: record.indexerVersion ?? 0,
        }
      : null;
  }

  /**
   * @param {{ docId: string, timestamp: Date, indexerVersion?: number }} clock
   */
  async function setDocIndexedClock(clock) {
    const conn = await open();
    const tx = conn.transaction('indexerSync', 'readwrite');
    const done = transactionDone(tx);
    await requestToPromise(
      tx.objectStore('indexerSync').put({
        docId: clock.docId,
        indexedClock: toDate(clock.timestamp),
        indexerVersion: clock.indexerVersion ?? 0,
      })
    );
    if (typeof tx.commit === 'function') {
      tx.commit();
    }
    await done;
  }

  /**
   * @param {(update: any, origin?: string) => void} callback
   */
  function subscribeDocUpdate(callback) {
    updateListeners.add(callback);
    return () => {
      updateListeners.delete(callback);
    };
  }

  /**
   * @param {(docId: string) => void} callback
   */
  function subscribeDocDelete(callback) {
    deleteListeners.add(callback);
    return () => {
      deleteListeners.delete(callback);
    };
  }

  return {
    dbName,
    channelName,
    version: IDB_SCHEMA_VERSION,
    open,
    close,
    pushDocUpdate,
    pushDocUpdatesBatch,
    getDoc,
    getDocRaw,
    compactDocWithMerged,
    deleteDoc,
    getDocTimestamps,
    getDocTimestamp,
    getPeerRemoteClock: (peer, docId) => getPeerField(peer, docId, 'clock'),
    getPeerRemoteClocks: peer => getPeerFieldMap(peer, 'clock'),
    setPeerRemoteClock: (peer, clock) => setPeerField(peer, clock, 'clock'),
    getPeerPulledRemoteClock: (peer, docId) =>
      getPeerField(peer, docId, 'pulledClock'),
    getPeerPulledRemoteClocks: peer => getPeerFieldMap(peer, 'pulledClock'),
    setPeerPulledRemoteClock: (peer, clock) =>
      setPeerField(peer, clock, 'pulledClock'),
    getPeerPushedClock: (peer, docId) =>
      getPeerField(peer, docId, 'pushedClock'),
    getPeerPushedClocks: peer => getPeerFieldMap(peer, 'pushedClock'),
    setPeerPushedClock: (peer, clock) =>
      setPeerField(peer, clock, 'pushedClock'),
    getBlob,
    setBlob,
    getBlobUploadedAt,
    setBlobUploadedAt,
    getDocIndexedClock,
    setDocIndexedClock,
    subscribeDocUpdate,
    subscribeDocDelete,
  };
}

/**
 * Minimal zero-dependency pure-JS Yjs v1 Item + DeleteSet decoder that
 * reconstructs live `meta.pages -> spaces` `ContentDoc` (`tag === 9`) subdoc
 * GUIDs from legacy V1 root document updates. Throws on malformed frames.
 *
 * @param {Uint8Array[]} rootUpdates
 * @returns {{ guids: string[], pageIdToGuid: Map<string, string> }}
 */
export function extractYjsV1SubdocEntries(rootUpdates) {
  const decoder = new TextDecoder();
  /**
   * @typedef {{
   *   client: number,
   *   clock: number,
   *   len: number,
   *   tag: number,
   *   origin: { client: number, clock: number } | null,
   *   rightOrigin: { client: number, clock: number } | null,
   *   parentKey: string | null,
   *   parentId: { client: number, clock: number } | null,
   *   parentSub: string | null,
   *   deleted: boolean,
   *   typeRef: number | null,
   *   values: unknown[] | null,
   *   guid: string | null,
   * }} YjsDecodedItem
   */
  /** @type {YjsDecodedItem[]} */
  const allItems = [];
  /** @type {Map<string, YjsDecodedItem>} */
  const itemByKey = new Map();
  /** @type {Map<number, YjsDecodedItem[]>} */
  const itemsByClient = new Map();
  /** @type {Map<number, Array<[number, number]>>} */
  const deleteRangesByClient = new Map();

  for (const buf of rootUpdates || []) {
    if (!(buf instanceof Uint8Array) || buf.byteLength === 0) {
      continue;
    }
    let pos = 0;
    const readUint8 = () => {
      if (pos >= buf.byteLength) {
        throw new RangeError('Unexpected EOF');
      }
      return buf[pos++];
    };
    const readVarUint = () => {
      let num = 0;
      let mult = 1;
      for (let i = 0; i < 10; i += 1) {
        const r = readUint8();
        num += (r & 0x7f) * mult;
        if (r < 0x80) {
          return num;
        }
        mult *= 128;
      }
      throw new RangeError('VarUint overflow');
    };
    const readVarBytes = () => {
      const len = readVarUint();
      if (pos + len > buf.byteLength) {
        throw new RangeError('Unexpected EOF');
      }
      const slice = buf.subarray(pos, pos + len);
      pos += len;
      return slice;
    };
    const readVarString = () => decoder.decode(readVarBytes());
    const readAny = () => {
      const type = readUint8();
      switch (type) {
        case 127: // undefined
        case 126: // null
        case 121: // false
        case 120: // true
          return null;
        case 125: {
          // varInt
          let r = readUint8();
          while (r & 0x80) {
            r = readUint8();
          }
          return 0;
        }
        case 124: // float32
          if (pos + 4 > buf.byteLength) {
            throw new RangeError('Unexpected EOF');
          }
          pos += 4;
          return 0;
        case 123: // float64
        case 122: // bigint64
          if (pos + 8 > buf.byteLength) {
            throw new RangeError('Unexpected EOF');
          }
          pos += 8;
          return 0;
        case 119: // string
          return readVarString();
        case 116: // binary
          readVarBytes();
          return null;
        case 118: {
          // object
          const len = readVarUint();
          for (let i = 0; i < len; i += 1) {
            readVarBytes();
            readAny();
          }
          return null;
        }
        case 117: {
          // array
          const len = readVarUint();
          for (let i = 0; i < len; i += 1) {
            readAny();
          }
          return null;
        }
        default:
          throw new RangeError(`Unknown lib0 any tag ${type}`);
      }
    };

    const numClients = readVarUint();
    for (let c = 0; c < numClients; c += 1) {
      const numStructs = readVarUint();
      const client = readVarUint();
      let clock = readVarUint();
      let clientList = itemsByClient.get(client);
      if (!clientList) {
        clientList = [];
        itemsByClient.set(client, clientList);
      }
      for (let s = 0; s < numStructs; s += 1) {
        const itemClock = clock;
        const info = readUint8();
        const tag = info & 0x1f;
        if (tag === 0 || tag === 10) {
          clock += readVarUint();
          continue;
        }
        const hasOrigin = (info & 0x80) !== 0;
        const hasRightOrigin = (info & 0x40) !== 0;
        const origin = hasOrigin
          ? { client: readVarUint(), clock: readVarUint() }
          : null;
        const rightOrigin = hasRightOrigin
          ? { client: readVarUint(), clock: readVarUint() }
          : null;
        /** @type {string | null} */
        let parentKey = null;
        /** @type {{ client: number, clock: number } | null} */
        let parentId = null;
        /** @type {string | null} */
        let parentSub = null;
        if (!hasOrigin && !hasRightOrigin) {
          const hasParentYKey = readVarUint() === 1;
          if (hasParentYKey) {
            parentKey = readVarString();
          } else {
            parentId = { client: readVarUint(), clock: readVarUint() };
          }
          if (info & 0x20) {
            parentSub = readVarString();
          }
        }
        let len = 1;
        let deleted = false;
        /** @type {number | null} */
        let typeRef = null;
        /** @type {unknown[] | null} */
        let values = null;
        /** @type {string | null} */
        let guid = null;
        switch (tag) {
          case 1: // Deleted
            len = readVarUint();
            deleted = true;
            break;
          case 2: {
            // JSON
            len = readVarUint();
            values = [];
            for (let j = 0; j < len; j += 1) {
              values.push(readVarString());
            }
            break;
          }
          case 3: // Binary
            readVarBytes();
            break;
          case 4: {
            // String
            const str = readVarString();
            len = str.length;
            values = [str];
            break;
          }
          case 5: // Embed
            readVarString();
            break;
          case 6: // Format
            readVarString();
            readVarString();
            break;
          case 7: {
            // Type (only YXmlElement=3 and YXmlHook=5 carry a node name string)
            typeRef = readVarUint();
            if (typeRef === 3 || typeRef === 5) {
              readVarString();
            }
            break;
          }
          case 8: {
            // Any
            len = readVarUint();
            values = [];
            for (let j = 0; j < len; j += 1) {
              values.push(readAny());
            }
            break;
          }
          case 9: {
            // ContentDoc (subdoc)
            guid = readVarString();
            readAny();
            break;
          }
          default:
            throw new RangeError(`Unknown Yjs struct tag ${tag}`);
        }
        clock += len;
        const itemKey = `${client}:${itemClock}`;
        const existing = itemByKey.get(itemKey);
        if (existing) {
          if (deleted) {
            existing.deleted = true;
          }
          continue;
        }
        /** @type {YjsDecodedItem} */
        const item = {
          client,
          clock: itemClock,
          len,
          tag,
          origin,
          rightOrigin,
          parentKey,
          parentId,
          parentSub,
          deleted,
          typeRef,
          values,
          guid,
        };
        allItems.push(item);
        itemByKey.set(itemKey, item);
        clientList.push(item);
      }
    }

    const numDsClients = readVarUint();
    for (let d = 0; d < numDsClients; d += 1) {
      const dsClient = readVarUint();
      const numRanges = readVarUint();
      let ranges = deleteRangesByClient.get(dsClient);
      if (!ranges) {
        ranges = [];
        deleteRangesByClient.set(dsClient, ranges);
      }
      for (let r = 0; r < numRanges; r += 1) {
        const dsClock = readVarUint();
        const dsLen = readVarUint();
        ranges.push([dsClock, dsClock + dsLen]);
      }
    }
  }

  /** @type {Map<number, Array<[number, number]>>} */
  const mergedDeleteRanges = new Map();
  for (const [dsClient, rawRanges] of deleteRangesByClient) {
    rawRanges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    /** @type {Array<[number, number]>} */
    const merged = [];
    for (const [s, e] of rawRanges) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        if (e > last[1]) {
          last[1] = e;
        }
      } else {
        merged.push([s, e]);
      }
    }
    mergedDeleteRanges.set(dsClient, merged);
  }

  for (const list of itemsByClient.values()) {
    list.sort((a, b) => a.clock - b.clock);
  }

  for (const item of allItems) {
    if (item.deleted) {
      continue;
    }
    const ranges = mergedDeleteRanges.get(item.client);
    if (!ranges || ranges.length === 0) {
      continue;
    }
    let lo = 0;
    let hi = ranges.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (ranges[mid][0] <= item.clock) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx >= 0 && item.clock + Math.max(1, item.len) <= ranges[idx][1]) {
      item.deleted = true;
    }
  }

  /** @param {{ client: number, clock: number }} id */
  const findItem = id => {
    const exact = itemByKey.get(`${id.client}:${id.clock}`);
    if (exact) {
      return exact;
    }
    const list = itemsByClient.get(id.client);
    if (!list || list.length === 0) {
      return null;
    }
    let lo = 0;
    let hi = list.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].clock <= id.clock) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx >= 0) {
      const cand = list[idx];
      if (id.clock < cand.clock + Math.max(1, cand.len)) {
        return cand;
      }
    }
    return null;
  };

  /** @type {Map<YjsDecodedItem, { parentKey: string | null, parentIdKey: string | null, parentSub: string | null }>} */
  const resolvedParents = new Map();
  /**
   * Iterative parent resolver (zero recursion so 40,000+ page arrays never
   * overflow the JS call stack).
   *
   * @param {YjsDecodedItem} startItem
   * @returns {{ parentKey: string | null, parentIdKey: string | null, parentSub: string | null }}
   */
  const resolveParent = startItem => {
    const cached0 = resolvedParents.get(startItem);
    if (cached0) {
      return cached0;
    }
    /** @type {YjsDecodedItem[]} */
    const chain = [];
    /** @type {Set<YjsDecodedItem>} */
    const seen = new Set();
    /** @type {YjsDecodedItem | null} */
    let cur = startItem;
    /** @type {{ parentKey: string | null, parentIdKey: string | null, parentSub: string | null } | null} */
    let res = null;
    while (cur) {
      const hit = resolvedParents.get(cur);
      if (hit) {
        res = hit;
        break;
      }
      if (cur.parentKey !== null || cur.parentId !== null) {
        res = {
          parentKey: cur.parentKey,
          parentIdKey: cur.parentId
            ? `${cur.parentId.client}:${cur.parentId.clock}`
            : null,
          parentSub: cur.parentSub,
        };
        break;
      }
      if (seen.has(cur)) {
        res = { parentKey: null, parentIdKey: null, parentSub: null };
        break;
      }
      seen.add(cur);
      chain.push(cur);
      const ref = cur.origin || cur.rightOrigin;
      cur = ref ? findItem(ref) : null;
    }
    const finalRes = res || {
      parentKey: null,
      parentIdKey: null,
      parentSub: null,
    };
    for (const node of chain) {
      resolvedParents.set(node, finalRes);
    }
    if (cur && !resolvedParents.has(cur)) {
      resolvedParents.set(cur, finalRes);
    }
    return finalRes;
  };

  /**
   * Resolves the winning live Y.Map entry for a `(parent, parentSub)` bucket
   * using deterministic YATA sibling integration (arrival-order independent).
   *
   * @param {YjsDecodedItem[]} bucket
   * @returns {YjsDecodedItem | null}
   */
  const pickLiveMapEntry = bucket => {
    if (bucket.length === 0) {
      return null;
    }
    if (bucket.length === 1) {
      return bucket[0].deleted ? null : bucket[0];
    }
    /** @type {Map<string, YjsDecodedItem>} */
    const bucketByKey = new Map();
    for (const it of bucket) {
      bucketByKey.set(`${it.client}:${it.clock}`, it);
    }
    const sorted = [...bucket].sort(
      (a, b) => a.client - b.client || a.clock - b.clock
    );
    /** @type {YjsDecodedItem[]} */
    const ordered = [];
    /** @type {Set<YjsDecodedItem>} */
    const placed = new Set();
    /** @type {Set<YjsDecodedItem>} */
    const active = new Set();
    for (const root of sorted) {
      if (placed.has(root)) {
        continue;
      }
      /** @type {Array<[YjsDecodedItem, boolean]>} */
      const stack = [[root, false]];
      while (stack.length > 0) {
        const frame = stack.pop();
        if (!frame) {
          break;
        }
        const [node, expanded] = frame;
        if (placed.has(node)) {
          continue;
        }
        if (expanded) {
          active.delete(node);
          placed.add(node);
          ordered.push(node);
          continue;
        }
        if (active.has(node)) {
          continue;
        }
        active.add(node);
        stack.push([node, true]);
        if (node.rightOrigin) {
          const depR = bucketByKey.get(
            `${node.rightOrigin.client}:${node.rightOrigin.clock}`
          );
          if (depR && !placed.has(depR)) {
            stack.push([depR, false]);
          }
        }
        if (node.origin) {
          const depL = bucketByKey.get(
            `${node.origin.client}:${node.origin.clock}`
          );
          if (depL && !placed.has(depL)) {
            stack.push([depL, false]);
          }
        }
      }
    }
    /** @type {YjsDecodedItem[]} */
    const seq = [];
    /** @param {{ client: number, clock: number } | null} id */
    const indexOfId = id => {
      if (!id) {
        return null;
      }
      for (let i = 0; i < seq.length; i += 1) {
        const cand = seq[i];
        if (
          cand.client === id.client &&
          cand.clock <= id.clock &&
          id.clock < cand.clock + Math.max(1, cand.len)
        ) {
          return i;
        }
      }
      return null;
    };
    for (const item of ordered) {
      const leftFound = indexOfId(item.origin);
      const rightFound = indexOfId(item.rightOrigin);
      const leftIdx = leftFound === null ? -1 : leftFound;
      const rightIdx = rightFound === null ? seq.length : rightFound;
      let insertAt = leftIdx + 1;
      let scanning = false;
      for (let i = leftIdx + 1; i < rightIdx; i += 1) {
        const o = seq[i];
        const oLeftFound = indexOfId(o.origin);
        const oRightFound = indexOfId(o.rightOrigin);
        const oLeft = oLeftFound === null ? -1 : oLeftFound;
        const oRight = oRightFound === null ? seq.length : oRightFound;
        if (oLeft < leftIdx) {
          scanning = true;
        } else if (oLeft === leftIdx) {
          if (item.client < o.client) {
            scanning = false;
            break;
          }
          scanning = oRight !== rightIdx;
        }
        if (!scanning) {
          insertAt = i + 1;
        }
      }
      seq.splice(insertAt, 0, item);
    }
    const tail = seq[seq.length - 1];
    return tail && !tail.deleted ? tail : null;
  };

  /** @type {YjsDecodedItem[]} */
  const metaPagesBucket = [];
  for (const item of allItems) {
    const parent = resolveParent(item);
    if (parent.parentKey === 'meta' && parent.parentSub === 'pages') {
      metaPagesBucket.push(item);
    }
  }
  /** @type {Set<string>} */
  const pagesArrayIds = new Set();
  const livePagesArray = pickLiveMapEntry(metaPagesBucket);
  if (livePagesArray && livePagesArray.tag === 7) {
    pagesArrayIds.add(`${livePagesArray.client}:${livePagesArray.clock}`);
  }

  /** @type {Set<string>} */
  const pageMapIds = new Set();
  for (const item of allItems) {
    if (item.deleted || item.tag !== 7) {
      continue;
    }
    const parent = resolveParent(item);
    if (parent.parentIdKey && pagesArrayIds.has(parent.parentIdKey)) {
      pageMapIds.add(`${item.client}:${item.clock}`);
    }
  }

  /** @type {Map<string, YjsDecodedItem[]>} */
  const pageIdBuckets = new Map();
  for (const item of allItems) {
    const parent = resolveParent(item);
    if (
      parent.parentIdKey &&
      pageMapIds.has(parent.parentIdKey) &&
      parent.parentSub === 'id'
    ) {
      let bucket = pageIdBuckets.get(parent.parentIdKey);
      if (!bucket) {
        bucket = [];
        pageIdBuckets.set(parent.parentIdKey, bucket);
      }
      bucket.push(item);
    }
  }

  /** @type {Set<string>} */
  const livePageIds = new Set();
  for (const bucket of pageIdBuckets.values()) {
    const winner = pickLiveMapEntry(bucket);
    if (!winner || !winner.values || !winner.values.length) {
      continue;
    }
    const raw = winner.values[winner.values.length - 1];
    if (winner.tag === 2 && typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string' && parsed) {
          livePageIds.add(parsed);
        }
      } catch {
        // Ignore non-JSON string entry.
      }
    } else if (typeof raw === 'string' && raw) {
      livePageIds.add(raw);
    }
  }

  /** @type {Map<string, YjsDecodedItem[]>} */
  const spaceBuckets = new Map();
  /** @type {string[]} */
  const unkeyedSpaceGuids = [];
  for (const item of allItems) {
    const parent = resolveParent(item);
    if (parent.parentKey !== 'spaces') {
      continue;
    }
    if (parent.parentSub !== null) {
      let bucket = spaceBuckets.get(parent.parentSub);
      if (!bucket) {
        bucket = [];
        spaceBuckets.set(parent.parentSub, bucket);
      }
      bucket.push(item);
    } else if (
      pagesArrayIds.size === 0 &&
      !item.deleted &&
      item.tag === 9 &&
      item.guid
    ) {
      unkeyedSpaceGuids.push(item.guid);
    }
  }

  /** @type {Set<string>} */
  const guids = new Set(unkeyedSpaceGuids);
  /** @type {Map<string, string>} */
  const pageIdToGuid = new Map();
  for (const [spaceSub, bucket] of spaceBuckets) {
    if (pagesArrayIds.size > 0 && !livePageIds.has(spaceSub)) {
      continue;
    }
    const winner = pickLiveMapEntry(bucket);
    if (winner && winner.tag === 9 && winner.guid) {
      guids.add(winner.guid);
      pageIdToGuid.set(spaceSub, winner.guid);
    }
  }

  return { guids: [...guids], pageIdToGuid };
}

/**
 * Default pure-JS Yjs v1 subdoc GUID extractor used by
 * `createIdbV1ReadonlyReader` when no custom extractor is provided.
 *
 * @param {Uint8Array[]} rootUpdates
 * @returns {string[]}
 */
export function extractYjsV1SubdocIds(rootUpdates) {
  return extractYjsV1SubdocEntries(rootUpdates).guids;
}

/**
 * Creates a strictly read-only fallback reader for legacy Web IndexedDB V1
 * databases (`affine-local` for docs and `${workspaceId}_blob` for blobs),
 * aligned with `local.ts:197-210` and `nbstore/src/impls/idb/v1/*`.
 *
 * Never creates an empty V1 database when none exists, and never mutates V1
 * data. Uses a built-in pure-JS Yjs v1 `ContentDoc` extractor by default so
 * top-level V1 subdoc pages are discovered without external dependencies.
 *
 * @param {{
 *   workspaceId: string,
 *   indexedDB?: IDBFactory,
 *   mergeUpdates?: (updates: Uint8Array[]) => Uint8Array | Promise<Uint8Array>,
 *   extractSubdocIds?: (rootUpdates: Uint8Array[]) => Iterable<string> | Promise<Iterable<string>>,
 * }} options
 */
export function createIdbV1ReadonlyReader(options) {
  const workspaceId = options.workspaceId;
  const factory = options.indexedDB || globalThis.indexedDB;
  const configuredMergeUpdates =
    typeof options.mergeUpdates === 'function' ? options.mergeUpdates : null;
  const configuredExtractSubdocIds =
    typeof options.extractSubdocIds === 'function'
      ? options.extractSubdocIds
      : extractYjsV1SubdocIds;
  const blobDbName = `${workspaceId}_blob`;

  /**
   * Opens an existing V1 database strictly read-only. Never creates an object
   * store or empty database when the database does not already exist (even on
   * runtimes without `indexedDB.databases()`).
   *
   * @param {string} dbName
   * @param {string} storeName
   * @returns {Promise<IDBDatabase | null>}
   */
  async function openExistingV1(dbName, storeName) {
    if (!factory || typeof factory.open !== 'function') {
      return null;
    }
    if (typeof factory.databases === 'function') {
      const list = await factory.databases();
      if (!list.some(entry => entry.name === dbName)) {
        return null;
      }
    }
    return new Promise((resolve, reject) => {
      let abortedMissing = false;
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = event => {
        const target = /** @type {IDBOpenDBRequest} */ (event.target || req);
        const oldVersion =
          typeof event.oldVersion === 'number' ? event.oldVersion : 0;
        if (
          oldVersion === 0 ||
          !target.result?.objectStoreNames?.contains(storeName)
        ) {
          abortedMissing = true;
          target.transaction?.abort?.();
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (abortedMissing || !db || !db.objectStoreNames.contains(storeName)) {
          db?.close?.();
          resolve(null);
          return;
        }
        resolve(db);
      };
      req.onerror = () => {
        if (abortedMissing) {
          resolve(null);
          return;
        }
        reject(req.error || new Error(`Failed to open V1 DB ${dbName}`));
      };
    });
  }

  /**
   * Reads raw unmerged update frames for one document from V1 `affine-local`
   * (`workspace` store).
   *
   * @param {string} docId
   * @returns {Promise<{ docId: string, updates: Uint8Array[], timestamp: Date } | null>}
   */
  async function getV1DocRaw(docId) {
    const db = await openExistingV1(V1_DOC_DB_NAME, 'workspace');
    if (!db) {
      return null;
    }
    try {
      const tx = db.transaction('workspace', 'readonly');
      const done = transactionDone(tx);
      const record = await requestToPromise(
        tx.objectStore('workspace').get(docId)
      );
      await done;
      if (!record || !Array.isArray(record.updates) || !record.updates.length) {
        return null;
      }
      return {
        docId,
        updates: record.updates.map(entry => entry.update),
        timestamp: V1_CONST_TIMESTAMP,
      };
    } finally {
      db.close();
    }
  }

  /**
   * Reads one document from V1 `affine-local` (`workspace` store).
   * Requires `mergeUpdates` when more than one CRDT update exists.
   *
   * @param {string} docId
   * @param {{ mergeUpdates?: (updates: Uint8Array[]) => Uint8Array | Promise<Uint8Array> }} [opts]
   */
  async function getV1Doc(docId, opts = {}) {
    const raw = await getV1DocRaw(docId);
    if (!raw) {
      return null;
    }
    const merger =
      typeof opts.mergeUpdates === 'function'
        ? opts.mergeUpdates
        : configuredMergeUpdates;
    if (raw.updates.length > 1 && !merger) {
      throw new TypeError(
        'mergeUpdates callback is required to merge multiple V1 CRDT updates; use getV1DocRaw() for raw frames'
      );
    }
    const bin =
      raw.updates.length === 1 ? raw.updates[0] : await merger(raw.updates);
    return {
      docId,
      bin,
      timestamp: raw.timestamp,
    };
  }

  /**
   * Lists V1 document keys belonging to `workspaceId` in `affine-local`.
   * Matches root doc, top-level page `subdoc.guid` keys extracted from root
   * doc (or supplied via `opts.subdocIds`) that exist in `workspace`,
   * `db$<spaceId>$...`, and 3- or 4-segment
   * `userdata$<uid>$<spaceId>[$<docOrTable>]` keys.
   *
   * @param {{
   *   subdocIds?: Iterable<string>,
   *   extractSubdocIds?: (rootUpdates: Uint8Array[]) => Iterable<string> | Promise<Iterable<string>>,
   * }} [opts]
   * @returns {Promise<string[]>}
   */
  async function listV1DocIds(opts = {}) {
    const db = await openExistingV1(V1_DOC_DB_NAME, 'workspace');
    if (!db) {
      return [];
    }
    try {
      const tx = db.transaction('workspace', 'readonly');
      const done = transactionDone(tx);
      const store = tx.objectStore('workspace');
      const extractor =
        typeof opts.extractSubdocIds === 'function'
          ? opts.extractSubdocIds
          : configuredExtractSubdocIds;
      const [rawKeys, rootRecord] = await Promise.all([
        requestToPromise(store.getAllKeys()),
        extractor
          ? requestToPromise(store.get(workspaceId))
          : Promise.resolve(null),
      ]);
      await done;
      const keys = rawKeys.map(String);
      const keySet = new Set(keys);
      /** @type {Uint8Array[]} */
      const rootUpdates =
        rootRecord && Array.isArray(rootRecord.updates)
          ? rootRecord.updates.map(entry => entry.update)
          : [];

      /** @type {Set<string>} */
      const matched = new Set();
      if (keySet.has(workspaceId)) {
        matched.add(workspaceId);
      }
      if (opts.subdocIds) {
        for (const subId of opts.subdocIds) {
          if (typeof subId === 'string' && subId && keySet.has(subId)) {
            matched.add(subId);
          }
        }
      }
      if (extractor && rootUpdates.length) {
        const extracted = await extractor(rootUpdates);
        if (extracted) {
          for (const subId of extracted) {
            if (typeof subId === 'string' && subId && keySet.has(subId)) {
              matched.add(subId);
            }
          }
        }
      }

      const escaped = workspaceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const userDataRe = new RegExp(
        `^userdata\\$[\\w-]+\\$${escaped}(?:\\$[^$]+)?$`
      );
      for (const key of keys) {
        if (key.startsWith(`db$${workspaceId}$`) || userDataRe.test(key)) {
          matched.add(key);
        }
      }
      return [...matched];
    } finally {
      db.close();
    }
  }

  /**
   * Reads one blob from V1 `${workspaceId}_blob` (`blob` store).
   *
   * @param {string} key
   */
  async function getV1Blob(key) {
    const db = await openExistingV1(blobDbName, 'blob');
    if (!db) {
      return null;
    }
    try {
      const tx = db.transaction('blob', 'readonly');
      const done = transactionDone(tx);
      const raw = await requestToPromise(tx.objectStore('blob').get(key));
      await done;
      if (!raw) {
        return null;
      }
      const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      return {
        key,
        mime: '',
        data,
        createdAt: V1_CONST_TIMESTAMP,
      };
    } finally {
      db.close();
    }
  }

  return Object.freeze({
    readonly: true,
    workspaceId,
    getV1Doc,
    getV1DocRaw,
    listV1DocIds,
    getV1Blob,
  });
}

/**
 * Buffers pending CRDT updates and commits them in a real same-origin IDB
 * transaction (`oncomplete`). If the IDB transaction fails or aborts, all
 * pending writes stay intact in the buffer so navigation/handoff can abort
 * without losing user edits.
 *
 * @param {ReturnType<typeof createIdbWorkspaceStorage>} storage
 */
export function createPendingWriteFlusher(storage) {
  /** @type {PendingDocWrite[]} */
  let queue = [];
  /** @type {Promise<{ ok: boolean, flushedCount: number, pendingCount: number, error?: string }> | null} */
  let activeFlush = null;

  /** @param {PendingDocWrite} write */
  function enqueue(write) {
    queue.push(write);
  }

  /**
   * Drains all buffered writes sequentially in a single-flight loop so
   * overlapping `flush()` calls never duplicate commits or drop items enqueued
   * while a batch transaction is in flight.
   *
   * @returns {Promise<{ ok: boolean, flushedCount: number, pendingCount: number, error?: string }>}
   */
  async function drainLoop() {
    let totalFlushed = 0;
    while (queue.length > 0) {
      const batch = queue.slice();
      try {
        await storage.pushDocUpdatesBatch(batch);
        queue = queue.slice(batch.length);
        totalFlushed += batch.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          flushedCount: totalFlushed,
          pendingCount: queue.length,
          error: message,
        };
      }
    }
    return {
      ok: true,
      flushedCount: totalFlushed,
      pendingCount: queue.length,
    };
  }

  /**
   * Flushes all buffered writes into real IDB transactions with single-flight
   * serialization. Loops until both `queue` and any in-flight drain finish so
   * items enqueued right as an earlier flush settles are always persisted
   * before this promise resolves. Retains uncommitted writes if commit fails.
   *
   * @returns {Promise<{ ok: boolean, flushedCount: number, pendingCount: number, error?: string }>}
   */
  async function flush() {
    let totalFlushed = 0;
    while (queue.length > 0 || activeFlush) {
      if (!activeFlush) {
        const p = drainLoop();
        activeFlush = p;
        try {
          const r = await p;
          totalFlushed += r.flushedCount;
          if (!r.ok) {
            return {
              ok: false,
              flushedCount: totalFlushed,
              pendingCount: queue.length,
              error: r.error,
            };
          }
        } finally {
          if (activeFlush === p) {
            activeFlush = null;
          }
        }
      } else {
        const r = await activeFlush;
        if (!r.ok) {
          return r;
        }
      }
    }
    return {
      ok: true,
      flushedCount: totalFlushed,
      pendingCount: queue.length,
    };
  }

  return {
    enqueue,
    flush,
    pendingCount: () => queue.length,
    peekPending: () => queue.slice(),
  };
}
