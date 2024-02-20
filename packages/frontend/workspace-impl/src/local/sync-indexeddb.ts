import { mergeUpdates, type SyncStorage } from '@toeverything/infra';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { diffUpdate, encodeStateVectorFromUpdate } from 'yjs';

export const dbVersion = 1;
export const DEFAULT_DB_NAME = 'affine-local';

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

export class IndexedDBSyncStorage implements SyncStorage {
  name = 'indexeddb';
  dbName = DEFAULT_DB_NAME;
  mergeCount = 1;
  dbPromise: Promise<IDBPDatabase<BlockSuiteBinaryDB>> | null = null;
  // indexeddb could be shared between tabs, so we use broadcast channel to notify other tabs
  channel = new BroadcastChannel('indexeddb:' + this.workspaceId);

  constructor(private readonly workspaceId: string) {}

  getDb() {
    if (this.dbPromise === null) {
      this.dbPromise = openDB<BlockSuiteBinaryDB>(this.dbName, dbVersion, {
        upgrade: upgradeDB,
      });
    }
    return this.dbPromise;
  }

  async pull(
    docId: string,
    state: Uint8Array
  ): Promise<{ data: Uint8Array; state?: Uint8Array | undefined } | null> {
    const db = await this.getDb();
    const store = db
      .transaction('workspace', 'readonly')
      .objectStore('workspace');
    const data = await store.get(docId);

    if (!data) {
      return null;
    }

    const { updates } = data;
    const update = mergeUpdates(updates.map(({ update }) => update));

    const diff = state.length ? diffUpdate(update, state) : update;

    return { data: diff, state: encodeStateVectorFromUpdate(update) };
  }

  async push(docId: string, data: Uint8Array): Promise<void> {
    const db = await this.getDb();
    const store = db
      .transaction('workspace', 'readwrite')
      .objectStore('workspace');

    // TODO: maybe we do not need to get data every time
    const { updates } = (await store.get(docId)) ?? { updates: [] };
    let rows: UpdateMessage[] = [
      ...updates,
      { timestamp: Date.now(), update: data },
    ];
    if (this.mergeCount && rows.length >= this.mergeCount) {
      const merged = mergeUpdates(rows.map(({ update }) => update));
      rows = [{ timestamp: Date.now(), update: merged }];
    }
    await store.put({
      id: docId,
      updates: rows,
    });
    this.channel.postMessage({
      type: 'db-updated',
      payload: { docId, update: data },
    } satisfies ChannelMessage);
  }
  async subscribe(cb: (docId: string, data: Uint8Array) => void) {
    function onMessage(event: MessageEvent<ChannelMessage>) {
      const { type, payload } = event.data;
      if (type === 'db-updated') {
        const { docId, update } = payload;
        cb(docId, update);
      }
    }
    this.channel.addEventListener('message', onMessage);
    return () => {
      this.channel.removeEventListener('message', onMessage);
    };
  }
}
