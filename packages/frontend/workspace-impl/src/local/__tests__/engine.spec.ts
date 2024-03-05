import 'fake-indexeddb/auto';

import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { Schema, Workspace } from '@blocksuite/store';
import { SyncEngine, SyncEngineStep, SyncPeerStep } from '@toeverything/infra';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Doc } from 'yjs';

import { IndexedDBSyncStorage } from '..';
import { createTestStorage } from './test-storage';

const schema = new Schema();

schema.register(AffineSchemas);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

describe('SyncEngine', () => {
  test('basic - indexeddb', async () => {
    let prev: any;
    {
      const workspace = new Workspace({
        id: 'test - syncengine - indexeddb',

        schema,
      });

      const syncEngine = new SyncEngine(
        workspace.doc,
        new IndexedDBSyncStorage(workspace.doc.guid),
        [
          new IndexedDBSyncStorage(workspace.doc.guid + '1'),
          new IndexedDBSyncStorage(workspace.doc.guid + '2'),
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

    {
      const workspace = new Workspace({
        id: 'test - syncengine - indexeddb',

        schema,
      });
      const syncEngine = new SyncEngine(
        workspace.doc,
        new IndexedDBSyncStorage(workspace.doc.guid),
        []
      );
      syncEngine.start();
      await syncEngine.waitForSynced();
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
      });
      syncEngine.forceStop();
    }

    {
      const workspace = new Workspace({
        id: 'test - syncengine - indexeddb',

        schema,
      });
      const syncEngine = new SyncEngine(
        workspace.doc,
        new IndexedDBSyncStorage(workspace.doc.guid + '1'),
        []
      );
      syncEngine.start();
      await syncEngine.waitForSynced();
      expect(workspace.doc.toJSON()).toEqual({
        ...prev,
      });
      syncEngine.forceStop();
    }

    {
      const workspace = new Workspace({
        id: 'test - syncengine - indexeddb',

        schema,
      });
      const syncEngine = new SyncEngine(
        workspace.doc,
        new IndexedDBSyncStorage(workspace.doc.guid + '2'),
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
    const ydoc = new Doc({ guid: 'test - syncengine - status' });

    const localStorage = createTestStorage(new IndexedDBSyncStorage(ydoc.guid));
    const remoteStorage = createTestStorage(
      new IndexedDBSyncStorage(ydoc.guid + '1')
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
