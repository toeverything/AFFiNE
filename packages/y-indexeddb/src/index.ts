import { Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb/build/entry';

const indexeddbOrigin = Symbol('indexeddb-provider-origin');

let mergeCount = 500;

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

type UpdateMessage = {
  timestamp: number;
  update: Uint8Array;
};

type WorkspacePersist = {
  id: string;
  updates: UpdateMessage[];
};

type WorkspaceMilestone = {
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

export const createIndexedDBProvider = (
  blockSuiteWorkspace: Workspace
): IndexedDBProvider => {
  let allDb: IDBDatabaseInfo[];
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
    const id = blockSuiteWorkspace.id;
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
      const doc = new Workspace.Y.Doc();
      updates.forEach(update => {
        Workspace.Y.applyUpdate(doc, update, indexeddbOrigin);
      });
      const update = Workspace.Y.encodeStateAsUpdate(doc);
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

  const dbPromise = openDB<BlockSuiteBinaryDB>('affine-local', dbVersion, {
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
      blockSuiteWorkspace.doc.on('update', handleUpdate);
      blockSuiteWorkspace.doc.on('destroy', handleDestroy);
      // only run promise below, otherwise the logic is incorrect
      const db = await dbPromise;
      if (!allDb) {
        const allDb = await indexedDB.databases();
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
                    updates.every(update => update instanceof Uint8Array)
                  ) {
                    return;
                  }
                  const update = Workspace.Y.mergeUpdates(updates);
                  const workspaceTransaction = db
                    .transaction('workspace', 'readwrite')
                    .objectStore('workspace');
                  const data = await workspaceTransaction.get(name);
                  if (!data) {
                    await workspaceTransaction.put({
                      id: name,
                      updates: [
                        {
                          timestamp: Date.now(),
                          update,
                        },
                      ],
                    });
                    Workspace.Y.applyUpdate(
                      blockSuiteWorkspace.doc,
                      update,
                      indexeddbOrigin
                    );
                  }
                }
              );
            }
          })
        );
      }
      const store = db
        .transaction('workspace', 'readwrite')
        .objectStore('workspace');
      const data = await store.get(blockSuiteWorkspace.id);
      if (!connect) {
        return;
      }
      if (!data) {
        await db.put('workspace', {
          id: blockSuiteWorkspace.id,
          updates: [],
        });
      } else {
        const updates = data.updates.map(({ update }) => update);
        const update = Workspace.Y.mergeUpdates(updates);
        const newUpdate = Workspace.Y.diffUpdate(
          Workspace.Y.encodeStateAsUpdate(blockSuiteWorkspace.doc),
          update
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
        updates.forEach(update => {
          Workspace.Y.applyUpdate(
            blockSuiteWorkspace.doc,
            update,
            indexeddbOrigin
          );
        });
      }
      early = false;
      resolve();
    },
    disconnect() {
      connect = false;
      if (early) {
        reject();
      }
      blockSuiteWorkspace.doc.off('update', handleUpdate);
      blockSuiteWorkspace.doc.off('destroy', handleDestroy);
    },
    cleanup() {
      destroy = true;
      // todo
    },
    whenSynced: Promise.resolve(),
  };

  return apis;
};
