import 'fake-indexeddb/auto';

import { OpClient, OpConsumer } from '@toeverything/infra/op';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  applyUpdate,
  diffUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
  mergeUpdates as yjsMergeUpdates,
} from 'yjs';

import { DummyConnection } from '../../connection';
import type { StorageConstructor } from '../../impls';
import {
  bindNativeDBApis,
  type NativeDBApis,
  SqliteDocStorage,
} from '../../impls/sqlite';
import {
  type DocClock,
  type DocClocks,
  type DocDiff,
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../storage';
import { DummyDocSyncStorage } from '../../storage/dummy/doc-sync';
import { StoreManagerClient } from '../client';
import { StoreManagerConsumer } from '../consumer';
import type { WorkerManagerOps } from '../ops';

class InMemoryRemoteDocStorage extends DocStorageBase {
  static readonly identifier = 'TestRemoteDocStorage';
  override connection = new DummyConnection();
  private readonly docs = new Map<string, DocRecord>();

  override async getDoc(docId: string): Promise<DocRecord | null> {
    return this.docs.get(docId) ?? null;
  }

  override async pushDocUpdate(
    update: DocUpdate,
    origin?: string
  ): Promise<DocClock> {
    const prev = this.docs.get(update.docId);
    const bin = prev ? yjsMergeUpdates([prev.bin, update.bin]) : update.bin;
    const timestamp = new Date(Date.now());
    const record: DocRecord = {
      docId: update.docId,
      bin,
      timestamp,
      editor: update.editor,
    };
    this.docs.set(update.docId, record);
    this.emit('update', record, origin);
    return { docId: update.docId, timestamp };
  }

  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const rec = this.docs.get(docId);
    return rec ? { docId, timestamp: rec.timestamp } : null;
  }

  override async getDocTimestamps(): Promise<DocClocks> {
    const clocks: DocClocks = {};
    for (const [docId, rec] of this.docs.entries()) {
      clocks[docId] = rec.timestamp;
    }
    return clocks;
  }

  override async deleteDoc(docId: string): Promise<void> {
    this.docs.delete(docId);
  }
}

class TestDummyDocSyncStorage extends DummyDocSyncStorage {
  static readonly identifier = 'TestDummyDocSyncStorage';
}

function createFakeNativeDBApis(
  onGetDocDiff: (...args: unknown[]) => void,
  onMergeUpdates: (...args: unknown[]) => void
): NativeDBApis {
  const docs = new Map<string, { bin: Uint8Array; timestamp: Date }>();
  let clockMs = 1_700_000_000_000;
  const unimplemented = async () => {
    throw new Error('not implemented in test');
  };

  return {
    connect: async () => {},
    disconnect: async () => {},
    pushUpdate: async (_id, docId, update) => {
      const prev = docs.get(docId);
      const bin = prev ? yjsMergeUpdates([prev.bin, update]) : update;
      clockMs += 10;
      const timestamp = new Date(clockMs);
      docs.set(docId, { bin, timestamp });
      return timestamp;
    },
    getPeerWorkspaceState: unimplemented,
    invalidatePeerWorkspaceState: unimplemented,
    installPeerWorkspaceState: unimplemented,
    confirmPeerDocCreate: unimplemented,
    getDoc: async (_id, docId) => {
      const rec = docs.get(docId);
      return rec ? { docId, bin: rec.bin, timestamp: rec.timestamp } : null;
    },
    getDocDiff: async (id, docId, state): Promise<DocDiff | null> => {
      onGetDocDiff(id, docId, state);
      const rec = docs.get(docId);
      if (!rec) return null;
      const missing =
        state && state.length > 0 ? diffUpdate(rec.bin, state) : rec.bin;
      const fullState = encodeStateVector(
        (() => {
          const d = new YDoc();
          applyUpdate(d, rec.bin);
          return d;
        })()
      );
      return {
        docId,
        missing,
        state: fullState,
        timestamp: rec.timestamp,
      };
    },
    mergeUpdates: async updates => {
      onMergeUpdates(updates);
      return yjsMergeUpdates(updates);
    },
    deleteDoc: async (_id, docId) => {
      docs.delete(docId);
    },
    getDocClocks: async () =>
      Array.from(docs.entries()).map(([docId, rec]) => ({
        docId,
        timestamp: rec.timestamp,
      })),
    getDocClock: async (_id, docId) => {
      const rec = docs.get(docId);
      return rec ? { docId, timestamp: rec.timestamp } : null;
    },
    getDocIndexedClock: unimplemented,
    setDocIndexedClock: unimplemented,
    setDocIndexedClocks: unimplemented,
    clearDocIndexedClock: unimplemented,
    getBlob: unimplemented,
    setBlob: unimplemented,
    deleteBlob: unimplemented,
    releaseBlobs: unimplemented,
    listBlobs: unimplemented,
    getPeerRemoteClocks: async () => [],
    getPeerRemoteClock: async () => null,
    setPeerRemoteClock: async () => {},
    getPeerPulledRemoteClocks: async () => [],
    getPeerPulledRemoteClock: async () => null,
    setPeerPulledRemoteClock: async () => {},
    getPeerPushedClocks: async () => [],
    getPeerPushedClock: async () => null,
    setPeerPushedClock: async () => {},
    clearClocks: async () => {},
    setBlobUploadedAt: unimplemented,
    getBlobUploadedAt: unimplemented,
    crawlDocData: unimplemented,
    indexUpsert: unimplemented,
    indexDelete: unimplemented,
    indexSearch: unimplemented,
    indexAggregate: unimplemented,
    indexDeleteByQuery: unimplemented,
    indexFlush: unimplemented,
    indexVersion: unimplemented,
  };
}

