import { WorkspaceFlavour } from '@affine/env/workspace';
import { Workspace } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { MemoryMemento } from '../../../../storage';
import { globalBlockSuiteSchema } from '../../../global-schema';
import { TestingSyncStorage } from '../../../testing';
import { SyncPeerStep } from '../consts';
import { SyncPeer } from '../peer';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

const testMeta = {
  id: 'test',
  flavour: WorkspaceFlavour.LOCAL,
};

describe('SyncPeer', () => {
  test('basic - indexeddb', async () => {
    const storage = new MemoryMemento();

    let prev: any;
    {
      const workspace = new Workspace({
        id: 'test',

        schema: globalBlockSuiteSchema,
      });

      const syncPeer = new SyncPeer(
        workspace.doc,
        new TestingSyncStorage(testMeta, storage)
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
        id: 'test',

        schema: globalBlockSuiteSchema,
      });
      const syncPeer = new SyncPeer(
        workspace.doc,
        new TestingSyncStorage(testMeta, storage)
      );
      await syncPeer.waitForSynced();
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
      });
      syncPeer.stop();
    }
  });

  test('status', async () => {
    const storage = new MemoryMemento();

    const workspace = new Workspace({
      id: 'test',

      schema: globalBlockSuiteSchema,
    });

    const syncPeer = new SyncPeer(
      workspace.doc,
      new TestingSyncStorage(testMeta, storage)
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
