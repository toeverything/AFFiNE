import 'fake-indexeddb/auto';

import { expect, test, vitest } from 'vitest';
import { Awareness } from 'y-protocols/awareness.js';
import { Doc as YDoc, encodeStateAsUpdate, mergeUpdates } from 'yjs';

import { AwarenessFrontend } from '../frontend/awareness';
import { DocFrontend } from '../frontend/doc';
import { BroadcastChannelAwarenessStorage } from '../impls/broadcast-channel/awareness';
import { IndexedDBDocStorage } from '../impls/idb';
import { AwarenessSyncImpl } from '../sync/awareness';
import { DocSyncImpl } from '../sync/doc';
import { expectYjsEqual } from './utils';

test.each([false, true])(
  'document merge and permanent deletion: %s',
  async customMerge => {
    const merge = customMerge
      ? vitest.fn(async (updates: Uint8Array[]) => mergeUpdates(updates))
      : undefined;
    const doc1 = new YDoc({
      guid: 'test-doc',
    });
    doc1.getMap('test').set('hello', 'world');

    const docStorage = new IndexedDBDocStorage({
      id: 'ws1',
      flavour: `a-${customMerge}`,
      type: 'workspace',
      mergeUpdates: merge,
    });

    docStorage.connection.connect();

    await docStorage.connection.waitForConnected();

    const frontend1 = new DocFrontend(docStorage, DocSyncImpl.dummy, {
      mergeUpdates: merge,
    });
    frontend1.start();
    frontend1.connectDoc(doc1);
    await vitest.waitFor(async () => {
      const doc = await docStorage.getDoc('test-doc');
      expectYjsEqual(doc!.bin, {
        test: {
          hello: 'world',
        },
      });
    });

    const doc2 = new YDoc({
      guid: 'test-doc',
    });
    const frontend2 = new DocFrontend(docStorage, DocSyncImpl.dummy, {
      mergeUpdates: merge,
    });
    frontend2.start();
    frontend2.connectDoc(doc2);

    await vitest.waitFor(async () => {
      expectYjsEqual(doc2, {
        test: {
          hello: 'world',
        },
      });
    });
    await frontend1.waitForUpdated('test-doc');
    await frontend2.waitForUpdated('test-doc');
    doc2.destroy();
    frontend2.stop();
    const lifecycle = vitest.fn(async (_id: string, action: string) => {
      if (action === 'delete') doc1.destroy();
      return { timestamp: new Date(1000) };
    });
    Object.assign(docStorage, { applyDocLifecycle: lifecycle });
    await frontend1.applyDocLifecycle('test-doc', 'trash');
    expect(await docStorage.getDoc('test-doc')).not.toBeNull();
    lifecycle.mockRejectedValueOnce(new Error('Delete denied'));
    await expect(
      frontend1.applyDocLifecycle('test-doc', 'delete')
    ).rejects.toThrow('Delete denied');
    expect(await docStorage.getDoc('test-doc')).not.toBeNull();

    if (merge) {
      expect(merge).toHaveBeenCalled();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      merge.mockImplementationOnce(async updates => {
        entered.resolve();
        await release.promise;
        return mergeUpdates(updates);
      });
      doc1.getMap('test').set('late', 'save');
      await entered.promise;
      const deleted = vitest.spyOn(docStorage, 'deleteDoc');
      const removing = frontend1.applyDocLifecycle('test-doc', 'delete');
      await vitest.waitFor(() => expect(lifecycle).toHaveBeenCalledTimes(3));
      expect(deleted).not.toHaveBeenCalled();
      release.resolve();
      await removing;
    } else {
      await frontend1.applyDocLifecycle('test-doc', 'delete');
    }
    expect(await docStorage.getDoc('test-doc')).toBeNull();
    frontend1.stop();
    if (merge) {
      const otherStorage = new IndexedDBDocStorage({
        id: 'ws1',
        flavour: `a-${customMerge}`,
        type: 'workspace',
      });
      otherStorage.connection.connect();
      await otherStorage.connection.waitForConnected();
      for (const action of ['append', 'compact', 'delete', 'recreate']) {
        const body = new YDoc({ guid: `compaction-${action}` });
        body.getMap('test').set('value', 'original');
        const first = await docStorage.pushDocUpdate({
          docId: body.guid,
          bin: encodeStateAsUpdate(body),
        });
        if (action === 'compact' || action === 'delete')
          await docStorage.getDoc(body.guid);
        body.getMap('test').set('second', true);
        const second = await docStorage.pushDocUpdate({
          docId: body.guid,
          bin: encodeStateAsUpdate(body),
        });
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        merge.mockImplementationOnce(async updates => {
          entered.resolve();
          await release.promise;
          return mergeUpdates(updates);
        });
        const reading = docStorage.getDoc(body.guid);
        await entered.promise;
        try {
          if (action === 'append' || action === 'compact') {
            if (action === 'compact') await otherStorage.getDoc(body.guid);
            body.getMap('test').set('late', true);
            await otherStorage.pushDocUpdate({
              docId: body.guid,
              bin: encodeStateAsUpdate(body),
            });
          } else {
            await otherStorage.deleteDoc(body.guid);
            expect(await otherStorage.getDoc(body.guid)).toBeNull();
            if (action === 'recreate') {
              const replacement = new YDoc({ guid: body.guid });
              replacement.getMap('replacement').set('value', 'new document');
              for (const clock of [first, second]) {
                const now = vitest
                  .spyOn(Date, 'now')
                  .mockReturnValue(clock.timestamp.getTime());
                try {
                  await otherStorage.pushDocUpdate({
                    docId: body.guid,
                    bin: encodeStateAsUpdate(replacement),
                  });
                } finally {
                  now.mockRestore();
                }
              }
              replacement.destroy();
            }
          }
        } finally {
          release.resolve();
        }
        const captured = await reading;
        expectYjsEqual(captured!.bin, {
          test: { value: 'original', second: true },
        });
        const snapshot = await otherStorage.db.get('snapshots', body.guid);
        const pending = await otherStorage.db.getAllFromIndex(
          'updates',
          'docId',
          body.guid
        );
        if (action === 'append' || action === 'compact') {
          expectYjsEqual(snapshot!.bin, {
            test: { value: 'original', second: true },
          });
          expect(pending).toHaveLength(1);
        } else {
          expect(snapshot).toBeUndefined();
          expect(pending).toHaveLength(action === 'recreate' ? 2 : 0);
        }
        if (action === 'delete') {
          expect(await otherStorage.getDoc(body.guid)).toBeNull();
          expect(await otherStorage.getDocTimestamp(body.guid)).toBeNull();
        } else {
          const current = await otherStorage.getDoc(body.guid);
          expectYjsEqual(
            current!.bin,
            action === 'recreate'
              ? { test: {}, replacement: { value: 'new document' } }
              : { test: { value: 'original', second: true, late: true } }
          );
        }
        body.destroy();
      }
      otherStorage.connection.disconnect();
    }
  }
);

