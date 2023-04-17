import { openDB } from 'idb';
import { mergeUpdates } from 'yjs';

import type { BlockSuiteBinaryDB, UpdateMessage } from './shared';
import { dbVersion, DEFAULT_DB_NAME, upgradeDB } from './shared';

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
