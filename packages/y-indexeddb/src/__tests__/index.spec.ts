/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { uuidv4, Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { IndexeddbPersistence } from 'y-indexeddb';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import type { WorkspacePersist } from '../index';
import {
  CleanupWhenConnectingError,
  createIndexedDBProvider,
  dbVersion,
  DEFAULT_DB_NAME,
  downloadBinary,
  getMilestones,
  markMilestone,
  overwriteBinary,
  revertUpdate,
  setMergeCount,
} from '../index';

function initEmptyPage(page: Page) {
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  const surfaceBlockId = page.addBlock('affine:surface', {}, pageBlockId);
  const frameBlockId = page.addBlock('affine:note', {}, pageBlockId);
  const paragraphBlockId = page.addBlock('affine:paragraph', {}, frameBlockId);
  return {
    pageBlockId,
    surfaceBlockId,
    frameBlockId,
    paragraphBlockId,
  };
}

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
    const provider = createIndexedDBProvider(workspace.doc);
    provider.connect();
    await provider.whenSynced;
    const db = await openDB(rootDBName, dbVersion);
    {
      const store = db
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
      const page = workspace.createPage({ id: 'page0' });
      await page.waitForLoaded();
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:note', {}, pageBlockId);
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
      // data should only contain updates for the root doc
      data.updates.forEach(({ update }) => {
        Workspace.Y.applyUpdate(testWorkspace.doc, update);
      });
      const subPage = testWorkspace.doc.spaces.get('space:page0');
      {
        assertExists(subPage);
        await store.get(subPage.guid);
        const data = (await store.get(subPage.guid)) as
          | WorkspacePersist
          | undefined;
        assertExists(data);
        await testWorkspace.getPage('page0')?.waitForLoaded();
        data.updates.forEach(({ update }) => {
          Workspace.Y.applyUpdate(subPage, update);
        });
      }
      expect(workspace.doc.toJSON()).toEqual(testWorkspace.doc.toJSON());
    }
  });

  test('disconnect suddenly', async () => {
    const provider = createIndexedDBProvider(workspace.doc, rootDBName);
    const fn = vi.fn();
    provider.connect();
    provider.disconnect();
    expect(fn).toBeCalledTimes(0);
    await provider.whenSynced.catch(fn);
    expect(fn).toBeCalledTimes(1);
  });

  test('connect and disconnect', async () => {
    const provider = createIndexedDBProvider(workspace.doc, rootDBName);
    provider.connect();
    expect(provider.connected).toBe(true);
    const p1 = provider.whenSynced;
    await p1;
    const snapshot = encodeStateAsUpdate(workspace.doc);
    provider.disconnect();
    expect(provider.connected).toBe(false);
    {
      const page = workspace.createPage({ id: 'page0' });
      await page.waitForLoaded();
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:note', {}, pageBlockId);
      page.addBlock('affine:paragraph', {}, frameId);
    }
    {
      const updates = await getUpdates(workspace.id);
      expect(updates.length).toBe(1);
      expect(updates[0]).toEqual(snapshot);
    }
    expect(provider.connected).toBe(false);
    provider.connect();
    expect(provider.connected).toBe(true);
    const p2 = provider.whenSynced;
    await p2;
    {
      const updates = await getUpdates(workspace.id);
      expect(updates).not.toEqual([]);
    }
    expect(provider.connected).toBe(true);
    provider.disconnect();
    expect(provider.connected).toBe(false);
    expect(p1).not.toBe(p2);
  });

  test('cleanup', async () => {
    const provider = createIndexedDBProvider(workspace.doc);
    provider.connect();
    await provider.whenSynced;
    const db = await openDB(rootDBName, dbVersion);

    {
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const keys = await store.getAllKeys();
      expect(keys).contain(workspace.id);
    }

    provider.disconnect();
    await provider.cleanup();

    {
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const keys = await store.getAllKeys();
      expect(keys).not.contain(workspace.id);
    }
  });

  test('cleanup when connecting', async () => {
    const provider = createIndexedDBProvider(workspace.doc);
    provider.connect();
    await expect(() => provider.cleanup()).rejects.toThrowError(
      CleanupWhenConnectingError
    );
    await provider.whenSynced;
    provider.disconnect();
    await provider.cleanup();
  });

  test('merge', async () => {
    setMergeCount(5);
    const provider = createIndexedDBProvider(workspace.doc, rootDBName);
    provider.connect();
    {
      const page = workspace.createPage({ id: 'page0' });
      await page.waitForLoaded();
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:note', {}, pageBlockId);
      for (let i = 0; i < 99; i++) {
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
    const doc = new Workspace.Y.Doc();
    const map = doc.getMap('map');
    for (let i = 0; i < 100; i++) {
      map.set(`${i}`, i);
    }
    {
      const provider = createIndexedDBProvider(doc, rootDBName);
      provider.connect();
      await provider.whenSynced;
      provider.disconnect();
    }
    {
      const newDoc = new Workspace.Y.Doc();
      const provider = createIndexedDBProvider(newDoc, rootDBName);
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
      await persistence.destroy();
    }
    {
      const yDoc = new Doc({
        guid: 'test',
      });
      const provider = createIndexedDBProvider(yDoc);
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
      await expect(indexedDB.databases).rejects.toThrow('not supported');
      const yDoc = new Doc({
        guid: 'test',
      });
      expect(indexedDB.databases).toBeCalledTimes(1);
      const provider = createIndexedDBProvider(yDoc);
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
    const doc = new Doc({
      guid: '1',
    });
    const provider = createIndexedDBProvider(doc);
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

describe('subDoc', () => {
  test('basic', async () => {
    let json1: any, json2: any;
    {
      const doc = new Doc({
        guid: 'test',
      });
      const map = doc.getMap();
      const subDoc = new Doc();
      subDoc.load();
      map.set('1', subDoc);
      map.set('2', 'test');
      const provider = createIndexedDBProvider(doc);
      provider.connect();
      await provider.whenSynced;
      provider.disconnect();
      json1 = doc.toJSON();
    }
    {
      const doc = new Doc({
        guid: 'test',
      });
      const provider = createIndexedDBProvider(doc);
      provider.connect();
      await provider.whenSynced;
      const map = doc.getMap();
      const subDoc = map.get('1') as Doc;
      subDoc.load();
      provider.disconnect();
      json2 = doc.toJSON();
    }
    // the following line compares {} with {}
    expect(json1['']['1'].toJSON()).toEqual(json2['']['1'].toJSON());
    expect(json1['']['2']).toEqual(json2['']['2']);
  });

  test('blocksuite', async () => {
    const page0 = workspace.createPage({
      id: 'page0',
    });
    await page0.waitForLoaded();
    const { paragraphBlockId: paragraphBlockIdPage1 } = initEmptyPage(page0);
    const provider = createIndexedDBProvider(workspace.doc, rootDBName);
    provider.connect();
    const page1 = workspace.createPage({
      id: 'page1',
    });
    await page1.waitForLoaded();
    const { paragraphBlockId: paragraphBlockIdPage2 } = initEmptyPage(page1);
    await new Promise(resolve => setTimeout(resolve, 1000));
    provider.disconnect();
    {
      const newWorkspace = new Workspace({
        id,
        isSSR: true,
      });
      newWorkspace.register(AffineSchemas).register(__unstableSchemas);
      const provider = createIndexedDBProvider(newWorkspace.doc, rootDBName);
      provider.connect();
      await provider.whenSynced;
      const page0 = newWorkspace.getPage('page0') as Page;
      await page0.waitForLoaded();
      {
        const block = page0.getBlockById(paragraphBlockIdPage1);
        assertExists(block);
      }
      const page1 = newWorkspace.getPage('page1') as Page;
      await page1.waitForLoaded();
      {
        const block = page1.getBlockById(paragraphBlockIdPage2);
        assertExists(block);
      }
    }
  });
});

describe('utils', () => {
  test('download binary', async () => {
    const page = workspace.createPage({ id: 'page0' });
    await page.waitForLoaded();
    initEmptyPage(page);
    const provider = createIndexedDBProvider(workspace.doc, rootDBName);
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
        expect(workspace.doc.toJSON()['meta']).toEqual(
          newWorkspace.doc.toJSON()['meta']
        );
        expect(Object.keys(workspace.doc.toJSON()['spaces'])).toEqual(
          Object.keys(newWorkspace.doc.toJSON()['spaces'])
        );
        resolve();
      }, 0)
    );
  });

  test('overwrite binary', async () => {
    await overwriteBinary('test', new Uint8Array([1, 2, 3]));
    {
      const binary = await downloadBinary('test');
      expect(binary).toEqual(new Uint8Array([1, 2, 3]));
    }
    await overwriteBinary('test', new Uint8Array([0, 0]));
    {
      const binary = await downloadBinary('test');
      expect(binary).toEqual(new Uint8Array([0, 0]));
    }
  });
});
