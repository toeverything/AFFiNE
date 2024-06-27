import { mergeUpdates } from 'yjs';

import type { ByteKV, Memento } from '../../storage';
import { MemoryMemento, ReadonlyByteKV, wrapMemento } from '../../storage';
import { AsyncLock, throwIfAborted } from '../../utils';
import type { DocEventBus } from '.';
import { DocEventBusInner, MemoryDocEventBus } from './event';
import { isEmptyUpdate } from './utils';

export interface DocStorage {
  eventBus: DocEventBus;
  doc: ByteKV;
  syncMetadata: ByteKV;
  serverClock: ByteKV;
}

const Keys = {
  SeqNum: (docId: string) => `${docId}:seqNum`,
  SeqNumPushed: (docId: string) => `${docId}:seqNumPushed`,
  ServerClockPulled: (docId: string) => `${docId}:serverClockPulled`,
  UpdatedTime: (docId: string) => `${docId}:updateTime`,
};

const Values = {
  UInt64: {
    parse: (buffer: Uint8Array) => {
      const view = new DataView(buffer.buffer);
      return Number(view.getBigUint64(0, false));
    },
    serialize: (value: number) => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setBigUint64(0, BigInt(value), false);
      return new Uint8Array(buffer);
    },
  },
};

export class DocStorageInner {
  public readonly eventBus = new DocEventBusInner(this.behavior.eventBus);
  constructor(public readonly behavior: DocStorage) {}

  async loadServerClock(signal?: AbortSignal): Promise<Map<string, number>> {
    throwIfAborted(signal);
    const list = await this.behavior.serverClock.keys();

    const map = new Map<string, number>();
    for (const key of list) {
      const docId = key;
      const value = await this.behavior.serverClock.get(key);
      if (value) {
        map.set(docId, Values.UInt64.parse(value));
      }
    }

    return map;
  }

  async saveServerClock(map: Map<string, number>, signal?: AbortSignal) {
    throwIfAborted(signal);
    await this.behavior.serverClock.transaction(async transaction => {
      for (const [docId, value] of map) {
        const key = docId;
        const oldBuffer = await transaction.get(key);
        const old = oldBuffer ? Values.UInt64.parse(oldBuffer) : 0;
        if (old < value) {
          await transaction.set(key, Values.UInt64.serialize(value));
        }
      }
    });
  }

  async loadDocSeqNum(docId: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    const bytes = await this.behavior.syncMetadata.get(Keys.SeqNum(docId));
    if (bytes === null) {
      return 0;
    }
    return Values.UInt64.parse(bytes);
  }

  async saveDocSeqNum(
    docId: string,
    seqNum: number | true,
    signal?: AbortSignal
  ) {
    throwIfAborted(signal);
    return await this.behavior.syncMetadata.transaction(async transaction => {
      const key = Keys.SeqNum(docId);
      const oldBytes = await transaction.get(key);
      const old = oldBytes ? Values.UInt64.parse(oldBytes) : 0;
      if (seqNum === true) {
        await transaction.set(key, Values.UInt64.serialize(old + 1));
        return old + 1;
      }
      if (old < seqNum) {
        await transaction.set(key, Values.UInt64.serialize(seqNum));
        return seqNum;
      }
      return old;
    });
  }

  async loadDocSeqNumPushed(docId: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    const bytes = await this.behavior.syncMetadata.get(
      Keys.SeqNumPushed(docId)
    );
    if (bytes === null) {
      return null;
    }
    return Values.UInt64.parse(bytes);
  }

  async saveDocPushedSeqNum(
    docId: string,
    seqNum: number | { add: number },
    signal?: AbortSignal
  ) {
    throwIfAborted(signal);
    await this.behavior.syncMetadata.transaction(async transaction => {
      const key = Keys.SeqNumPushed(docId);
      const oldBytes = await transaction.get(key);
      const old = oldBytes ? Values.UInt64.parse(oldBytes) : null;
      if (typeof seqNum === 'object') {
        return transaction.set(
          key,
          Values.UInt64.serialize((old ?? 0) + seqNum.add)
        );
      }
      if (old === null || old < seqNum) {
        return transaction.set(key, Values.UInt64.serialize(seqNum));
      }
    });
  }

  async loadDocServerClockPulled(docId: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    const bytes = await this.behavior.syncMetadata.get(
      Keys.ServerClockPulled(docId)
    );
    if (bytes === null) {
      return null;
    }
    return bytes ? Values.UInt64.parse(bytes) : 0;
  }

  async saveDocServerClockPulled(
    docId: string,
    serverClock: number,
    signal?: AbortSignal
  ) {
    throwIfAborted(signal);
    await this.behavior.syncMetadata.transaction(async transaction => {
      const oldBytes = await transaction.get(Keys.ServerClockPulled(docId));
      const old = oldBytes ? Values.UInt64.parse(oldBytes) : null;
      if (old === null || old < serverClock) {
        await transaction.set(
          Keys.ServerClockPulled(docId),
          Values.UInt64.serialize(serverClock)
        );
      }
    });
  }

