import type { DiskSyncEvent } from '@affine/nbstore/disk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const diskSyncMocks = vi.hoisted(() => {
  return {
    startSession: vi.fn(async () => {}),
    stopSession: vi.fn(async () => {}),
    applyLocalUpdate: vi.fn(async () => ({
      docId: 'doc-1',
      timestamp: new Date('2026-01-06T00:00:00.000Z'),
    })),
    prepareSourceDoc: vi.fn(async () => new Uint8Array([0, 0])),
    acknowledgeSourceUpdate: vi.fn(async () => {}),
    subscribeEvents: vi.fn(
      (
        _sessionId: string,
        _callback: (err: Error | null, event: DiskSyncEvent) => void
      ) => {
        return Promise.resolve({
          unsubscribe: () => {},
        });
      }
    ),
  };
});

vi.mock('@affine/native', () => {
  class DiskSyncMock {
    subscribeEvents(
      sessionId: string,
      callback: (err: Error | null, event: DiskSyncEvent) => void
    ) {
      return diskSyncMocks.subscribeEvents(sessionId, callback);
    }

    startSession(
      sessionId: string,
      options: { workspaceId: string; syncFolder: string }
    ) {
      return diskSyncMocks.startSession(sessionId, options);
    }

    stopSession(sessionId: string) {
      return diskSyncMocks.stopSession(sessionId);
    }

    applyLocalUpdate(
      sessionId: string,
      update: { docId: string; bin: Uint8Array }
    ) {
      return diskSyncMocks.applyLocalUpdate(sessionId, update);
    }

    prepareSourceDoc(
      sessionId: string,
      docId: string,
      local?: Uint8Array,
      root?: Uint8Array
    ) {
      return diskSyncMocks.prepareSourceDoc(sessionId, docId, local, root);
    }

    acknowledgeSourceUpdate(
      sessionId: string,
      docId: string,
      snapshot: Uint8Array
    ) {
      return diskSyncMocks.acknowledgeSourceUpdate(sessionId, docId, snapshot);
    }
  }

  return { DiskSync: DiskSyncMock };
});

import {
  prepareSourceDoc,
  startSession,
  stopSession,
} from '../../src/helper/disk-sync/handlers';
import { diskSyncSubjects } from '../../src/helper/disk-sync/subjects';

describe('disk helper handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards subscribeEvents payload and unsubscribes on stop', async () => {
    const unsubscribe = vi.fn();
    diskSyncMocks.subscribeEvents.mockImplementation(
      (
        _sessionId: string,
        callback: (err: Error | null, event: DiskSyncEvent) => void
      ) => {
        callback(null, {
          type: 'source-discovered',
          docId: 'doc-source',
        } as DiskSyncEvent);
        callback(null, {
          type: 'root-doc-discovered',
          docId: 'doc-root',
        } as DiskSyncEvent);
        return Promise.resolve({
          unsubscribe,
        });
      }
    );

    const seen: string[] = [];
    const subscription = diskSyncSubjects.event$.subscribe(payload => {
      seen.push(payload.event.type);
    });

    await startSession('session-subscribe', {
      workspaceId: 'workspace-subscribe',
      syncFolder: '/tmp/disk-sync',
    });

    expect(seen).toContain('source-discovered');
    expect(seen).toContain('root-doc-discovered');
    expect(diskSyncMocks.subscribeEvents).toHaveBeenCalledWith(
      'session-subscribe',
      expect.any(Function)
    );

    const local = new Uint8Array([1, 2]);
    const root = new Uint8Array([3, 4]);
    await prepareSourceDoc('session-subscribe', 'doc-source', local, root);
    expect(diskSyncMocks.prepareSourceDoc).toHaveBeenCalledWith(
      'session-subscribe',
      'doc-source',
      local,
      root
    );

    await stopSession('session-subscribe');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('keeps a shared native session open until every window disconnects', async () => {
    const unsubscribe = vi.fn(async () => {});
    diskSyncMocks.subscribeEvents.mockResolvedValue({ unsubscribe });
    const options = {
      workspaceId: 'workspace-shared',
      syncFolder: '/tmp/disk-sync-shared',
    };

    await Promise.all([
      startSession('session-shared', options),
      startSession('session-shared', options),
    ]);
    expect(diskSyncMocks.startSession).toHaveBeenCalledTimes(1);
    expect(diskSyncMocks.subscribeEvents).toHaveBeenCalledTimes(1);

    await stopSession('session-shared');
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(diskSyncMocks.stopSession).not.toHaveBeenCalled();

    await stopSession('session-shared');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(diskSyncMocks.stopSession).toHaveBeenCalledTimes(1);
  });
});
