import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import {
  applyUpdate,
  diffUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVectorFromUpdate,
} from 'yjs';

import type { Storage } from '..';

export const dbVersion = 1;
export const DEFAULT_DB_NAME = 'affine-local';

export function mergeUpdates(updates: Uint8Array[]) {
  const doc = new Doc();
  doc.transact(() => {
    updates.forEach(update => {
      applyUpdate(doc, update);
    });
  });
  return encodeStateAsUpdate(doc);
}

type UpdateMessage = {
  timestamp: number;
  update: Uint8Array;
};

type WorkspacePersist = {
  id: string;
  updates: UpdateMessage[];
};

interface BlockSuiteBinaryDB extends DBSchema {
  workspace: {
    key: string;
    value: WorkspacePersist;
  };
  milestone: {
    key: string;
    value: unknown;
  };
}

export function upgradeDB(db: IDBPDatabase<BlockSuiteBinaryDB>) {
  db.createObjectStore('workspace', { keyPath: 'id' });
  db.createObjectStore('milestone', { keyPath: 'id' });
}

type ChannelMessage = {
  type: 'db-updated';
  payload: { docId: string; update: Uint8Array };
};

export function createIndexedDBStorage(
  workspaceId: string,
  dbName = DEFAULT_DB_NAME,
  mergeCount = 1
): Storage {
  let dbPromise: Promise<IDBPDatabase<BlockSuiteBinaryDB>> | null = null;
  const getDb = async () => {
    if (dbPromise === null) {
      dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
        upgrade: upgradeDB,
      });
    }
    return dbPromise;
  };

  // indexeddb could be shared between tabs, so we use broadcast channel to notify other tabs
  const channel = new BroadcastChannel('indexeddb:' + workspaceId);

  return {
    name: 'indexeddb',
    async pull(docId, state) {
      const db = await getDb();
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = await store.get(docId);

      if (!data) {
        return null;
      }

      const { updates } = data;
      const update = mergeUpdates(updates.map(({ update }) => update));

      const diff = state ? diffUpdate(update, state) : update;

      return { data: diff, state: encodeStateVectorFromUpdate(update) };
    },
    async push(docId, update) {
      const db = await getDb();
      const store = db
        .transaction('workspace', 'readwrite')
        .objectStore('workspace');

      // TODO: maybe we do not need to get data every time
      const { updates } = (await store.get(docId)) ?? { updates: [] };
      let rows: UpdateMessage[] = [
        ...updates,
        { timestamp: Date.now(), update },
      ];
      if (mergeCount && rows.length >= mergeCount) {
        const merged = mergeUpdates(rows.map(({ update }) => update));
        rows = [{ timestamp: Date.now(), update: merged }];
      }
      await store.put({
        id: docId,
        updates: rows,
      });
      channel.postMessage({
        type: 'db-updated',
        payload: { docId, update },
      } satisfies ChannelMessage);
    },
    async subscribe(cb, _disconnect) {
      function onMessage(event: MessageEvent<ChannelMessage>) {
        const { type, payload } = event.data;
        if (type === 'db-updated') {
          const { docId, update } = payload;
          cb(docId, update);
        }
      }
      channel.addEventListener('message', onMessage);
      return () => {
        channel.removeEventListener('message', onMessage);
      };
    },
  };
}
