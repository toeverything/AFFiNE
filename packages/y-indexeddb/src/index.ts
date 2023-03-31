import { Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import type { DBSchema } from 'idb/build/entry';
import type { IDBPDatabase } from 'idb/build/entry';

const indexeddbOrigin = Symbol('indexeddb-provider-origin');
const mergeCount = 500;
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

export const createIndexedDBProvider = (
  blockSuiteWorkspace: Workspace
): IndexedDBProvider => {
  let resolve: () => void;
  const promise = new Promise<void>(_resolve => {
    resolve = _resolve;
  });
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
    const data = await store.get(id);
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
      store.put({
        ...data,
        updates: [
          {
            timestamp: Date.now(),
            update,
          },
        ],
      });
    } else {
      await store.put(data);
    }
  }
  const dbPromise = openDB<BlockSuiteBinaryDB>(
    blockSuiteWorkspace.id,
    dbVersion,
    {
      upgrade: upgradeDB,
    }
  );
  const handleDestroy = async () => {
    connect = true;
    destroy = true;
    const db = await dbPromise;
    db.close();
  };
  return {
    connect: async () => {
      connect = true;
      blockSuiteWorkspace.doc.on('update', handleUpdate);
      blockSuiteWorkspace.doc.on('destroy', handleDestroy);
      const db = await dbPromise;
      const store = db
        .transaction('workspace', 'readwrite')
        .objectStore('workspace');
      const data = await store.get(blockSuiteWorkspace.id);
      if (!connect) {
        return;
      }
      if (!data) {
        await db.add('workspace', {
          id: blockSuiteWorkspace.id,
          updates: [],
        });
      } else {
        data.updates.forEach(({ update }) => {
          Workspace.Y.applyUpdate(
            blockSuiteWorkspace.doc,
            update,
            indexeddbOrigin
          );
        });
      }
      resolve();
    },
    disconnect() {
      connect = false;
      blockSuiteWorkspace.doc.off('update', handleUpdate);
      blockSuiteWorkspace.doc.off('destroy', handleDestroy);
    },
    cleanup() {
      destroy = true;
      // todo
    },
    whenSynced: promise,
  };
};
