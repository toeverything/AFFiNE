import {
  createLazyProvider,
  type DatasourceDocAdapter,
} from '@affine/y-provider';
import { openDB } from 'idb';
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

const createDatasource = ({
  dbName = DEFAULT_DB_NAME,
  mergeCount,
}: {
  dbName?: string;
  mergeCount?: number;
}) => {
  let disconnected = false;
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });

  const adapter = {
    queryDocState: async (guid, options) => {
      const db = await dbPromise;
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');

      if (disconnected) {
        return false;
      }

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
      const db = await dbPromise;
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

  return {
    ...adapter,
    disconnect: async () => {
      disconnected = true;
      const db = await dbPromise;
      db.close();
    },
    cleanup: async () => {
      const db = await dbPromise;
      await db.clear('workspace');
    },
  };
};

export const createIndexedDBProvider = (
  doc: Doc,
  dbName: string = DEFAULT_DB_NAME
): IndexedDBProvider => {
  const datasource = createDatasource({ dbName, mergeCount });
  const provider = createLazyProvider(doc, datasource);

  return {
    ...provider,
    whenSynced: Promise.resolve(),
    connect: () => {
      provider.connect();
    },
    disconnect: () => {
      provider.disconnect();
      datasource.disconnect().catch(console.error);
    },
    cleanup: () => {
      return datasource.cleanup();
    },
    get connected() {
      return provider.connected;
    },
  };
};
