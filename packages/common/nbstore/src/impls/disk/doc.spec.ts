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
  const sessionId = universalId({
    peer: 'local',
    type: 'workspace',
    id: 'workspace-test',
  });
  const listeners = new Map<string, Set<(event: DiskSyncEvent) => void>>();

  const startSession = vi.fn(
    async (_sessionId: string, _options: { workspaceId: string }) => {}
  );
  const stopSession = vi.fn(async (_sessionId: string) => {});
  const applyLocalUpdate = vi.fn(
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
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    expect(startSession).toHaveBeenCalledWith(sessionId, {
      workspaceId: 'workspace-test',
      syncFolder: '/tmp/sync',
    });

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
      }),
      'origin:local'
    );
    expect(seen).toEqual([{ docId: 'doc-local', origin: 'origin:local' }]);

    const snapshot = await storage.getDoc('doc-local');
    expect(snapshot?.docId).toBe('doc-local');
    expect(snapshot?.timestamp.toISOString()).toBe('2026-01-02T00:00:00.000Z');

    unsubscribe();
    storage.connection.disconnect();
  });

  it('applies remote events into local snapshots and handles delete events', async () => {
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

    emit({
      type: 'doc-delete',
      docId: 'doc-remote',
      timestamp: new Date('2026-01-03T00:00:01.000Z'),
    });

    await vi.waitFor(async () => {
      expect(await storage.getDoc('doc-remote')).toBeNull();
    });

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

  it('does not block follow-up updates when snapshot merge fails once', async () => {
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

    // This update triggers the mocked merge failure, but should still resolve.
    await expect(
      storage.pushDocUpdate({
        docId: 'doc-merge-fallback',
        bin: createMapUpdate({ b: '2' }),
      })
    ).resolves.toEqual({
      docId: 'doc-merge-fallback',
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
    });

    // Follow-up update should continue to work without requiring reconnect/reload.
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
      b: '2',
      c: '3',
    });

    storage.connection.disconnect();
  });

  it('accepts remote doc-update bins as number[] (from native binding)', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    const original = createUpdate('remote-array');
    const bin = Array.from(original) as unknown as Uint8Array;

    emit({
      type: 'doc-update',
      update: {
        docId: 'doc-remote-array',
        bin,
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
      },
    });

    await vi.waitFor(async () => {
      const snapshot = await storage.getDoc('doc-remote-array');
      expect(snapshot).not.toBeNull();

      const doc = new YDoc();
      applyUpdate(doc, snapshot!.bin);
      expect(doc.getText('content').toString()).toBe('remote-array');
    });

    storage.connection.disconnect();
  });

  it('throws when applyLocalUpdate returns invalid timestamp', async () => {
    applyLocalUpdate.mockResolvedValueOnce({
      docId: 'doc-invalid-clock',
      timestamp: new Date('invalid'),
    });

    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    await expect(
      storage.pushDocUpdate({
        docId: 'doc-invalid-clock',
        bin: createUpdate('invalid'),
      })
    ).rejects.toThrow('[disk] invalid timestamp');

    storage.connection.disconnect();
  });

  it('skips remote doc-update with invalid timestamp', async () => {
    const storage = createStorage();
    storage.connection.connect();
    await storage.connection.waitForConnected();

    emit({
      type: 'doc-update',
      update: {
        docId: 'doc-invalid-remote-clock',
        bin: createUpdate('remote-invalid'),
        timestamp: new Date('invalid') as unknown as Date,
      },
    });

    await vi.waitFor(async () => {
      expect(await storage.getDoc('doc-invalid-remote-clock')).toBeNull();
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
