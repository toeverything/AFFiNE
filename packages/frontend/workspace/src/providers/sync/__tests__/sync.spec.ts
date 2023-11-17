import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createIndexedDBStorage } from '../../storage';
import { SyncPeer } from '../';

const schema = new Schema();

schema.register(AffineSchemas).register(__unstableSchemas);

describe('sync', () => {
  test('basic - indexeddb', async () => {
    let prev: any;
    {
      const workspace = new Workspace({
        id: 'test',
        isSSR: true,
        schema,
      });

      const syncPeer = new SyncPeer(
        workspace.doc,
        createIndexedDBStorage(workspace.doc.guid)
      );
      await syncPeer.waitForLoaded();

      const page = workspace.createPage({
        id: 'page0',
      });
      await page.waitForLoaded();
      const pageBlockId = page.addBlock('affine:page', {
        title: new page.Text(''),
      });
      page.addBlock('affine:surface', {}, pageBlockId);
      const frameId = page.addBlock('affine:note', {}, pageBlockId);
      page.addBlock('affine:paragraph', {}, frameId);
      await syncPeer.waitForSynced();
      syncPeer.stop();
      prev = workspace.doc.toJSON();
    }

    {
      const workspace = new Workspace({
        id: 'test',
        isSSR: true,
        schema,
      });
      const syncPeer = new SyncPeer(
        workspace.doc,
        createIndexedDBStorage(workspace.doc.guid)
      );
      await syncPeer.waitForSynced();
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
      });
      syncPeer.stop();
    }
  });
});
