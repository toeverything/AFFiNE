import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { SyncPeer, SyncPeerStep } from '@toeverything/infra';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { IndexedDBSyncStorage } from '..';

const schema = new Schema();

schema.register(AffineSchemas).register(__unstableSchemas);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

describe('SyncPeer', () => {
  test('basic - indexeddb', async () => {
    let prev: any;
    {
      const workspace = new Workspace({
        id: 'test - syncpeer - indexeddb',

        schema,
      });

      const syncPeer = new SyncPeer(
        workspace.doc,
        new IndexedDBSyncStorage(workspace.doc.guid)
      );
      await syncPeer.waitForLoaded();

      const page = workspace.createPage({
        id: 'page0',
      });
      await page.load();
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
        id: 'test - syncpeer - indexeddb',

        schema,
      });
      const syncPeer = new SyncPeer(
        workspace.doc,
        new IndexedDBSyncStorage(workspace.doc.guid)
      );
      await syncPeer.waitForSynced();
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
      });
      syncPeer.stop();
    }
  });

  test('status', async () => {
    const workspace = new Workspace({
      id: 'test - syncpeer - status',

      schema,
    });

    const syncPeer = new SyncPeer(
      workspace.doc,
      new IndexedDBSyncStorage(workspace.doc.guid)
    );
    expect(syncPeer.status.step).toBe(SyncPeerStep.LoadingRootDoc);
    await syncPeer.waitForSynced();
    expect(syncPeer.status.step).toBe(SyncPeerStep.Synced);

    const page = workspace.createPage({
      id: 'page0',
    });
    expect(syncPeer.status.step).toBe(SyncPeerStep.LoadingSubDoc);
    await page.load();
    await syncPeer.waitForSynced();
    page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    expect(syncPeer.status.step).toBe(SyncPeerStep.Syncing);
    syncPeer.stop();
  });
});
