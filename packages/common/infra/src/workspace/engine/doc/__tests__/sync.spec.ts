import { nanoid } from 'nanoid';
import { describe, expect, test, vitest } from 'vitest';
import {
  diffUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVectorFromUpdate,
  mergeUpdates,
} from 'yjs';

import { AsyncLock } from '../../../../utils';
import { DocEngine } from '..';
import type { DocServer } from '../server';
import { MemoryStorage } from '../storage';
import { isEmptyUpdate } from '../utils';

class MiniServer {
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

class MiniServerClient implements DocServer {
  constructor(
    private readonly id: string,
    private readonly server: MiniServer
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

describe('sync', () => {
  test('basic sync', async () => {
    const storage = new MemoryStorage();
    const server = new MiniServer();
    const engine = new DocEngine(storage, server.client()).start();
    const doc = new YDoc({ guid: 'a' });
    engine.addDoc(doc);
    const map = doc.getMap('aaa');
    map.set('a', 1);

    await engine.waitForSynced();
    expect(server.db.size).toBe(1);
    expect(storage.docDb.keys().length).toBe(1);
  });

  test('can pull from server', async () => {
    const server = new MiniServer();
    {
      const engine = new DocEngine(
        new MemoryStorage(),
        server.client()
      ).start();
      const doc = new YDoc({ guid: 'a' });
      engine.addDoc(doc);
      const map = doc.getMap('aaa');
      map.set('a', 1);
      await engine.waitForSynced();
      expect(server.db.size).toBe(1);
    }
    {
      const engine = new DocEngine(
        new MemoryStorage(),
        server.client()
      ).start();
      const doc = new YDoc({ guid: 'a' });
      engine.addDoc(doc);
      await engine.waitForSynced();
      expect(doc.getMap('aaa').get('a')).toBe(1);
    }
  });

  test('2 client', async () => {
    const server = new MiniServer();
    await Promise.all([
      (async () => {
        const engine = new DocEngine(
          new MemoryStorage(),
          server.client()
        ).start();
        const doc = new YDoc({ guid: 'a' });
        engine.addDoc(doc);
        const map = doc.getMap('aaa');
        map.set('a', 1);
        await vitest.waitUntil(() => {
          return map.get('b') === 2;
        });
      })(),
      (async () => {
        const engine = new DocEngine(
          new MemoryStorage(),
          server.client()
        ).start();
        const doc = new YDoc({ guid: 'a' });
        engine.addDoc(doc);
        const map = doc.getMap('aaa');
        map.set('b', 2);
        await vitest.waitUntil(() => {
          return map.get('a') === 1;
        });
      })(),
    ]);
  });

  test('2 client share storage and eventBus (simulate different tabs in same browser)', async () => {
    const server = new MiniServer();
    const storage = new MemoryStorage();

    await Promise.all([
      (async () => {
        const engine = new DocEngine(storage, server.client()).start();
        const doc = new YDoc({ guid: 'a' });
        engine.addDoc(doc);

        const map = doc.getMap('aaa');
        map.set('a', 1);
        await vitest.waitUntil(() => map.get('b') === 2);
      })(),
      (async () => {
        const engine = new DocEngine(storage, server.client()).start();
        const doc = new YDoc({ guid: 'a' });
        engine.addDoc(doc);
        const map = doc.getMap('aaa');
        map.set('b', 2);
        await vitest.waitUntil(() => map.get('a') === 1);
      })(),
    ]);
  });

  test('legacy data', async () => {
    const server = new MiniServer();
    const storage = new MemoryStorage();

    {
      // write legacy data to storage
      const doc = new YDoc({ guid: 'a' });
      const map = doc.getMap('aaa');
      map.set('a', 1);

      await storage.doc.set('a', encodeStateAsUpdate(doc));
    }

    const engine = new DocEngine(storage, server.client()).start();
    const doc = new YDoc({ guid: 'a' });
    engine.addDoc(doc);

    // should load to ydoc and save to server
    await vitest.waitUntil(
      () => doc.getMap('aaa').get('a') === 1 && server.db.size === 1
    );
  });
});