describe('StoreManagerClient + StoreManagerConsumer native sync wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('DocFrontend uses injected native mergeUpdates and DocPeer push uses SqliteDocStorage.getDocDiff', async () => {
    const nativeGetDocDiff = vi.fn();
    const nativeMergeUpdates = vi.fn();
    const nativeApis = createFakeNativeDBApis(
      nativeGetDocDiff,
      nativeMergeUpdates
    );
    const seedDoc = new YDoc({ guid: 'doc-1' });
    seedDoc.getText('content').insert(0, 'seed');
    await nativeApis.pushUpdate(
      'local:workspace:ws-1',
      'doc-1',
      encodeStateAsUpdate(seedDoc)
    );
    bindNativeDBApis(nativeApis);

    const { port1, port2 } = new MessageChannel();
    port1.start();
    port2.start();
    const consumer = new OpConsumer<WorkerManagerOps>(port2);
    const managerConsumer = new StoreManagerConsumer(
      [
        SqliteDocStorage,
        TestDummyDocSyncStorage,
        InMemoryRemoteDocStorage,
      ] as unknown as StorageConstructor[],
      { mergeUpdates: nativeApis.mergeUpdates }
    );
    managerConsumer.bindConsumer(consumer);

    const managerClient = new StoreManagerClient(
      new OpClient<WorkerManagerOps>(port1),
      { mergeUpdates: nativeApis.mergeUpdates }
    );

    const { store, dispose } = managerClient.open('test-native-sync', {
      local: {
        doc: {
          name: SqliteDocStorage.identifier,
          opts: { flavour: 'local', type: 'workspace', id: 'ws-1' },
        },
        docSync: {
          name: TestDummyDocSyncStorage.identifier,
          opts: { id: 'ws-1' },
        },
      },
      remotes: {
        cloud: {
          doc: {
            name: InMemoryRemoteDocStorage.identifier,
            opts: { id: 'ws-1' },
          },
        },
      },
    });

    try {
      const ydoc = new YDoc({ guid: 'doc-1' });
      store.docFrontend.connectDoc(ydoc);
      store.docFrontend.start();
      await store.docFrontend.waitForDocReady('doc-1');
      await store.docFrontend.waitForSynced('doc-1');

      // Apply multiple updates in one tick so DocFrontend coalesces them through mergeUpdates.
      ydoc.getText('content').insert(0, 'hello');
      ydoc.getText('content').insert(5, ' native');
      ydoc.getText('content').insert(12, ' sync');

      await vi.waitFor(
        () => {
          expect(nativeMergeUpdates).toHaveBeenCalled();
          expect(nativeGetDocDiff).toHaveBeenCalled();
          expect(
            nativeGetDocDiff.mock.calls.some(call => call[1] === 'doc-1')
          ).toBe(true);
        },
        { timeout: 10_000 }
      );
    } finally {
      store.docFrontend.stop();
      dispose();
      managerClient.dispose();
      consumer.destroy();
      port1.close();
      port2.close();
    }
  }, 15_000);
});
