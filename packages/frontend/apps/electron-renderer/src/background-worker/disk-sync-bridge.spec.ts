import type { DiskSyncEvent } from '@affine/nbstore/disk';
import { describe, expect, it, vi } from 'vitest';

import { createDiskSyncApis } from './disk-sync-bridge';

describe('createDiskSyncApis', () => {
  it('forwards handler calls and filters events by session id', async () => {
    const startSession = vi.fn(async () => {});
    const stopSession = vi.fn(async () => {});
    const applyLocalUpdate = vi.fn(async () => ({
      docId: 'doc-1',
      timestamp: new Date('2026-01-04T00:00:00.000Z'),
    }));

    const listeners = new Set<
      (payload: { sessionId: string; event: DiskSyncEvent }) => void
    >();
    const onEvent = vi.fn(
      (
        callback: (payload: { sessionId: string; event: DiskSyncEvent }) => void
      ) => {
        listeners.add(callback);
        return () => {
          listeners.delete(callback);
        };
      }
    );

    const apis = createDiskSyncApis(
      { startSession, stopSession, applyLocalUpdate },
      { onEvent }
    );

    await apis.startSession('session-a', {
      workspaceId: 'workspace-a',
      syncFolder: '/tmp/sync-a',
    });
    await apis.stopSession('session-a');
    await apis.applyLocalUpdate('session-a', {
      docId: 'doc-1',
      bin: new Uint8Array([1, 2, 3]),
    });

    expect(startSession).toHaveBeenCalledWith('session-a', {
      workspaceId: 'workspace-a',
      syncFolder: '/tmp/sync-a',
    });
    expect(stopSession).toHaveBeenCalledWith('session-a');
    expect(applyLocalUpdate).toHaveBeenCalledWith(
      'session-a',
      expect.objectContaining({ docId: 'doc-1' }),
      undefined
    );

    const callback = vi.fn();
    const unsubscribe = apis.subscribeEvents('session-a', callback);

    expect(onEvent).toHaveBeenCalledTimes(1);

    const docUpdate: DiskSyncEvent = {
      type: 'doc-update',
      update: {
        docId: 'doc-2',
        bin: new Uint8Array([4, 5, 6]),
        timestamp: new Date('2026-01-04T00:00:01.000Z'),
      },
    };

    for (const listener of listeners) {
      listener({ sessionId: 'session-b', event: { type: 'ready' } });
      listener({ sessionId: 'session-a', event: docUpdate });
    }

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(docUpdate);

    unsubscribe();
  });
});
