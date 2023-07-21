import {
  createLazyProvider,
  type DatasourceDocAdapter,
} from '@affine/y-provider';
import { type IDBPDatabase, openDB } from 'idb';
import type { Doc } from 'yjs';
import { diffUpdate, mergeUpdates } from 'yjs';

import {
  type BlockSuiteBinaryDB,
  dbVersion,
  DEFAULT_DB_NAME,
  type IndexedDBProvider,
  type UpdateMessage,
  upgradeDB,
} from './shared';

let mergeCount = 500;

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

export function setMergeCount(count: number) {
  mergeCount = count;
}

type Ref<T> = { current: T };
type DbPromiseRef = Ref<Promise<IDBPDatabase<BlockSuiteBinaryDB>> | null>;

const createDatasource = ({
  dbRef,
  mergeCount,
}: {
  dbRef: DbPromiseRef;
  mergeCount?: number;
}) => {
  const disconnected = false;

  const adapter = {
    queryDocState: async (guid, options) => {
      if (!dbRef.current) {
        return false;
      }
      const db = await dbRef.current;
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = await store.get(guid);

      if (!data || disconnected) {
        return false;
      }

      const { updates } = data;
      const update = mergeUpdates(updates.map(({ update }) => update));

      const diff = options?.stateVector
        ? diffUpdate(update, options?.stateVector)
        : update;

      return diff;
    },
    sendDocUpdate: async (guid, update) => {
      if (!dbRef.current) {
        return;
      }
      const db = await dbRef.current;
      const store = db
        .transaction('workspace', 'readwrite')
        .objectStore('workspace');

      if (disconnected) {
        return;
      }

      // TODO: maybe we do not need to get data every time
      const { updates } = (await store.get(guid)) ?? { updates: [] };
      let rows: UpdateMessage[] = [
        ...updates,
        { timestamp: Date.now(), update },
      ];
      if (mergeCount && rows.length >= mergeCount) {
        const merged = mergeUpdates(rows.map(({ update }) => update));
        rows = [{ timestamp: Date.now(), update: merged }];
      }

      if (disconnected) {
        return;
      }

      await store.put({
        id: guid,
        updates: rows,
      });
    },
  } satisfies DatasourceDocAdapter;

  return adapter;
};

export const createIndexedDBProvider = (
  doc: Doc,
  dbName: string = DEFAULT_DB_NAME
): IndexedDBProvider => {
  const dbRef: DbPromiseRef = { current: null };
  const datasource = createDatasource({ dbRef, mergeCount });
  const provider = createLazyProvider(doc, datasource);

  return {
    ...provider,
    whenSynced: Promise.resolve(),
    connect: () => {
      dbRef.current = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
        upgrade: upgradeDB,
      });
      provider.connect();
    },
    disconnect: () => {
      dbRef.current?.then(db => db.close()).catch(console.error);
      dbRef.current = null;
      provider.disconnect();
    },
    cleanup: async () => {
      return dbRef.current
        ?.then(db => db.clear('workspace'))
        .catch(console.error);
    },
    get connected() {
      return provider.connected;
    },
  };
};
