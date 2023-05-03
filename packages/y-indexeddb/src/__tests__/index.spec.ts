/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { initPage } from '@affine/env/blocksuite';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists, uuidv4, Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { IndexeddbPersistence } from 'y-indexeddb';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import type { WorkspacePersist } from '../index';
import {
  createIndexedDBProvider,
  dbVersion,
  DEFAULT_DB_NAME,
  downloadBinary,
  getMilestones,
  markMilestone,
  revertUpdate,
  setMergeCount,
} from '../index';

async function getUpdates(id: string): Promise<Uint8Array[]> {
  const db = await openDB(rootDBName, dbVersion);
  const store = await db
    .transaction('workspace', 'readonly')
    .objectStore('workspace');
  const data = (await store.get(id)) as WorkspacePersist | undefined;
  assertExists(data, 'data should not be undefined');
  expect(data.id).toBe(id);
  return data.updates.map(({ update }) => update);
}

let id: string;
let workspace: Workspace;
const rootDBName = DEFAULT_DB_NAME;

beforeEach(() => {
  id = uuidv4();
  workspace = new Workspace({
    id,
    isSSR: true,
  });
  workspace.register(AffineSchemas).register(__unstableSchemas);
});

afterEach(() => {
  indexedDB.deleteDatabase('affine-local');
  localStorage.clear();
});

