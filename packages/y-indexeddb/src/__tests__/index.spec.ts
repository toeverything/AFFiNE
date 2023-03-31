/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { uuidv4, Workspace } from '@blocksuite/store';
import { openDB } from 'idb';
import { beforeEach, describe, expect, test } from 'vitest';

import { createIndexedDBProvider, dbVersion } from '../index';

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
  });
});
