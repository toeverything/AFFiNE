import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb/build/entry';
import { mergeUpdates } from 'yjs';

import type { BlockSuiteBinaryDB, OldYjsDB, UpdateMessage } from './shared';
import { dbVersion, DEFAULT_DB_NAME, upgradeDB } from './shared';

let allDb: IDBDatabaseInfo[];

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

/**
 * try to migrate the old database to the new database
 * this function will be removed in the future
 * since we don't need to support the old database
 */
export async function tryMigrate(
  db: IDBPDatabase<BlockSuiteBinaryDB>,
  id: string,
  dbName = DEFAULT_DB_NAME
) {
  do {
    if (!allDb || localStorage.getItem(`${dbName}-migration`) !== 'true') {
      try {
        allDb = await indexedDB.databases();
      } catch {
        // in firefox, `indexedDB.databases` is not existed
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
}

export async function downloadBinary(
  id: string,
  dbName = DEFAULT_DB_NAME
): Promise<UpdateMessage['update']> {
  const dbPromise = openDB<BlockSuiteBinaryDB>(dbName, dbVersion, {
    upgrade: upgradeDB,
  });
  const db = await dbPromise;
  const t = db.transaction('workspace', 'readonly').objectStore('workspace');
  const doc = await t.get(id);
  if (!doc) {
    return new Uint8Array(0);
  } else {
    return mergeUpdates(doc.updates.map(({ update }) => update));
  }
}
