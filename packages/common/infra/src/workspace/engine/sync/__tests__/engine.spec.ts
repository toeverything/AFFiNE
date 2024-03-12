import { WorkspaceFlavour } from '@affine/env/workspace';
import { Workspace } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Doc } from 'yjs';

import { MemoryMemento } from '../../../../storage';
import { globalBlockSuiteSchema } from '../../../global-schema';
import { TestingSyncStorage } from '../../../testing';
import { SyncEngineStep, SyncPeerStep } from '../consts';
import { SyncEngine } from '../engine';
import { createTestStorage } from './test-storage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

const testMeta = {
  id: 'test',
  flavour: WorkspaceFlavour.LOCAL,
};

describe('SyncEngine', () => {
  test('basic - indexeddb', async () => {
    const storage = new MemoryMemento();
    const storage1 = new MemoryMemento();
    const storage2 = new MemoryMemento();
    let prev: any;
    {
      const workspace = new Workspace({
        id: 'test',

        schema: globalBlockSuiteSchema,
      });

      const syncEngine = new SyncEngine(
        workspace.doc,
        new TestingSyncStorage(testMeta, storage),
        [
          new TestingSyncStorage(testMeta, storage1),
          new TestingSyncStorage(testMeta, storage2),
        ]
      );
      syncEngine.start();

      const page = workspace.createDoc({
        id: 'page0',
      });
      page.load();
      const pageBlockId = page.addBlock(
        'affine:page' as keyof BlockSuite.BlockModels,
        {
          title: new page.Text(''),
        }
      );
      page.addBlock(
        'affine:surface' as keyof BlockSuite.BlockModels,
        {},
        pageBlockId
      );
      const frameId = page.addBlock(
        'affine:note' as keyof BlockSuite.BlockModels,
        {},
        pageBlockId
      );
      page.addBlock(
        'affine:paragraph' as keyof BlockSuite.BlockModels,
        {},
        frameId
      );
      await syncEngine.waitForSynced();
      syncEngine.forceStop();
      prev = workspace.doc.toJSON();
    }

    for (const current of [storage, storage1, storage2]) {
      const workspace = new Workspace({
        id: 'test',

        schema: globalBlockSuiteSchema,
      });
      const syncEngine = new SyncEngine(
        workspace.doc,
        new TestingSyncStorage(testMeta, current),
        []
      );
      syncEngine.start();
      await syncEngine.waitForSynced();
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
      });
      syncEngine.forceStop();
    }
  });

  test('status', async () => {
    const ydoc = new Doc({ guid: 'test' });

    const storage1 = new MemoryMemento();
    const storage2 = new MemoryMemento();

    const localStorage = createTestStorage(
      new TestingSyncStorage(testMeta, storage1)
    );
    const remoteStorage = createTestStorage(
      new TestingSyncStorage(testMeta, storage2)
    );

    localStorage.pausePull();
    localStorage.pausePush();
    remoteStorage.pausePull();
    remoteStorage.pausePush();

    const syncEngine = new SyncEngine(ydoc, localStorage, [remoteStorage]);
    expect(syncEngine.status.step).toEqual(SyncEngineStep.Stopped);

    syncEngine.start();

    await vi.waitFor(() => {
      expect(syncEngine.status.step).toEqual(SyncEngineStep.Syncing);
      expect(syncEngine.status.local?.step).toEqual(
        SyncPeerStep.LoadingRootDoc
      );
    });

    localStorage.resumePull();

    await vi.waitFor(() => {
      expect(syncEngine.status.step).toEqual(SyncEngineStep.Syncing);
      expect(syncEngine.status.local?.step).toEqual(SyncPeerStep.Synced);
      expect(syncEngine.status.remotes[0]?.step).toEqual(
        SyncPeerStep.LoadingRootDoc
      );
    });

    remoteStorage.resumePull();

    await vi.waitFor(() => {
      expect(syncEngine.status.step).toEqual(SyncEngineStep.Synced);
      expect(syncEngine.status.remotes[0]?.step).toEqual(SyncPeerStep.Synced);
      expect(syncEngine.status.local?.step).toEqual(SyncPeerStep.Synced);
    });

    ydoc.getArray('test').insert(0, [1, 2, 3]);

    await vi.waitFor(() => {
      expect(syncEngine.status.step).toEqual(SyncEngineStep.Syncing);
      expect(syncEngine.status.local?.step).toEqual(SyncPeerStep.Syncing);
      expect(syncEngine.status.remotes[0]?.step).toEqual(SyncPeerStep.Syncing);
    });

    localStorage.resumePush();

    await vi.waitFor(() => {
      expect(syncEngine.status.step).toEqual(SyncEngineStep.Syncing);
      expect(syncEngine.status.local?.step).toEqual(SyncPeerStep.Synced);
      expect(syncEngine.status.remotes[0]?.step).toEqual(SyncPeerStep.Syncing);
    });

    remoteStorage.resumePush();

    await vi.waitFor(() => {
      expect(syncEngine.status.step).toEqual(SyncEngineStep.Synced);
      expect(syncEngine.status.local?.step).toEqual(SyncPeerStep.Synced);
      expect(syncEngine.status.remotes[0]?.step).toEqual(SyncPeerStep.Synced);
    });
  });
});
