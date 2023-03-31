/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { uuidv4, Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createIndexedDBProvider, dbVersion } from '../index';

async function getUpdates(id: string): Promise<ArrayBuffer[]> {
  const db = await openDB(id, dbVersion);
  const store = await db
    .transaction('workspace', 'readonly')
    .objectStore('workspace');
  const data = await store.get(id);
  expect(data.id).toBe(id);
  return data.updates.map(({ update }) => update);
}

let id: string;
let workspace: Workspace;

beforeEach(() => {
  id = uuidv4();
  workspace = new Workspace({
    id,
  });
  workspace.register(AffineSchemas).register(__unstableSchemas);
});

describe('indexeddb provider', () => {
  test('connect', async () => {
    const provider = createIndexedDBProvider(workspace);
    provider.connect();
    await provider.whenSynced;
    const db = await openDB(workspace.id, dbVersion);
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
      const data = await store.get(id);
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
    const provider2 = createIndexedDBProvider(secondWorkspace);
    provider2.connect();
    await provider2.whenSynced;
    expect(Workspace.Y.encodeStateAsUpdate(secondWorkspace.doc)).toEqual(
      Workspace.Y.encodeStateAsUpdate(workspace.doc)
    );
  });

  test('disconnect suddenly', async () => {
    const provider = createIndexedDBProvider(workspace);
    const fn = vi.fn();
    provider.connect();
    provider.disconnect();
    expect(fn).toBeCalledTimes(0);
    await provider.whenSynced.catch(fn);
    expect(fn).toBeCalledTimes(1);
  });

  test('connect and disconnect', async () => {
    const provider = createIndexedDBProvider(workspace);
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
});