  async loadDocFromLocal(docId: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    return await this.behavior.doc.get(docId);
  }

  /**
   * Confirm that server updates are applied in the order they occur!!!
   */
  async commitDocAsServerUpdate(
    docId: string,
    update: Uint8Array,
    serverClock: number,
    signal?: AbortSignal
  ) {
    throwIfAborted(signal);
    await this.behavior.doc.transaction(async tx => {
      const data = await tx.get(docId);
      await tx.set(
        docId,
        data && !isEmptyUpdate(data)
          ? !isEmptyUpdate(update)
            ? mergeUpdates([data, update])
            : data
          : update
      );
    });
    await this.saveDocServerClockPulled(docId, serverClock);
  }

  async commitDocAsClientUpdate(
    docId: string,
    update: Uint8Array,
    signal?: AbortSignal
  ) {
    throwIfAborted(signal);

    await this.behavior.doc.transaction(async tx => {
      const data = await tx.get(docId);
      await tx.set(
        docId,
        data && !isEmptyUpdate(data)
          ? !isEmptyUpdate(update)
            ? mergeUpdates([data, update])
            : data
          : update
      );
    });

    return await this.saveDocSeqNum(docId, true);
  }

  clearSyncMetadata() {
    return this.behavior.syncMetadata.clear();
  }

  async clearServerClock() {
    return this.behavior.serverClock.clear();
  }
}

export class ReadonlyStorage implements DocStorage {
  constructor(
    private readonly map: {
      [key: string]: Uint8Array;
    }
  ) {}

  eventBus = new MemoryDocEventBus();
  doc = new ReadonlyByteKV(new Map(Object.entries(this.map)));
  serverClock = new ReadonlyByteKV();
  syncMetadata = new ReadonlyByteKV();
}

export class MemoryStorage implements DocStorage {
  constructor(private readonly memo: Memento = new MemoryMemento()) {}

  eventBus = new MemoryDocEventBus();
  lock = new AsyncLock();
  readonly docDb = wrapMemento(this.memo, 'doc:');
  readonly syncMetadataDb = wrapMemento(this.memo, 'syncMetadata:');
  readonly serverClockDb = wrapMemento(this.memo, 'serverClock:');

  readonly doc = {
    transaction: async cb => {
      using _lock = await this.lock.acquire();
      return await cb({
        get: async key => {
          return this.docDb.get(key) ?? null;
        },
        set: async (key, value) => {
          this.docDb.set(key, value);
        },
        keys: async () => {
          return Array.from(this.docDb.keys());
        },
        clear: () => {
          this.docDb.clear();
        },
        del: key => {
          this.docDb.del(key);
        },
      });
    },
    get(key) {
      return this.transaction(async tx => tx.get(key));
    },
    set(key, value) {
      return this.transaction(async tx => tx.set(key, value));
    },
    keys() {
      return this.transaction(async tx => tx.keys());
    },
    clear() {
      return this.transaction(async tx => tx.clear());
    },
    del(key) {
      return this.transaction(async tx => tx.del(key));
    },
  } satisfies ByteKV;

  readonly syncMetadata = {
    transaction: async cb => {
      using _lock = await this.lock.acquire();
      return await cb({
        get: async key => {
          return this.syncMetadataDb.get(key) ?? null;
        },
        set: async (key, value) => {
          this.syncMetadataDb.set(key, value);
        },
        keys: async () => {
          return Array.from(this.syncMetadataDb.keys());
        },
        clear: () => {
          this.syncMetadataDb.clear();
        },
        del: key => {
          this.syncMetadataDb.del(key);
        },
      });
    },
    get(key) {
      return this.transaction(async tx => tx.get(key));
    },
    set(key, value) {
      return this.transaction(async tx => tx.set(key, value));
    },
    keys() {
      return this.transaction(async tx => tx.keys());
    },
    clear() {
      return this.transaction(async tx => tx.clear());
    },
    del(key) {
      return this.transaction(async tx => tx.del(key));
    },
  } satisfies ByteKV;

  readonly serverClock = {
    transaction: async cb => {
      using _lock = await this.lock.acquire();
      return await cb({
        get: async key => {
          return this.serverClockDb.get(key) ?? null;
        },
        set: async (key, value) => {
          this.serverClockDb.set(key, value);
        },
        keys: async () => {
          return Array.from(this.serverClockDb.keys());
        },
        clear: () => {
          this.serverClockDb.clear();
        },
        del: key => {
          this.serverClockDb.del(key);
        },
      });
    },
    get(key) {
      return this.transaction(async tx => tx.get(key));
    },
    set(key, value) {
      return this.transaction(async tx => tx.set(key, value));
    },
    keys() {
      return this.transaction(async tx => tx.keys());
    },
    clear() {
      return this.transaction(async tx => tx.clear());
    },
    del(key) {
      return this.transaction(async tx => tx.del(key));
    },
  } satisfies ByteKV;
}
