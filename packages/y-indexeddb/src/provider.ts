import {
  createLazyProvider,
  type DatasourceDocAdapter,
  writeOperation,
} from '@affine/y-provider';
import { assertExists } from '@blocksuite/global/utils';
import type { IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { Doc } from 'yjs';
import { diffUpdate, encodeStateVectorFromUpdate } from 'yjs';

import {
  type BlockSuiteBinaryDB,
  dbVersion,
  DEFAULT_DB_NAME,
  type IndexedDBProvider,
  type UpdateMessage,
  upgradeDB,
} from './shared';
import { mergeUpdates } from './utils';

let mergeCount = 500;

export function setMergeCount(count: number) {
  mergeCount = count;
}

export const createIndexedDBDatasource = ({
  dbName,
  mergeCount,
}: {
  dbName: string;
  mergeCount?: number;
}) => {
  let dbPromise: Promise<IDBPDatabase<BlockSuiteBinaryDB>> | null = null;
  const getDb = async () => {
    if (dbPromise === null) {
      dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
        upgrade: upgradeDB,
      });
    }
    return dbPromise;
  };

  const adapter = {
    queryDocState: async (guid, options) => {
      try {
        const db = await getDb();
        const store = db
          .transaction('workspace', 'readonly')
          .objectStore('workspace');
        const data = await store.get(guid);

        if (!data) {
          return false;
        }

        const { updates } = data;
        const update = mergeUpdates(updates.map(({ update }) => update));

        const missing = options?.stateVector
          ? diffUpdate(update, options?.stateVector)
          : update;

        return { missing, state: encodeStateVectorFromUpdate(update) };
      } catch (err: any) {
        if (!err.message?.includes('The database connection is closing.')) {
          throw err;
        }
        return false;
      }
    },
    sendDocUpdate: async (guid, update) => {
      try {
        const db = await getDb();
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
      getDb()
        .then(db => db.close())
        .then(() => {
          dbPromise = null;
        })
        .catch(console.error);
    },
    cleanup: async () => {
      const db = await getDb();
      await db.clear('workspace');
    },
  };
};

/**
 * We use `doc.guid` as the unique key, please make sure it not changes.
 */
export const createIndexedDBProvider = (
  doc: Doc,
  dbName: string = DEFAULT_DB_NAME
): IndexedDBProvider => {
  const datasource = createIndexedDBDatasource({ dbName, mergeCount });
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
      provider = createLazyProvider(doc, datasource, { origin: 'idb' });
      provider.connect();
    },
    disconnect: () => {
      datasource?.disconnect();
      provider?.disconnect();
      provider = null;
    },
    cleanup: async () => {
      await datasource?.cleanup();
    },
    get connected() {
      return provider?.connected || false;
    },
    datasource,
  } satisfies IndexedDBProvider;

  return apis;
};
