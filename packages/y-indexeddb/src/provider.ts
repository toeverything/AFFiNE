import { type IDBPDatabase, openDB } from 'idb';
import type { Doc } from 'yjs';
import {
  applyUpdate,
  encodeStateAsUpdate,
  encodeStateVectorFromUpdate,
  mergeUpdates,
} from 'yjs';

import type { BlockSuiteBinaryDB, IndexedDBProvider2 } from './shared';
import { dbVersion, DEFAULT_DB_NAME, upgradeDB } from './shared';

let mergeCount = 500;

export function setMergeCount(count: number) {
  mergeCount = count;
}

const indexeddbOrigin = Symbol('indexeddb-provider-origin');

/**
 * @internal
 */
const saveAlert = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  return (event.returnValue =
    'Data is not saved. Are you sure you want to leave?');
};

export const writeOperation = async (op: Promise<unknown>) => {
  window.addEventListener('beforeunload', saveAlert, {
    capture: true,
  });
  await op;
  window.removeEventListener('beforeunload', saveAlert, {
    capture: true,
  });
};

function getDoc(doc: Doc, guid: string): Doc | undefined {
  if (doc.guid === guid) {
    return doc;
  }
  for (const subdoc of doc.subdocs) {
    const found = getDoc(subdoc, guid);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export const createIndexedDBProvider2 = (
  rootDoc: Doc,
  dbName: string = DEFAULT_DB_NAME
): IndexedDBProvider2 => {
  let totalRc = 0; // refcount for all docs. If it is 0, we can close the db.
  const rcMap = new Map<string, number>();
  let dbPromise: Promise<IDBPDatabase<BlockSuiteBinaryDB>> | undefined;
  const updatesMap: Map<string, Uint8Array[]> = new Map(); // guid -> [snapshot, ...updates]

  const getDb = async () => {
    if (!dbPromise) {
      dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
        upgrade: upgradeDB,
      });
    }
    return dbPromise;
  };

  const getUpdatesCache = (guid: string): Uint8Array[] => {
    let updates = updatesMap.get(guid);
    if (!updates) {
      updates = [];
      updatesMap.set(guid, updates);
    }
    return updates;
  };

  const setUpdatesCache = (guid: string, updates: Uint8Array[]) => {
    updatesMap.set(guid, updates);
    return updates;
  };

  async function getDbTransaction<M extends IDBTransactionMode>(mode: M) {
    const db = await getDb();
    return db.transaction('workspace', mode).objectStore('workspace');
  }

  async function syncDoc(doc: Doc) {
    const guid = doc.guid;
    const start = performance.now();

    const t = await getDbTransaction('readwrite');
    const persisted = await t.get(guid);
    const currentUpdate = encodeStateAsUpdate(doc);
    const updates = setUpdatesCache(guid, [currentUpdate]);

    if (persisted) {
      const merged = mergeUpdates(
        persisted.updates.map(({ update }) => update)
      );
      applyUpdate(doc, merged, indexeddbOrigin);
      const newUpdate = encodeStateAsUpdate(
        doc,
        encodeStateVectorFromUpdate(merged)
      );
      updates.push(newUpdate);
    }

    await writeOperation(
      t.put({
        id: guid,
        updates: updates.map(u => {
          return {
            timestamp: Date.now(),
            update: u,
          };
        }),
      })
    );

    console.log(
      'idb: downloadAndApply',
      guid,
      (performance.now() - start).toFixed(2),
      'ms',
      doc.toJSON()
    );
  }

  const updateHandlerMap = new Map<
    string,
    (update: Uint8Array, origin: unknown) => void
  >();

  const createOrGetHandleUpdate = (doc: Doc) => {
    let handleUpdate = updateHandlerMap.get(doc.guid);
    if (!handleUpdate) {
      handleUpdate = async (update: Uint8Array, origin: unknown) => {
        if (origin === indexeddbOrigin) {
          return;
        }
        const t = await getDbTransaction('readwrite');
        const updates = getUpdatesCache(doc.guid);
        updates.push(update);

        // check rows length
        // todo: may not need to get it every time
        const rows = await t.count();
        if (rows + 1 > mergeCount) {
          const encoded = encodeStateAsUpdate(doc);
          await writeOperation(
            t.put({
              id: doc.guid,
              updates: [
                {
                  timestamp: Date.now(),
                  update: encoded,
                },
              ],
            })
          );
        } else {
          await writeOperation(
            t.put({
              id: doc.guid,
              updates: updates.map(u => {
                return {
                  timestamp: Date.now(),
                  update: u,
                };
              }),
            })
          );
        }
      };
      updateHandlerMap.set(doc.guid, handleUpdate);
    }
    return handleUpdate;
  };

  function setupListeners(doc: Doc) {
    doc.on('update', createOrGetHandleUpdate(doc));
  }

  function removeListeners(doc: Doc) {
    doc.off('update', createOrGetHandleUpdate(doc));
  }

  async function connect(guid: string) {
    let refcount = rcMap.get(guid) ?? 0;
    refcount++;
    totalRc++;
    rcMap.set(guid, refcount);
    // console.log('idb: connect', guid, refcount);
    if (refcount === 1) {
      const doc = getDoc(rootDoc, guid);
      if (doc) {
        await syncDoc(doc);
        setupListeners(doc);
      } else {
        // doc is not found, we may need to store it temporarily
        console.warn('idb: doc not found', guid);
      }
    }
  }

  function disconnect(guid: string) {
    let refcount = rcMap.get(guid) ?? 0;
    refcount--;
    totalRc--;
    rcMap.set(guid, refcount);
    // console.log('idb: disconnect', guid, refcount);
    if (totalRc === 0) {
      const _dbPromise = dbPromise;
      dbPromise = undefined;
      // fixme: deal with the case that DB is still in use gracefully
      setTimeout(() => {
        _dbPromise?.then(db => db.close()).catch(console.error);
      }, 500);
    }
    if (refcount === 0) {
      const doc = getDoc(rootDoc, guid);
      if (doc) {
        removeListeners(doc);
      }
    }
  }

  return {
    connect,
    disconnect,
  };
};
