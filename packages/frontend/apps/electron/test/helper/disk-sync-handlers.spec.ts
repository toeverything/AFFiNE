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
      update: { docId: string; bin: Uint8Array },
      origin?: string
    ) {
      return diskSyncMocks.applyLocalUpdate(sessionId, update, origin);
    }
  }

  return { DiskSync: DiskSyncMock };
});

import {
  applyLocalUpdate,
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
          type: 'ready',
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

    expect(seen).toContain('ready');
    expect(diskSyncMocks.subscribeEvents).toHaveBeenCalledWith(
      'session-subscribe',
      expect.any(Function)
    );

    await stopSession('session-subscribe');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('throws when native applyLocalUpdate returns Error payload', async () => {
    diskSyncMocks.applyLocalUpdate.mockResolvedValueOnce(
      new Error('invalid_binary')
    );

    await expect(
      applyLocalUpdate('session-subscribe', {
        docId: 'doc-failed',
        bin: new Uint8Array([1, 2, 3]),
      })
    ).rejects.toThrow('[disk] applyLocalUpdate failed: invalid_binary');
  });

  it('stops and clears the session when unsubscribe fails', async () => {
    diskSyncMocks.subscribeEvents
      .mockResolvedValueOnce({
        unsubscribe: () => new Error('unsubscribe_failed'),
      })
      .mockResolvedValueOnce({
        unsubscribe: () => {},
      });

    const options = {
      workspaceId: 'workspace-unsubscribe-failure',
      syncFolder: '/tmp/disk-sync',
    };
    await startSession('session-unsubscribe-failure', options);

    await expect(stopSession('session-unsubscribe-failure')).rejects.toThrow(
      '[disk] unsubscribe failed: unsubscribe_failed'
    );
    expect(diskSyncMocks.stopSession).toHaveBeenCalledWith(
      'session-unsubscribe-failure'
    );

    await startSession('session-unsubscribe-failure', options);
    expect(diskSyncMocks.subscribeEvents).toHaveBeenCalledTimes(2);
    await stopSession('session-unsubscribe-failure');
  });

  it('serializes stop and restart for the same session id', async () => {
    let releaseStop!: () => void;
    diskSyncMocks.stopSession.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseStop = resolve;
        })
    );

    const options = {
      workspaceId: 'workspace-serialized-restart',
      syncFolder: '/tmp/disk-sync',
    };
    await startSession('session-serialized-restart', options);

    const stopping = stopSession('session-serialized-restart');
    await vi.waitFor(() => {
      expect(diskSyncMocks.stopSession).toHaveBeenCalledTimes(1);
    });
    const restarting = startSession('session-serialized-restart', options);

    await Promise.resolve();
    expect(diskSyncMocks.startSession).toHaveBeenCalledTimes(1);

    releaseStop();
    await stopping;
    await restarting;
    expect(diskSyncMocks.startSession).toHaveBeenCalledTimes(2);

    await stopSession('session-serialized-restart');
  });
});
