import { nanoid } from 'nanoid';
import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';

import { AsyncLock } from '../../../utils';
import type { DocServer } from '../server';
import { isEmptyUpdate } from '../utils';

export class MiniSyncServer {
  lock = new AsyncLock();
  db = new Map<string, { data: Uint8Array; clock: number }>();
  listeners = new Set<{
    cb: (updates: {
      docId: string;
      data: Uint8Array;
      serverClock: number;
    }) => void;
    clientId: string;
  }>();

  client() {
    return new MiniServerClient(nanoid(), this);
  }
}

export class MiniServerClient implements DocServer {
  constructor(
    private readonly id: string,
    private readonly server: MiniSyncServer
  ) {}

  async pullDoc(docId: string, stateVector: Uint8Array) {
    using _lock = await this.server.lock.acquire();
    const doc = this.server.db.get(docId);
    if (!doc) {
      return null;
    }
    const data = doc.data;
    return {
      data:
        !isEmptyUpdate(data) && stateVector.length > 0
          ? diffUpdate(data, stateVector)
          : data,
      serverClock: 0,
      stateVector: !isEmptyUpdate(data)
        ? encodeStateVectorFromUpdate(data)
        : new Uint8Array(),
    };
  }

  async pushDoc(
    docId: string,
    data: Uint8Array
  ): Promise<{ serverClock: number }> {
    using _lock = await this.server.lock.acquire();
    const doc = this.server.db.get(docId);
    const oldData = doc?.data ?? new Uint8Array();
    const newClock = (doc?.clock ?? 0) + 1;
    this.server.db.set(docId, {
      data: !isEmptyUpdate(data)
        ? !isEmptyUpdate(oldData)
          ? mergeUpdates([oldData, data])
          : data
        : oldData,
      clock: newClock,
    });
    for (const { clientId, cb } of this.server.listeners) {
      if (clientId !== this.id) {
        cb({
          docId,
          data,
          serverClock: newClock,
        });
      }
    }
    return { serverClock: newClock };
  }

  async loadServerClock(after: number): Promise<Map<string, number>> {
    using _lock = await this.server.lock.acquire();
    const map = new Map<string, number>();

    for (const [docId, { clock }] of this.server.db) {
      if (clock > after) {
        map.set(docId, clock);
      }
    }

    return map;
  }

  async subscribeAllDocs(
    cb: (updates: {
      docId: string;
      data: Uint8Array;
      serverClock: number;
    }) => void
  ): Promise<() => void> {
    const listener = { cb, clientId: this.id };
    this.server.listeners.add(listener);
    return () => {
      this.server.listeners.delete(listener);
    };
  }

  async waitForConnectingServer(): Promise<void> {}
  disconnectServer(): void {}
  onInterrupted(_cb: (reason: string) => void): void {}
}
