import { apis } from '@affine/electron-api';
import type { ByteKV, ByteKVBehavior, DocStorage } from '@toeverything/infra';
import { AsyncLock, MemoryDocEventBus } from '@toeverything/infra';
import type { DBSchema, IDBPDatabase, IDBPObjectStore } from 'idb';
import { openDB } from 'idb';

export class SqliteDocStorage implements DocStorage {
  constructor(private readonly workspaceId: string) {}
  eventBus = new MemoryDocEventBus();
  readonly doc = new Doc(this.workspaceId);
  readonly syncMetadata = new KV(`${this.workspaceId}:sync-metadata`);
  readonly serverClock = new KV(`${this.workspaceId}:server-clock`);
}

type DocType = DocStorage['doc'];

class Doc implements DocType {
  lock = new AsyncLock();
  constructor(private readonly workspaceId: string) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
  }

  async transaction<T>(
    cb: (transaction: ByteKVBehavior) => Promise<T>
  ): Promise<T> {
    using _lock = await this.lock.acquire();
    return await cb(this);
  }

  keys(): string[] | Promise<string[]> {
    return [];
  }

  async get(docId: string) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    const update = await apis.db.getDocAsUpdates(
      this.workspaceId,
      this.workspaceId === docId ? undefined : docId
    );

    if (update) {
      if (
        update.byteLength === 0 ||
        (update.byteLength === 2 && update[0] === 0 && update[1] === 0)
      ) {
        return null;
      }

      return update;
    }

    return null;
  }

  async set(docId: string, data: Uint8Array) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    await apis.db.applyDocUpdate(
      this.workspaceId,
      data,
      this.workspaceId === docId ? undefined : docId
    );
  }

  clear(): void | Promise<void> {
    return;
  }

  del(): void | Promise<void> {
    return;
  }
}

interface KvDBSchema extends DBSchema {
  kv: {
    key: string;
    value: { key: string; val: Uint8Array };
  };
}

class KV implements ByteKV {
  constructor(private readonly dbName: string) {}

  dbPromise: Promise<IDBPDatabase<KvDBSchema>> | null = null;
  dbVersion = 1;

  upgradeDB(db: IDBPDatabase<KvDBSchema>) {
    db.createObjectStore('kv', { keyPath: 'key' });
  }

  getDb() {
    if (this.dbPromise === null) {
      this.dbPromise = openDB<KvDBSchema>(this.dbName, this.dbVersion, {
        upgrade: db => this.upgradeDB(db),
      });
    }
    return this.dbPromise;
  }

  async transaction<T>(
    cb: (transaction: ByteKVBehavior) => Promise<T>
  ): Promise<T> {
    const db = await this.getDb();
    const store = db.transaction('kv', 'readwrite').objectStore('kv');

    const behavior = new KVBehavior(store);
    return await cb(behavior);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const db = await this.getDb();
    const store = db.transaction('kv', 'readonly').objectStore('kv');
    return new KVBehavior(store).get(key);
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    const db = await this.getDb();
    const store = db.transaction('kv', 'readwrite').objectStore('kv');
    return new KVBehavior(store).set(key, value);
  }
  async keys(): Promise<string[]> {
    const db = await this.getDb();
    const store = db.transaction('kv', 'readwrite').objectStore('kv');
    return new KVBehavior(store).keys();
  }
  async clear() {
    const db = await this.getDb();
    const store = db.transaction('kv', 'readwrite').objectStore('kv');
    return new KVBehavior(store).clear();
  }
  async del(key: string) {
    const db = await this.getDb();
    const store = db.transaction('kv', 'readwrite').objectStore('kv');
    return new KVBehavior(store).del(key);
  }
}

class KVBehavior implements ByteKVBehavior {
  constructor(
    private readonly store: IDBPObjectStore<KvDBSchema, ['kv'], 'kv', any>
  ) {}

  async get(key: string): Promise<Uint8Array | null> {
    const value = await this.store.get(key);
    return value?.val ?? null;
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    if (this.store.put === undefined) {
      throw new Error('Cannot set in a readonly transaction');
    }
    await this.store.put({
      key: key,
      val: value,
    });
  }
  async keys(): Promise<string[]> {
    return await this.store.getAllKeys();
  }

  async del(key: string) {
    if (this.store.delete === undefined) {
      throw new Error('Cannot set in a readonly transaction');
    }
    return await this.store.delete(key);
  }

  async clear() {
    if (this.store.clear === undefined) {
      throw new Error('Cannot set in a readonly transaction');
    }
    return await this.store.clear();
  }
}