describe('indexeddb provider', () => {
  test('connect', async () => {
    const provider = createIndexedDBProvider(workspace.id, workspace.doc);
    provider.connect();
    await provider.whenSynced;
    const db = await openDB(rootDBName, dbVersion);
    {
      const store = await db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = await store.get(id);
      expect(data).toEqual({
        id,
        updates: [
          {
            timestamp: expect.any(Number),
            update: encodeStateAsUpdate(workspace.doc),
          },
        ],
      });
      const page = workspace.createPage('page0');
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:frame', {}, pageBlockId);
      page.addBlock('affine:paragraph', {}, frameId);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    {
      const store = await db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = (await store.get(id)) as WorkspacePersist | undefined;
      assertExists(data);
      expect(data.id).toBe(id);
      const testWorkspace = new Workspace({
        id: 'test',
      })
        .register(AffineSchemas)
        .register(__unstableSchemas);
      data.updates.forEach(({ update }) => {
        Workspace.Y.applyUpdate(testWorkspace.doc, update);
      });
      const binary = Workspace.Y.encodeStateAsUpdate(testWorkspace.doc);
      expect(binary).toEqual(Workspace.Y.encodeStateAsUpdate(workspace.doc));
    }

    const secondWorkspace = new Workspace({
      id,
    })
      .register(AffineSchemas)
      .register(__unstableSchemas);
    const provider2 = createIndexedDBProvider(
      secondWorkspace.id,
      secondWorkspace.doc,
      rootDBName
    );
    provider2.connect();
    await provider2.whenSynced;
    expect(Workspace.Y.encodeStateAsUpdate(secondWorkspace.doc)).toEqual(
      Workspace.Y.encodeStateAsUpdate(workspace.doc)
    );
  });

  test('disconnect suddenly', async () => {
    const provider = createIndexedDBProvider(
      workspace.id,
      workspace.doc,
      rootDBName
    );
    const fn = vi.fn();
    provider.connect();
    provider.disconnect();
    expect(fn).toBeCalledTimes(0);
    await provider.whenSynced.catch(fn);
    expect(fn).toBeCalledTimes(1);
  });

  test('connect and disconnect', async () => {
    const provider = createIndexedDBProvider(
      workspace.id,
      workspace.doc,
      rootDBName
    );
    provider.connect();
    const p1 = provider.whenSynced;
    await p1;
    const snapshot = encodeStateAsUpdate(workspace.doc);
    provider.disconnect();
    {
      const page = workspace.createPage('page0');
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:frame', {}, pageBlockId);
      page.addBlock('affine:paragraph', {}, frameId);
    }
    {
      const updates = await getUpdates(workspace.id);
      expect(updates.length).toBe(1);
      expect(updates[0]).toEqual(snapshot);
    }
    provider.connect();
    const p2 = provider.whenSynced;
    await p2;
    {
      const updates = await getUpdates(workspace.id);
      expect(updates).not.toEqual([]);
    }
    provider.disconnect();
    expect(p1).not.toBe(p2);
  });

  test('merge', async () => {
    setMergeCount(5);
    const provider = createIndexedDBProvider(
      workspace.id,
      workspace.doc,
      rootDBName
    );
    provider.connect();
    {
      const page = workspace.createPage('page0');
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:frame', {}, pageBlockId);
      for (let i = 0; i < 100; i++) {
        page.addBlock('affine:paragraph', {}, frameId);
      }
    }
    await provider.whenSynced;
    {
      const updates = await getUpdates(id);
      expect(updates.length).lessThanOrEqual(5);
    }
  });

  test("data won't be lost", async () => {
    const id = uuidv4();
    const doc = new Workspace.Y.Doc();
    const map = doc.getMap('map');
    for (let i = 0; i < 100; i++) {
      map.set(`${i}`, i);
    }
    {
      const provider = createIndexedDBProvider(id, doc, rootDBName);
      provider.connect();
      await provider.whenSynced;
      provider.disconnect();
    }
    {
      const newDoc = new Workspace.Y.Doc();
      const provider = createIndexedDBProvider(id, newDoc, rootDBName);
      provider.connect();
      await provider.whenSynced;
      provider.disconnect();
      newDoc.getMap('map').forEach((value, key) => {
        expect(value).toBe(parseInt(key));
      });
    }
  });

  test('migration', async () => {
    {
      const yDoc = new Doc();
      yDoc.getMap().set('foo', 'bar');
      const persistence = new IndexeddbPersistence('test', yDoc);
      await persistence.whenSynced;
      persistence.destroy();
    }
    {
      const yDoc = new Doc();
      const provider = createIndexedDBProvider('test', yDoc);
      provider.connect();
      await provider.whenSynced;
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(yDoc.getMap().get('foo')).toBe('bar');
    }
    localStorage.clear();
    {
      indexedDB.databases = vi.fn(async () => {
        throw new Error('not supported');
      });
      expect(indexedDB.databases).rejects.toThrow('not supported');
      const yDoc = new Doc();
      expect(indexedDB.databases).toBeCalledTimes(1);
      const provider = createIndexedDBProvider('test', yDoc);
      provider.connect();
      await provider.whenSynced;
      expect(indexedDB.databases).toBeCalledTimes(2);
      expect(yDoc.getMap().get('foo')).toBe('bar');
    }
  });

  test('beforeunload', async () => {
    const oldAddEventListener = window.addEventListener;
    window.addEventListener = vi.fn((event: string, fn, options) => {
      expect(event).toBe('beforeunload');
      return oldAddEventListener(event, fn, options);
    });
    const oldRemoveEventListener = window.removeEventListener;
    window.removeEventListener = vi.fn((event: string, fn, options) => {
      expect(event).toBe('beforeunload');
      return oldRemoveEventListener(event, fn, options);
    });
    const doc = new Doc();
    const provider = createIndexedDBProvider('1', doc);
    const map = doc.getMap('map');
    map.set('1', 1);
    provider.connect();
    await provider.whenSynced;

    expect(window.addEventListener).toBeCalledTimes(1);
    expect(window.removeEventListener).toBeCalledTimes(1);

    window.addEventListener = oldAddEventListener;
    window.removeEventListener = oldRemoveEventListener;
  });
});

describe('milestone', () => {
  test('milestone', async () => {
    const doc = new Doc();
    const map = doc.getMap('map');
    const array = doc.getArray('array');
    map.set('1', 1);
    array.push([1]);
    await markMilestone('1', doc, 'test1');
    const milestones = await getMilestones('1');
    assertExists(milestones);
    expect(milestones).toBeDefined();
    expect(Object.keys(milestones).length).toBe(1);
    expect(milestones.test1).toBeInstanceOf(Uint8Array);
    const snapshot = new Doc();
    applyUpdate(snapshot, milestones.test1);
    {
      const map = snapshot.getMap('map');
      expect(map.get('1')).toBe(1);
    }
    map.set('1', 2);
    {
      const map = snapshot.getMap('map');
      expect(map.get('1')).toBe(1);
    }
    revertUpdate(doc, milestones.test1, key =>
      key === 'map' ? 'Map' : 'Array'
    );
    {
      const map = doc.getMap('map');
      expect(map.get('1')).toBe(1);
    }

    const fn = vi.fn(() => true);
    doc.gcFilter = fn;
    expect(fn).toBeCalledTimes(0);

    for (let i = 0; i < 1e5; i++) {
      map.set(`${i}`, i + 1);
    }
    for (let i = 0; i < 1e5; i++) {
      map.delete(`${i}`);
    }
    for (let i = 0; i < 1e5; i++) {
      map.set(`${i}`, i - 1);
    }

    expect(fn).toBeCalled();

    const doc2 = new Doc();
    applyUpdate(doc2, encodeStateAsUpdate(doc));

    revertUpdate(doc2, milestones.test1, key =>
      key === 'map' ? 'Map' : 'Array'
    );
    {
      const map = doc2.getMap('map');
      expect(map.get('1')).toBe(1);
    }
  });
});

describe('utils', () => {
  test('download binary', async () => {
    const page = workspace.createPage('page0');
    initPage(page);
    const provider = createIndexedDBProvider(
      workspace.id,
      workspace.doc,
      rootDBName
    );
    provider.connect();
    await provider.whenSynced;
    provider.disconnect();
    const update = (await downloadBinary(
      workspace.id,
      rootDBName
    )) as Uint8Array;
    expect(update).toBeInstanceOf(Uint8Array);
    const newWorkspace = new Workspace({
      id,
      isSSR: true,
    });
    newWorkspace.register(AffineSchemas).register(__unstableSchemas);
    applyUpdate(newWorkspace.doc, update);
    await new Promise<void>(resolve =>
      setTimeout(() => {
        expect(workspace.doc.toJSON()).toEqual(newWorkspace.doc.toJSON());
        resolve();
      }, 0)
    );
  });
});
