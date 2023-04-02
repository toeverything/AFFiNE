/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists, uuidv4, Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import type { WorkspacePersist } from '../index';
import {
  createIndexedDBProvider,
  dbVersion,
  getMilestones,
  markMilestone,
  revertUpdate,
  setMergeCount,
} from '../index';

async function getUpdates(id: string): Promise<ArrayBuffer[]> {
  const db = await openDB('affine-local', dbVersion);
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

beforeEach(() => {
  id = uuidv4();
  workspace = new Workspace({
    id,
    isSSR: true,
  });
  workspace.register(AffineSchemas).register(__unstableSchemas);
});

describe('indexeddb provider', () => {
  test('connect', async () => {
    const provider = createIndexedDBProvider(workspace.id, workspace.doc);
    provider.connect();
    await provider.whenSynced;
    const db = await openDB('affine-local', dbVersion);
    {
      const store = await db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = await store.get(id);
      expect(data).toEqual({
        id,
        updates: [],
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
      secondWorkspace.doc
    );
    provider2.connect();
    await provider2.whenSynced;
    expect(Workspace.Y.encodeStateAsUpdate(secondWorkspace.doc)).toEqual(
      Workspace.Y.encodeStateAsUpdate(workspace.doc)
    );
  });

  test('disconnect suddenly', async () => {
    const provider = createIndexedDBProvider(workspace.id, workspace.doc);
    const fn = vi.fn();
    provider.connect();
    provider.disconnect();
    expect(fn).toBeCalledTimes(0);
    await provider.whenSynced.catch(fn);
    expect(fn).toBeCalledTimes(1);
  });

  test('connect and disconnect', async () => {
    const provider = createIndexedDBProvider(workspace.id, workspace.doc);
    provider.connect();
    const p1 = provider.whenSynced;
    await provider.whenSynced;
    provider.disconnect();
    {
      const page = workspace.createPage('page0');
      const pageBlockId = page.addBlock('affine:page', { title: '' });
      const frameId = page.addBlock('affine:frame', {}, pageBlockId);
      page.addBlock('affine:paragraph', {}, frameId);
    }
    {
      const updates = await getUpdates(workspace.id);
      expect(updates).toEqual([]);
    }
    provider.connect();
    const p2 = provider.whenSynced;
    await provider.whenSynced;
    {
      const updates = await getUpdates(workspace.id);
      expect(updates).not.toEqual([]);
    }
    provider.disconnect();
    expect(p1).not.toBe(p2);
  });

  test('merge', async () => {
    setMergeCount(5);
    const provider = createIndexedDBProvider(workspace.id, workspace.doc);
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
