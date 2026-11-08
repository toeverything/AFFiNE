import 'fake-indexeddb/auto';

import { expect, test, vi } from 'vitest';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { expectYjsEqual } from '../../__tests__/utils';
import { SpaceStorage } from '../../storage';
import { Sync } from '../../sync';
import { universalId } from '../../utils/universal-id';
import { IndexedDBDocStorage, IndexedDBDocSyncStorage } from '../idb';
import { bindDiskSyncApis, type DiskSyncApis, type DiskSyncEvent } from './api';
import { DiskDocStorage } from './doc';

test('sync local <-> disk remote updates through DocSyncPeer', async () => {
  const workspaceId = 'ws-disk-integration';
  const sessionId = JSON.stringify([
    universalId({ peer: 'local', type: 'workspace', id: workspaceId }),
    '/tmp/disk-sync',
  ]);

  const listeners = new Map<string, Set<(event: DiskSyncEvent) => void>>();
  const remoteDocs = new Map<string, { timestamp: Date; bin: Uint8Array }>();
  let allowUnexportableDoc = false;

  const acknowledged = vi.fn(
    async (_sessionId: string, _docId: string, _snapshot: Uint8Array) => {}
  );
  const prepared = vi.fn(async () => null as Uint8Array | null);
  const apis: DiskSyncApis = {
    acknowledgeSourceUpdate: acknowledged,
    prepareSourceDoc: prepared,
    startSession: async currentSessionId => {
      if (!listeners.has(currentSessionId)) {
        listeners.set(currentSessionId, new Set());
      }
    },
    stopSession: async currentSessionId => {
      listeners.delete(currentSessionId);
    },
    applyLocalUpdate: vi.fn(async (currentSessionId, update) => {
      if (update.docId === 'doc-unexportable' && !allowUnexportableDoc) {
        return {
          docId: update.docId,
          timestamp: new Date(),
          exportError:
            'failed to export doc doc-unexportable: parser_error: explicit_note_scope_required',
        };
      }
      const timestamp = new Date();
      remoteDocs.set(update.docId, { timestamp, bin: update.bin });
      for (const callback of listeners.get(currentSessionId) ?? []) {
        callback({
          type: 'doc-update',
          update: {
            docId: update.docId,
            bin: update.bin,
            timestamp,
          },
          origin: 'sync:disk-mock',
        });
      }
      return {
        docId: update.docId,
        timestamp,
      };
    }),
    subscribeEvents: (currentSessionId, callback) => {
      let set = listeners.get(currentSessionId);
      if (!set) {
        set = new Set();
        listeners.set(currentSessionId, set);
      }
      set.add(callback);
      return () => {
        set?.delete(callback);
      };
    },
  };

  bindDiskSyncApis(apis);

  const localDoc = new IndexedDBDocStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
  });
  const localDocSync = new IndexedDBDocSyncStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
  });
  const remoteDoc = new DiskDocStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
    syncFolder: '/tmp/disk-sync',
  });

  const local = new SpaceStorage({
    doc: localDoc,
    docSync: localDocSync,
  });
  const remote = new SpaceStorage({
    doc: remoteDoc,
  });

  local.connect();
  remote.connect();
  await local.waitForConnected();
  await remote.waitForConnected();

  const sync = new Sync({
    local,
    remotes: {
      disk: remote,
    },
  });
  sync.start();

  const unexportable = new YDoc();
  unexportable.getMap('test').set('origin', 'unsupported');
  await localDoc.pushDocUpdate({
    docId: 'doc-unexportable',
    bin: encodeStateAsUpdate(unexportable),
  });
  await vi.waitFor(() => {
    expect(apis.applyLocalUpdate).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ docId: 'doc-unexportable' })
    );
  });

  const localSource = new YDoc();
  localSource.getMap('test').set('origin', 'local');
  await localDoc.pushDocUpdate({
    docId: 'doc-local',
    bin: encodeStateAsUpdate(localSource),
  });
  await vi.waitFor(() => {
    expect(remoteDocs.has('doc-local')).toBe(true);
  });
  allowUnexportableDoc = true;
  unexportable.getMap('test').set('fixed', 'yes');
  await localDoc.pushDocUpdate({
    docId: 'doc-unexportable',
    bin: encodeStateAsUpdate(unexportable),
  });
  await vi.waitFor(() => {
    expect(remoteDocs.has('doc-unexportable')).toBe(true);
  });

  await vi.waitFor(() => {
    expect(remoteDocs.has('doc-local')).toBe(true);
  });
  expect(prepared).toHaveBeenCalledWith(
    sessionId,
    'doc-local',
    expect.any(Uint8Array),
    undefined
  );

  prepared.mockClear();
  for (const callback of listeners.get(sessionId) ?? []) {
    callback({ type: 'source-discovered', docId: 'doc-local' });
  }
  await vi.waitFor(() => {
    expect(prepared).toHaveBeenCalledWith(
      sessionId,
      'doc-local',
      expect.any(Uint8Array),
      undefined
    );
  });

  const remoteSource = new YDoc();
  remoteSource.getMap('test').set('origin', 'remote');
  remoteSource.getMap('test').set('synced', 'yes');
  const remoteUpdate = encodeStateAsUpdate(remoteSource);
  const remoteTimestamp = new Date('2026-01-05T00:00:00.000Z');
  for (const callback of listeners.get(sessionId) ?? []) {
    callback({
      type: 'doc-update',
      update: {
        docId: 'doc-remote',
        bin: remoteUpdate,
        timestamp: remoteTimestamp,
      },
    });
  }

  await vi.waitFor(async () => {
    const doc = await localDoc.getDoc('doc-remote');
    expect(doc).not.toBeNull();
    expectYjsEqual(doc!.bin, {
      test: {
        origin: 'remote',
        synced: 'yes',
      },
    });
  });

  await vi.waitFor(() => {
    expect(acknowledged).toHaveBeenCalledWith(
      sessionId,
      'doc-remote',
      expect.any(Uint8Array)
    );
  });
  const remoteAck = acknowledged.mock.calls.find(
    ([, docId]) => docId === 'doc-remote'
  );
  expectYjsEqual(remoteAck![2], {
    test: {
      origin: 'remote',
      synced: 'yes',
    },
  });

  await sync.stop();
  // Intentionally keep IndexedDB connections open in tests. Disconnecting can
  // abort in-flight IDB transactions in fake-indexeddb and surface as unhandled
  // rejections, which makes Vitest fail the run.
  remote.disconnect();
});

