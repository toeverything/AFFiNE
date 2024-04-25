import { describe, expect, test, vitest } from 'vitest';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { DocEngine } from '..';
import { MemoryStorage } from '../storage';
import { MiniSyncServer } from './utils';

describe('sync', () => {
  test('basic sync', async () => {
    const storage = new MemoryStorage();
    const server = new MiniSyncServer();
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
    const server = new MiniSyncServer();
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
    const server = new MiniSyncServer();
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
    const server = new MiniSyncServer();
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
    const server = new MiniSyncServer();
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
