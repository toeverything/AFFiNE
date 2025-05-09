import 'fake-indexeddb/auto';

import { expect, test, vitest } from 'vitest';
import { Awareness } from 'y-protocols/awareness.js';
import { Doc as YDoc } from 'yjs';

import { AwarenessFrontend } from '../frontend/awareness';
import { DocFrontend } from '../frontend/doc';
import { BroadcastChannelAwarenessStorage } from '../impls/broadcast-channel/awareness';
import { IndexedDBDocStorage } from '../impls/idb';
import { AwarenessSyncImpl } from '../sync/awareness';
import { DocSyncImpl } from '../sync/doc';
import { expectYjsEqual } from './utils';

test('doc', async () => {
  const doc1 = new YDoc({
    guid: 'test-doc',
  });
  doc1.getMap('test').set('hello', 'world');

  const docStorage = new IndexedDBDocStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  docStorage.connection.connect();

  await docStorage.connection.waitForConnected();

  const frontend1 = new DocFrontend(docStorage, DocSyncImpl.dummy);
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
  const frontend2 = new DocFrontend(docStorage, DocSyncImpl.dummy);
  frontend2.start();
  frontend2.connectDoc(doc2);

  await vitest.waitFor(async () => {
    expectYjsEqual(doc2, {
      test: {
        hello: 'world',
      },
    });
  });
});

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