test('forces initial push when disk has stale pushed clocks but remote is empty', async () => {
  const workspaceId = 'ws-disk-stale-push';

  const listeners = new Map<string, Set<(event: DiskSyncEvent) => void>>();
  const remoteDocs = new Map<string, { timestamp: Date; bin: Uint8Array }>();

  const apis: DiskSyncApis = {
    acknowledgeSourceUpdate: async () => {},
    prepareSourceDoc: async () => null,
    startSession: async currentSessionId => {
      if (!listeners.has(currentSessionId)) {
        listeners.set(currentSessionId, new Set());
      }
    },
    stopSession: async currentSessionId => {
      listeners.delete(currentSessionId);
    },
    applyLocalUpdate: async (currentSessionId, update) => {
      const timestamp = new Date();
      remoteDocs.set(update.docId, { timestamp, bin: update.bin });
      for (const callback of listeners.get(currentSessionId) ?? []) {
        callback({
          type: 'doc-update',
          update: {
            docId: update.docId,
            bin: update.bin,
            timestamp,
          },
          origin: 'sync:disk-mock',
        });
      }
      return {
        docId: update.docId,
        timestamp,
      };
    },
    subscribeEvents: (currentSessionId, callback) => {
      let set = listeners.get(currentSessionId);
      if (!set) {
        set = new Set();
        listeners.set(currentSessionId, set);
      }
      set.add(callback);
      return () => {
        set?.delete(callback);
      };
    },
  };

  bindDiskSyncApis(apis);

  const localDoc = new IndexedDBDocStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
  });
  const localDocSync = new IndexedDBDocSyncStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
  });
  const remoteDoc = new DiskDocStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
    syncFolder: '/tmp/disk-sync-stale',
  });

  const local = new SpaceStorage({
    doc: localDoc,
    docSync: localDocSync,
  });
  const remote = new SpaceStorage({
    doc: remoteDoc,
  });

  local.connect();
  remote.connect();
  await local.waitForConnected();
  await remote.waitForConnected();

  const source = new YDoc();
  source.getMap('test').set('value', 'local');
  await localDoc.pushDocUpdate({
    docId: 'doc-local-stale',
    bin: encodeStateAsUpdate(source),
  });

  await localDocSync.setPeerPushedClock('disk', {
    docId: 'doc-local-stale',
    timestamp: new Date('2099-01-01T00:00:00.000Z'),
  });

  const sync = new Sync({
    local,
    remotes: {
      disk: remote,
    },
  });
  sync.start();

  await vi.waitFor(() => {
    expect(remoteDocs.has('doc-local-stale')).toBe(true);
  });

  await sync.stop();
  remote.disconnect();
});

