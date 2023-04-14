import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb/build/entry';
import {
  applyUpdate,
  diffUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  mergeUpdates,
  UndoManager,
} from 'yjs';

const indexeddbOrigin = Symbol('indexeddb-provider-origin');
const snapshotOrigin = Symbol('snapshot-origin');

let mergeCount = 500;

async function databaseExists(name: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = indexedDB.open(name);
    let existed = true;
    req.onsuccess = function () {
      req.result.close();
      if (!existed) {
        indexedDB.deleteDatabase(name);
      }
      resolve(existed);
    };
    req.onupgradeneeded = function () {
      existed = false;
    };
  });
}

export function revertUpdate(
  doc: Doc,
  snapshotUpdate: Uint8Array,
  getMetadata: (key: string) => 'Text' | 'Map' | 'Array'
) {
  const snapshotDoc = new Doc();
  applyUpdate(snapshotDoc, snapshotUpdate, snapshotOrigin);

  const currentStateVector = encodeStateVector(doc);
  const snapshotStateVector = encodeStateVector(snapshotDoc);

  const changesSinceSnapshotUpdate = encodeStateAsUpdate(
    doc,
    snapshotStateVector
  );
  const undoManager = new UndoManager(
    [...snapshotDoc.share.keys()].map(key => {
      const type = getMetadata(key);
      if (type === 'Text') {
        return snapshotDoc.getText(key);
      } else if (type === 'Map') {
        return snapshotDoc.getMap(key);
      } else if (type === 'Array') {
        return snapshotDoc.getArray(key);
      }
      throw new Error('Unknown type');
    }),
    {
      trackedOrigins: new Set([snapshotOrigin]),
    }
  );
  applyUpdate(snapshotDoc, changesSinceSnapshotUpdate, snapshotOrigin);
  undoManager.undo();
  const revertChangesSinceSnapshotUpdate = encodeStateAsUpdate(
    snapshotDoc,
    currentStateVector
  );
  applyUpdate(doc, revertChangesSinceSnapshotUpdate, snapshotOrigin);
}

export class EarlyDisconnectError extends Error {
  constructor() {
    super('Early disconnect');
  }
}

export function setMergeCount(count: number) {
  mergeCount = count;
}

export const dbVersion = 1;

export function upgradeDB(db: IDBPDatabase<BlockSuiteBinaryDB>) {
  db.createObjectStore('workspace', { keyPath: 'id' });
  db.createObjectStore('milestone', { keyPath: 'id' });
}

export interface IndexedDBProvider {
  connect: () => void;
  disconnect: () => void;
  cleanup: () => void;
  whenSynced: Promise<void>;
}

export type UpdateMessage = {
  timestamp: number;
  update: Uint8Array;
};

export type WorkspacePersist = {
  id: string;
  updates: UpdateMessage[];
};

export type WorkspaceMilestone = {
  id: string;
  milestone: Record<string, Uint8Array>;
};

export interface BlockSuiteBinaryDB extends DBSchema {
  workspace: {
    key: string;
    value: WorkspacePersist;
  };
  milestone: {
    key: string;
    value: WorkspaceMilestone;
  };
}

export interface OldYjsDB extends DBSchema {
  updates: {
    key: number;
    value: Uint8Array;
  };
}

export const markMilestone = async (
  id: string,
  doc: Doc,
  name: string,
  dbName = 'affine-local'
): Promise<void> => {
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const db = await dbPromise;
  const store = db
    .transaction('milestone', 'readwrite')
    .objectStore('milestone');
  const milestone = await store.get('id');
  const binary = encodeStateAsUpdate(doc);
  if (!milestone) {
    await store.put({
      id,
      milestone: {
        [name]: binary,
      },
    });
  } else {
    milestone.milestone[name] = binary;
    await store.put(milestone);
  }
};

export const getMilestones = async (
  id: string,
  dbName = 'affine-local'
): Promise<null | WorkspaceMilestone['milestone']> => {
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const db = await dbPromise;
  const store = db
    .transaction('milestone', 'readonly')
    .objectStore('milestone');
  const milestone = await store.get(id);
  if (!milestone) {
    return null;
  }
  return milestone.milestone;
};

let allDb: IDBDatabaseInfo[];

