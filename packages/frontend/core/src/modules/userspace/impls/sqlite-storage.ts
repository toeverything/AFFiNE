import { apis } from '@affine/electron-api';
import type {
  ByteKV,
  ByteKVBehavior,
  DocEvent,
  DocEventBus,
  DocStorage,
} from '@toeverything/infra';
import { AsyncLock } from '@toeverything/infra';

class BroadcastChannelDocEventBus implements DocEventBus {
  senderChannel = new BroadcastChannel('user-db:' + this.userId);
  constructor(private readonly userId: string) {}
  emit(event: DocEvent): void {
    this.senderChannel.postMessage(event);
  }

  on(cb: (event: DocEvent) => void): () => void {
    const listener = (event: MessageEvent<DocEvent>) => {
      cb(event.data);
    };
    const channel = new BroadcastChannel('user-db:' + this.userId);
    channel.addEventListener('message', listener);
    return () => {
      channel.removeEventListener('message', listener);
      channel.close();
    };
  }
}

export class SqliteUserspaceDocStorage implements DocStorage {
  constructor(private readonly userId: string) {}
  eventBus = new BroadcastChannelDocEventBus(this.userId);
  readonly doc = new Doc(this.userId);
  readonly syncMetadata = new SyncMetadataKV(this.userId);
  readonly serverClock = new ServerClockKV(this.userId);
}

type DocType = DocStorage['doc'];

class Doc implements DocType {
  lock = new AsyncLock();
  constructor(private readonly userId: string) {
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
      'userspace',
      this.userId,
      docId
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
    await apis.db.applyDocUpdate('userspace', this.userId, data, docId);
  }

  clear(): void | Promise<void> {
    return;
  }

  async del(docId: string) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    await apis.db.deleteDoc('userspace', this.userId, docId);
  }
}

class SyncMetadataKV implements ByteKV {
  constructor(private readonly userId: string) {}
  transaction<T>(cb: (behavior: ByteKVBehavior) => Promise<T>): Promise<T> {
    return cb(this);
  }

  get(key: string): Uint8Array | null | Promise<Uint8Array | null> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.getSyncMetadata('userspace', this.userId, key);
  }

  set(key: string, data: Uint8Array): void | Promise<void> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.setSyncMetadata('userspace', this.userId, key, data);
  }

  keys(): string[] | Promise<string[]> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.getSyncMetadataKeys('userspace', this.userId);
  }

  del(key: string): void | Promise<void> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.delSyncMetadata('userspace', this.userId, key);
  }

  clear(): void | Promise<void> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.clearSyncMetadata('userspace', this.userId);
  }
}

class ServerClockKV implements ByteKV {
  constructor(private readonly userId: string) {}
  transaction<T>(cb: (behavior: ByteKVBehavior) => Promise<T>): Promise<T> {
    return cb(this);
  }

  get(key: string): Uint8Array | null | Promise<Uint8Array | null> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.getServerClock('userspace', this.userId, key);
  }

  set(key: string, data: Uint8Array): void | Promise<void> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.setServerClock('userspace', this.userId, key, data);
  }

  keys(): string[] | Promise<string[]> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.getServerClockKeys('userspace', this.userId);
  }

  del(key: string): void | Promise<void> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.delServerClock('userspace', this.userId, key);
  }

  clear(): void | Promise<void> {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.clearServerClock('userspace', this.userId);
  }
}
