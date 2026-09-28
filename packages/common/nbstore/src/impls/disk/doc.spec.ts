import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

import { universalId } from '../../utils/universal-id';
import { bindDiskSyncApis, type DiskSyncApis, type DiskSyncEvent } from './api';
import { DiskDocStorage } from './doc';

function createUpdate(text: string): Uint8Array {
  const doc = new YDoc();
  doc.getText('content').insert(0, text);
  return encodeStateAsUpdate(doc);
}

function createMapUpdate(entries: Record<string, string>): Uint8Array {
  const doc = new YDoc();
  const map = doc.getMap('test');
  for (const [key, value] of Object.entries(entries)) {
    map.set(key, value);
  }
  return encodeStateAsUpdate(doc);
}

function createRootMetaUpdate(docIds: string[]): Uint8Array {
  const doc = new YDoc();
  const meta = doc.getMap('meta');
  const pages = new YArray<YMap<unknown>>();
  for (const docId of docIds) {
    const page = new YMap<unknown>();
    page.set('id', docId);
    pages.push([page]);
  }
  meta.set('pages', pages);
  return encodeStateAsUpdate(doc);
}

describe('DiskDocStorage', () => {
  const sessionId = JSON.stringify([
    universalId({ peer: 'local', type: 'workspace', id: 'workspace-test' }),
    '/tmp/sync',
  ]);
  const listeners = new Map<string, Set<(event: DiskSyncEvent) => void>>();

  const startSession = vi.fn(
    async (_sessionId: string, _options: { workspaceId: string }) => {}
  );
  const stopSession = vi.fn(async (_sessionId: string) => {});
  const prepareSourceDoc = vi.fn(async () => null as Uint8Array | null);
  const applyLocalUpdate = vi.fn<DiskSyncApis['applyLocalUpdate']>(
    async (_sessionId: string, update: { docId: string }) => {
      return {
        docId: update.docId,
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
      };
    }
  );
  const subscribeEvents = vi.fn(
    (currentSessionId: string, callback: (event: DiskSyncEvent) => void) => {
      let set = listeners.get(currentSessionId);
      if (!set) {
        set = new Set();
        listeners.set(currentSessionId, set);
      }
      set.add(callback);
      return () => {
        set?.delete(callback);
      };
    }
  );

  const apis: DiskSyncApis = {
    startSession,
    stopSession,
    applyLocalUpdate,
    acknowledgeSourceUpdate: vi.fn(async () => {}),
    prepareSourceDoc,
    subscribeEvents,
  };

  function emit(event: DiskSyncEvent) {
    const callbacks = listeners.get(sessionId);
    for (const callback of callbacks ?? []) {
      callback(event);
    }
  }

  function createStorage() {
    return new DiskDocStorage({
      flavour: 'local',
      type: 'workspace',
      id: 'workspace-test',
      syncFolder: '/tmp/sync',
    });
  }

  beforeEach(() => {
    bindDiskSyncApis(apis);
    listeners.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    listeners.clear();
  });

  it('starts and stops disk session with connection lifecycle', async () => {
    startSession.mockImplementationOnce(async () => {
      emit({ type: 'source-discovered', docId: 'doc-on-disk' });
    });
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    expect(startSession).toHaveBeenCalledWith(sessionId, {
      workspaceId: 'workspace-test',
      syncFolder: '/tmp/sync',
    });

    expect((await storage.getDocTimestamp('doc-on-disk'))?.docId).toBe(
      'doc-on-disk'
    );
    const snapshot = createUpdate('source');
    prepareSourceDoc.mockResolvedValueOnce(snapshot);
    await storage.prepareDocImport('doc-on-disk', null, null);
    expect(prepareSourceDoc).toHaveBeenCalledWith(
      sessionId,
      'doc-on-disk',
      undefined,
      undefined
    );
    expect((await storage.getDoc('doc-on-disk'))?.bin).toEqual(snapshot);

    storage.connection.disconnect();
    await vi.waitFor(() => {
      expect(stopSession).toHaveBeenCalledWith(sessionId);
    });
  });

  it('forwards local updates and emits doc update events', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    const seen: Array<{ docId: string; origin?: string }> = [];
    const unsubscribe = storage.subscribeDocUpdate((update, origin) => {
      seen.push({ docId: update.docId, origin });
    });

    const bin = createUpdate('local');
    await storage.pushDocUpdate({ docId: 'doc-local', bin }, 'origin:local');

    expect(applyLocalUpdate).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        docId: 'doc-local',
      })
    );
    expect(seen).toEqual([{ docId: 'doc-local', origin: 'origin:local' }]);

    const snapshot = await storage.getDoc('doc-local');
    expect(snapshot?.docId).toBe('doc-local');
    expect(snapshot?.timestamp.toISOString()).toBe('2026-01-02T00:00:00.000Z');

    applyLocalUpdate.mockResolvedValueOnce({
      docId: 'doc-unexportable',
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
      exportError: 'source has no exportable note',
    });
    await expect(
      storage.pushDocUpdate({
        docId: 'doc-unexportable',
        bin: createUpdate('unexportable'),
      })
    ).rejects.toMatchObject({
      name: 'DISK_SOURCE_EXPORT_FAILED',
      message: 'source has no exportable note',
    });
    expect(await storage.getDoc('doc-unexportable')).toBeNull();

    unsubscribe();
    storage.connection.disconnect();
  });

  it('applies remote events into local snapshots', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    emit({
      type: 'doc-update',
      update: {
        docId: 'doc-remote',
        bin: createUpdate('remote'),
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
      },
    });

    await vi.waitFor(async () => {
      const snapshot = await storage.getDoc('doc-remote');
      expect(snapshot?.docId).toBe('doc-remote');
    });

    const timestamps = await storage.getDocTimestamps();
    expect(timestamps['doc-remote']?.toISOString()).toBe(
      '2026-01-03T00:00:00.000Z'
    );

    storage.connection.disconnect();
  });

  it('serializes concurrent remote doc-update merges for the same doc', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    const originalMergeUpdates = (
      storage as unknown as {
        mergeUpdates: (updates: Uint8Array[]) => Promise<Uint8Array>;
      }
    ).mergeUpdates.bind(storage);

    let mergeCall = 0;
    vi.spyOn(
      storage as unknown as {
        mergeUpdates: (updates: Uint8Array[]) => Promise<Uint8Array>;
      },
      'mergeUpdates'
    ).mockImplementation(async updates => {
      mergeCall += 1;
      // Force two in-flight merge operations to overlap and complete out-of-order.
      if (mergeCall === 1) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return originalMergeUpdates(updates);
    });

    emit({
      type: 'doc-update',
      update: {
        docId: 'doc-race',
        bin: createMapUpdate({ first: '1' }),
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
      },
    });
    emit({
      type: 'doc-update',
      update: {
        docId: 'doc-race',
        bin: createMapUpdate({ second: '2' }),
        timestamp: new Date('2026-01-03T00:00:00.001Z'),
      },
    });

    await vi.waitFor(async () => {
      const snapshot = await storage.getDoc('doc-race');
      expect(snapshot).not.toBeNull();
      expect(snapshot!.timestamp.toISOString()).toBe(
        '2026-01-03T00:00:00.001Z'
      );

      const doc = new YDoc();
      applyUpdate(doc, snapshot!.bin);
      expect(doc.getMap('test').toJSON()).toEqual({
        first: '1',
        second: '2',
      });
    });

    storage.connection.disconnect();
  });

  it('preserves the snapshot when a merge fails and accepts a retry', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    const originalMergeUpdates = (
      storage as unknown as {
        mergeUpdates: (updates: Uint8Array[]) => Promise<Uint8Array>;
      }
    ).mergeUpdates.bind(storage);

    let mergeCall = 0;
    vi.spyOn(
      storage as unknown as {
        mergeUpdates: (updates: Uint8Array[]) => Promise<Uint8Array>;
      },
      'mergeUpdates'
    ).mockImplementation(async updates => {
      mergeCall += 1;
      if (mergeCall === 1) {
        throw new Error('merge failed once');
      }
      return originalMergeUpdates(updates);
    });

    await expect(
      storage.pushDocUpdate({
        docId: 'doc-merge-fallback',
        bin: createMapUpdate({ a: '1' }),
      })
    ).resolves.toEqual({
      docId: 'doc-merge-fallback',
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
    });

    // A failed cache merge must not replace the full snapshot with a delta.
    await expect(
      storage.pushDocUpdate({
        docId: 'doc-merge-fallback',
        bin: createMapUpdate({ b: '2' }),
      })
    ).rejects.toThrow('merge failed once');

    await storage.pushDocUpdate({
      docId: 'doc-merge-fallback',
      bin: createMapUpdate({ b: '2' }),
    });

    await expect(
      storage.pushDocUpdate({
        docId: 'doc-merge-fallback',
        bin: createMapUpdate({ c: '3' }),
      })
    ).resolves.toEqual({
      docId: 'doc-merge-fallback',
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
    });

    const snapshot = await storage.getDoc('doc-merge-fallback');
    expect(snapshot).not.toBeNull();
    const doc = new YDoc();
    applyUpdate(doc, snapshot!.bin);
    const data = doc.getMap('test').toJSON();
    expect(data).toMatchObject({
      a: '1',
      b: '2',
      c: '3',
    });

    storage.connection.disconnect();
  });

  it('discovers doc ids from root meta and emits connect-driving updates once', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    const seen: Array<{ docId: string; origin?: string; size: number }> = [];
    const unsubscribe = storage.subscribeDocUpdate((update, origin) => {
      seen.push({
        docId: update.docId,
        origin,
        size: update.bin.byteLength,
      });
    });

    const rootUpdate = createRootMetaUpdate(['doc-a', 'doc-b']);

    applyLocalUpdate.mockImplementationOnce(async () => {
      for (const docId of ['doc-a', 'doc-b']) {
        for (const listener of listeners.get(sessionId) ?? []) {
          listener({ type: 'root-doc-discovered', docId });
        }
      }
      return {
        docId: 'workspace-test',
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
      };
    });

    await storage.pushDocUpdate(
      {
        docId: 'workspace-test',
        bin: rootUpdate,
      },
      'origin:root'
    );

    await vi.waitFor(() => {
      const discovered = seen.filter(
        item => item.origin === 'disk:root-meta-discovery'
      );
      expect(discovered).toHaveLength(2);
    });

    const discoveredDocIds = seen
      .filter(item => item.origin === 'disk:root-meta-discovery')
      .map(item => item.docId)
      .sort();
    expect(discoveredDocIds).toEqual(['doc-a', 'doc-b']);
    expect(seen[0]).toMatchObject({
      docId: 'workspace-test',
      origin: 'origin:root',
    });
    expect(
      seen
        .filter(item => item.origin === 'disk:root-meta-discovery')
        .every(item => item.size === 0)
    ).toBe(true);

    await storage.pushDocUpdate(
      {
        docId: 'workspace-test',
        bin: rootUpdate,
      },
      'origin:root'
    );

    const discoveryCountAfterSecondPush = seen.filter(
      item => item.origin === 'disk:root-meta-discovery'
    ).length;
    expect(discoveryCountAfterSecondPush).toBe(2);

    unsubscribe();
    storage.connection.disconnect();
  });
});