test('root-meta discovery must not block pushing page docs when switching disk folders', async () => {
  const workspaceId = 'ws-disk-discovery-nonblocking';

  const pageDocId = 'page-doc-1';

  const listeners = new Map<string, Set<(event: DiskSyncEvent) => void>>();
  const remoteDocs = new Map<string, { timestamp: Date; bin: Uint8Array }>();

  const apis: DiskSyncApis = {
    acknowledgeSourceUpdate: async () => {},
    prepareSourceDoc: async () => null,
    startSession: async currentSessionId => {
      if (!listeners.has(currentSessionId)) {
        listeners.set(currentSessionId, new Set());
      }
    },
    stopSession: async currentSessionId => {
      listeners.delete(currentSessionId);
    },
    applyLocalUpdate: async (currentSessionId, update) => {
      const timestamp = new Date();
      remoteDocs.set(update.docId, { timestamp, bin: update.bin });
      for (const callback of listeners.get(currentSessionId) ?? []) {
        callback({
          type: 'doc-update',
          update: {
            docId: update.docId,
            bin: update.bin,
            timestamp,
          },
          origin: 'sync:disk-mock',
        });
        if (update.docId === workspaceId) {
          callback({ type: 'root-doc-discovered', docId: pageDocId });
        }
      }
      return {
        docId: update.docId,
        timestamp,
      };
    },
    subscribeEvents: (currentSessionId, callback) => {
      let set = listeners.get(currentSessionId);
      if (!set) {
        set = new Set();
        listeners.set(currentSessionId, set);
      }
      set.add(callback);
      return () => {
        set?.delete(callback);
      };
    },
  };

  bindDiskSyncApis(apis);

  const localDoc = new IndexedDBDocStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
  });
  const localDocSync = new IndexedDBDocSyncStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
  });
  const remoteDoc = new DiskDocStorage({
    id: workspaceId,
    flavour: 'local',
    type: 'workspace',
    syncFolder: '/tmp/disk-sync-discovery',
  });

  const local = new SpaceStorage({
    doc: localDoc,
    docSync: localDocSync,
  });
  const remote = new SpaceStorage({
    doc: remoteDoc,
  });

  local.connect();
  remote.connect();
  await local.waitForConnected();
  await remote.waitForConnected();

  // Seed local root meta so disk can discover the page doc id from it.
  const root = new YDoc();
  const meta = root.getMap('meta');
  meta.set('pages', [{ id: pageDocId }]);
  await localDoc.pushDocUpdate({
    docId: workspaceId,
    bin: encodeStateAsUpdate(root),
  });

  // Seed the page doc itself.
  const page = new YDoc();
  page.getMap('test').set('value', 'local');
  const { timestamp: pageClock } = await localDoc.pushDocUpdate({
    docId: pageDocId,
    bin: encodeStateAsUpdate(page),
  });

  // Simulate "already pushed" clocks from a previous disk folder.
  await localDocSync.setPeerPushedClock('disk', {
    docId: pageDocId,
    timestamp: pageClock,
  });

  const sync = new Sync({
    local,
    remotes: {
      disk: remote,
    },
  });
  // Match workspace engine behavior: sync root doc first.
  sync.doc.addPriority(workspaceId, 100);
  sync.start();

  await vi.waitFor(() => {
    expect(remoteDocs.has(pageDocId)).toBe(true);
  });

  await sync.stop();
  remote.disconnect();
});