test('awareness', async () => {
  const storage1 = new BroadcastChannelAwarenessStorage({
    id: 'ws1:a',
  });

  const storage2 = new BroadcastChannelAwarenessStorage({
    id: 'ws1:b',
  });

  storage1.connection.connect();
  storage2.connection.connect();

  await storage1.connection.waitForConnected();
  await storage2.connection.waitForConnected();

  // peer a
  const docA = new YDoc({ guid: 'test-doc' });
  docA.clientID = 1;
  const awarenessA = new Awareness(docA);

  // peer b
  const docB = new YDoc({ guid: 'test-doc' });
  docB.clientID = 2;
  const awarenessB = new Awareness(docB);

  // peer c
  const docC = new YDoc({ guid: 'test-doc' });
  docC.clientID = 3;
  const awarenessC = new Awareness(docC);

  {
    const sync = new AwarenessSyncImpl({
      local: storage1,
      remotes: {
        b: storage2,
      },
    });
    const frontend = new AwarenessFrontend(sync);
    frontend.connectAwareness(awarenessA);
    frontend.connectAwareness(awarenessB);
  }
  {
    const sync = new AwarenessSyncImpl({
      local: storage2,
      remotes: {
        a: storage1,
      },
    });
    const frontend = new AwarenessFrontend(sync);
    frontend.connectAwareness(awarenessC);
  }

  awarenessA.setLocalState({
    hello: 'world',
  });

  await vitest.waitFor(() => {
    expect(awarenessB.getStates().get(1)).toEqual({
      hello: 'world',
    });
    expect(awarenessC.getStates().get(1)).toEqual({
      hello: 'world',
    });
  });

  awarenessB.setLocalState({
    foo: 'bar',
  });

  await vitest.waitFor(() => {
    expect(awarenessA.getStates().get(2)).toEqual({
      foo: 'bar',
    });
    expect(awarenessC.getStates().get(2)).toEqual({
      foo: 'bar',
    });
  });

  awarenessC.setLocalState({
    baz: 'qux',
  });

  await vitest.waitFor(() => {
    expect(awarenessA.getStates().get(3)).toEqual({
      baz: 'qux',
    });
    expect(awarenessB.getStates().get(3)).toEqual({
      baz: 'qux',
    });
  });
});

test('doc priority requests accumulate', async () => {
  const docStorage = new IndexedDBDocStorage({
    id: 'ws-priority',
    flavour: 'a',
    type: 'workspace',
  });

  docStorage.connection.connect();

  await docStorage.connection.waitForConnected();

  const frontend = new DocFrontend(docStorage, DocSyncImpl.dummy);

  // two holders prioritize the same doc, then one of them goes away
  frontend.addPriority('high', 10);
  const releaseSecondHolder = frontend.addPriority('high', 10);
  releaseSecondHolder();

  frontend.addPriority('low', 5);

  const loadOrder: string[] = [];
  vitest.spyOn(docStorage, 'getDoc').mockImplementation(async docId => {
    loadOrder.push(docId);
    return null;
  });

  // both load jobs are queued before the main loop starts, so the queue
  // priority alone decides which doc is loaded first
  frontend.connectDoc(new YDoc({ guid: 'low' }));
  frontend.connectDoc(new YDoc({ guid: 'high' }));

  frontend.start();

  await vitest.waitFor(
    () => {
      expect(loadOrder).toEqual(['high', 'low']);
    },
    { timeout: 2000 }
  );

  frontend.stop();
});
