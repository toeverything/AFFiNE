import 'fake-indexeddb/auto';

import { expect, test } from 'vitest';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import {
  IndexedDBBlobStorage,
  IndexedDBBlobSyncStorage,
  IndexedDBDocStorage,
  IndexedDBDocSyncStorage,
} from '../impls/idb';
import { SpaceStorage } from '../storage';
import { Sync } from '../sync';
import { expectYjsEqual } from './utils';

test('doc', async () => {
  const doc = new YDoc();
  doc.getMap('test').set('hello', 'world');
  const update = encodeStateAsUpdate(doc);

  const peerADoc = new IndexedDBDocStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const peerASync = new IndexedDBDocSyncStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const peerBDoc = new IndexedDBDocStorage({
    id: 'ws1',
    flavour: 'b',
    type: 'workspace',
  });
  const peerCDoc = new IndexedDBDocStorage({
    id: 'ws1',
    flavour: 'c',
    type: 'workspace',
  });

  const peerA = new SpaceStorage({
    doc: peerADoc,
    docSync: peerASync,
  });
  const peerB = new SpaceStorage({
    doc: peerBDoc,
  });
  const peerC = new SpaceStorage({
    doc: peerCDoc,
  });

  peerA.connect();
  peerB.connect();
  peerC.connect();

  await peerA.waitForConnected();
  await peerB.waitForConnected();
  await peerC.waitForConnected();

  await peerA.get('doc').pushDocUpdate({
    docId: 'doc1',
    bin: update,
  });

  const sync = new Sync({
    local: peerA,
    remotes: {
      b: peerB,
      c: peerC,
    },
  });
  sync.start();

  await new Promise(resolve => setTimeout(resolve, 1000));

  {
    const b = await peerB.get('doc').getDoc('doc1');
    expectYjsEqual(b!.bin, {
      test: {
        hello: 'world',
      },
    });

    const c = await peerC.get('doc').getDoc('doc1');
    expectYjsEqual(c!.bin, {
      test: {
        hello: 'world',
      },
    });
  }

  doc.getMap('test').set('foo', 'bar');
  const update2 = encodeStateAsUpdate(doc);
  await peerC.get('doc').pushDocUpdate({
    docId: 'doc1',
    bin: update2,
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  {
    const a = await peerA.get('doc').getDoc('doc1');
    expectYjsEqual(a!.bin, {
      test: {
        hello: 'world',
        foo: 'bar',
      },
    });

    const c = await peerC.get('doc').getDoc('doc1');
    expectYjsEqual(c!.bin, {
      test: {
        hello: 'world',
        foo: 'bar',
      },
    });
  }
});

test('blob', async () => {
  const a = new IndexedDBBlobStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const b = new IndexedDBBlobStorage({
    id: 'ws1',
    flavour: 'b',
    type: 'workspace',
  });

  const c = new IndexedDBBlobStorage({
    id: 'ws1',
    flavour: 'c',
    type: 'workspace',
  });

  const blobSync = new IndexedDBBlobSyncStorage({
    id: 'ws1',
    flavour: 'a',
    type: 'workspace',
  });

  const peerA = new SpaceStorage({
    blob: a,
    blobSync,
  });
  const peerB = new SpaceStorage({
    blob: b,
  });
  const peerC = new SpaceStorage({
    blob: c,
  });

  peerA.connect();
  peerB.connect();
  peerC.connect();

  await peerA.waitForConnected();
  await peerB.waitForConnected();
  await peerC.waitForConnected();

  await a.set({
    key: 'test',
    data: new Uint8Array([1, 2, 3, 4]),
    mime: 'text/plain',
    createdAt: new Date(100),
  });

  await c.set({
    key: 'test2',
    data: new Uint8Array([4, 3, 2, 1]),
    mime: 'text/plain',
    createdAt: new Date(100),
  });

  const sync = new Sync({
    local: peerA,
    remotes: {
      b: peerB,
      c: peerC,
    },
  });
  sync.start();

  await new Promise(resolve => setTimeout(resolve, 1000));

  {
    const a = await peerA.get('blob').get('test');
    expect(a).not.toBeNull();
    expect(a?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
  }

  {
    const b = await peerB.get('blob').get('test');
    expect(b).not.toBeNull();
    expect(b?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
  }

  {
    const c = await peerC.get('blob').get('test2');
    expect(c).not.toBeNull();
    expect(c?.data).toEqual(new Uint8Array([4, 3, 2, 1]));
  }
});
