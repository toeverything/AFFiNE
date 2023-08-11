import {
  createLazyProvider,
  type DatasourceDocAdapter,
  writeOperation,
} from '@affine/y-provider';
import { assertExists } from '@blocksuite/global/utils';
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

export function setMergeCount(count: number) {
  mergeCount = count;
}

const createDatasource = ({
  dbName,
  mergeCount,
}: {
  dbName: string;
  mergeCount?: number;
}) => {
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const adapter = {
    queryDocState: async (guid, options) => {
      try {
        const db = await dbPromise;
        const store = db
          .transaction('workspace', 'readonly')
          .objectStore('workspace');
        const data = await store.get(guid);

        if (!data) {
          return false;
        }

        const { updates } = data;
        const update = mergeUpdates(updates.map(({ update }) => update));

        const diff = options?.stateVector
          ? diffUpdate(update, options?.stateVector)
          : update;

        return diff;
      } catch (err: any) {
        if (!err.message?.includes('The database connection is closing.')) {
          throw err;
        }
        return false;
      }
    },
    sendDocUpdate: async (guid, update) => {
      try {
        const db = await dbPromise;
        const store = db
          .transaction('workspace', 'readwrite')
          .objectStore('workspace');

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
        await writeOperation(
          store.put({
            id: guid,
            updates: rows,
          })
        );
      } catch (err: any) {
        if (!err.message?.includes('The database connection is closing.')) {
          throw err;
        }
      }
    },
  } satisfies DatasourceDocAdapter;

  return {
    ...adapter,
    disconnect: () => {
      dbPromise.then(db => db.close()).catch(console.error);
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
  let datasource: ReturnType<typeof createDatasource> | null = null;
  let provider: ReturnType<typeof createLazyProvider> | null = null;

  const apis = {
    get status() {
      assertExists(provider);
      return provider.status;
    },
    subscribeStatusChange(onStatusChange) {
      assertExists(provider);
      return provider.subscribeStatusChange(onStatusChange);
    },
    connect: () => {
      if (apis.connected) {
        apis.disconnect();
      }
      datasource = createDatasource({ dbName, mergeCount });
      provider = createLazyProvider(doc, datasource, { origin: 'idb' });
      provider.connect();
    },
    disconnect: () => {
      datasource?.disconnect();
      provider?.disconnect();
      datasource = null;
      provider = null;
    },
    cleanup: async () => {
      await datasource?.cleanup();
    },
    get connected() {
      return provider?.connected || false;
    },
  } satisfies IndexedDBProvider;

  return apis;
};