export const createIndexedDBProvider = (
  id: string,
  doc: Doc,
  dbName = 'affine-local'
): IndexedDBProvider => {
  let resolve: () => void;
  let reject: (reason?: unknown) => void;
  let early = true;
  let connect = false;
  let destroy = false;

  async function handleUpdate(update: Uint8Array, origin: unknown) {
    const db = await dbPromise;
    if (!connect) {
      return;
    }
    if (origin === indexeddbOrigin) {
      return;
    }
    const store = db
      .transaction('workspace', 'readwrite')
      .objectStore('workspace');
    let data = await store.get(id);
    if (!data) {
      data = {
        id,
        updates: [],
      };
    }
    data.updates.push({
      timestamp: Date.now(),
      update,
    });
    if (data.updates.length > mergeCount) {
      const updates = data.updates.map(({ update }) => update);
      const doc = new Doc();
      doc.transact(() => {
        updates.forEach(update => {
          applyUpdate(doc, update, indexeddbOrigin);
        });
      }, indexeddbOrigin);

      const update = encodeStateAsUpdate(doc);
      data = {
        id,
        updates: [
          {
            timestamp: Date.now(),
            update,
          },
        ],
      };
      await store.put(data);
    } else {
      await store.put(data);
    }
  }

  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const handleDestroy = async () => {
    connect = true;
    destroy = true;
    const db = await dbPromise;
    db.close();
  };
  const apis = {
    connect: async () => {
      apis.whenSynced = new Promise<void>((_resolve, _reject) => {
        early = true;
        resolve = _resolve;
        reject = _reject;
      });
      connect = true;
      doc.on('update', handleUpdate);
      doc.on('destroy', handleDestroy);
      // only run promise below, otherwise the logic is incorrect
      const db = await dbPromise;
      do {
        if (!allDb || localStorage.getItem(`${dbName}-migration`) !== 'true') {
          try {
            allDb = await indexedDB.databases();
          } catch {
            // in firefox, `indexedDB.databases` is not exist
            if (await databaseExists(id)) {
              await openDB<IDBPDatabase<OldYjsDB>>(id, 1).then(async oldDB => {
                if (!oldDB.objectStoreNames.contains('updates')) {
                  return;
                }
                const t = oldDB
                  .transaction('updates', 'readonly')
                  .objectStore('updates');
                const updates = await t.getAll();
                if (
                  !Array.isArray(updates) ||
                  !updates.every(update => update instanceof Uint8Array)
                ) {
                  return;
                }
                const update = mergeUpdates(updates);
                const workspaceTransaction = db
                  .transaction('workspace', 'readwrite')
                  .objectStore('workspace');
                const data = await workspaceTransaction.get(id);
                if (!data) {
                  console.log('upgrading the database');
                  await workspaceTransaction.put({
                    id,
                    updates: [
                      {
                        timestamp: Date.now(),
                        update,
                      },
                    ],
                  });
                }
              });
              break;
            }
          }
          // run the migration
          await Promise.all(
            allDb.map(meta => {
              if (meta.name && meta.version === 1) {
                const name = meta.name;
                const version = meta.version;
                return openDB<IDBPDatabase<OldYjsDB>>(name, version).then(
                  async oldDB => {
                    if (!oldDB.objectStoreNames.contains('updates')) {
                      return;
                    }
                    const t = oldDB
                      .transaction('updates', 'readonly')
                      .objectStore('updates');
                    const updates = await t.getAll();
                    if (
                      !Array.isArray(updates) ||
                      !updates.every(update => update instanceof Uint8Array)
                    ) {
                      return;
                    }
                    const update = mergeUpdates(updates);
                    const workspaceTransaction = db
                      .transaction('workspace', 'readwrite')
                      .objectStore('workspace');
                    const data = await workspaceTransaction.get(name);
                    if (!data) {
                      console.log('upgrading the database');
                      await workspaceTransaction.put({
                        id: name,
                        updates: [
                          {
                            timestamp: Date.now(),
                            update,
                          },
                        ],
                      });
                    }
                  }
                );
              }
            })
          );
          localStorage.setItem(`${dbName}-migration`, 'true');
          break;
        }
        // eslint-disable-next-line no-constant-condition
      } while (false);
      const store = db
        .transaction('workspace', 'readwrite')
        .objectStore('workspace');
      const data = await store.get(id);
      if (!connect) {
        return;
      }
      if (!data) {
        await db.put('workspace', {
          id,
          updates: [],
        });
      } else {
        const updates = data.updates.map(({ update }) => update);
        const fakeDoc = new Doc();
        fakeDoc.transact(() => {
          updates.forEach(update => {
            applyUpdate(fakeDoc, update);
          });
        }, indexeddbOrigin);
        const newUpdate = diffUpdate(
          encodeStateAsUpdate(doc),
          encodeStateAsUpdate(fakeDoc)
        );
        await store.put({
          ...data,
          updates: [
            ...data.updates,
            {
              timestamp: Date.now(),
              update: newUpdate,
            },
          ],
        });
        doc.transact(() => {
          updates.forEach(update => {
            applyUpdate(doc, update);
          });
        }, indexeddbOrigin);
      }
      early = false;
      resolve();
    },
    disconnect() {
      connect = false;
      if (early) {
        reject(new EarlyDisconnectError());
      }
      doc.off('update', handleUpdate);
      doc.off('destroy', handleDestroy);
    },
    cleanup() {
      destroy = true;
      // todo
    },
    whenSynced: Promise.resolve(),
  };

  return apis;
};
