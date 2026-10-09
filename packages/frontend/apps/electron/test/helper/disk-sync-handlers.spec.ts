import path from 'node:path';

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
    resolveSourceDocId: vi.fn(async () => 'doc-source'),
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

    resolveSourceDocId(sessionId: string, filePath: string) {
      return diskSyncMocks.resolveSourceDocId(sessionId, filePath);
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
  diskSyncPathsEqual,
  prepareSourceDoc,
  resolveSourceDocId,
  startSession,
  stopSession,
} from '../../src/helper/disk-sync/handlers';
import { diskSyncSubjects } from '../../src/helper/disk-sync/subjects';

describe('disk helper handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    diskSyncMocks.prepareSourceDoc.mockResolvedValue(new Uint8Array([0, 0]));
  });

  it('forwards subscribeEvents payload and unsubscribes on stop', async () => {
    const syncFolder = path.resolve('/tmp/disk-sync');
    const sourceFile = path.resolve('/tmp/disk-sync/source.md');
    const unsubscribe = vi.fn();
    diskSyncMocks.subscribeEvents.mockImplementation(
      (
        _sessionId: string,
        callback: (err: Error | null, event: DiskSyncEvent) => void
      ) => {
        callback(null, {
          type: 'source-discovered',
          docId: 'doc-source',
          filePath: sourceFile,
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
      syncFolder,
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

    await expect(
      resolveSourceDocId('workspace-subscribe', syncFolder, sourceFile)
    ).resolves.toBe('doc-source');
    expect(diskSyncMocks.resolveSourceDocId).toHaveBeenCalledWith(
      'session-subscribe',
      sourceFile
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

  it('publishes a doc-scoped error when source preparation fails', async () => {
    diskSyncMocks.prepareSourceDoc.mockRejectedValueOnce(
      new Error('unsupported Markdown table edit')
    );
    const events: DiskSyncEvent[] = [];
    const subscription = diskSyncSubjects.event$.subscribe(payload => {
      if (payload.sessionId === 'session-failed-import') {
        events.push(payload.event);
      }
    });

    await expect(
      prepareSourceDoc('session-failed-import', 'doc-failed-import')
    ).rejects.toThrow('unsupported Markdown table edit');
    expect(events).toContainEqual({
      type: 'error',
      docId: 'doc-failed-import',
      message: 'unsupported Markdown table edit',
    });

    subscription.unsubscribe();
  });

  it('resolves a source through the session bound to that exact file', async () => {
    diskSyncMocks.resolveSourceDocId.mockImplementation(
      async sessionId => `doc-from-${sessionId}`
    );
    const common = {
      workspaceId: 'workspace-files',
      syncFolder: '/tmp/disk-sync-files',
    };

    await startSession('session-a', {
      ...common,
      sourceFile: '/tmp/disk-sync-files/A.md',
    });
    await startSession('session-b', {
      ...common,
      sourceFile: '/tmp/disk-sync-files/B.md',
    });

    await expect(
      resolveSourceDocId(
        common.workspaceId,
        common.syncFolder,
        '/tmp/disk-sync-files/B.md'
      )
    ).resolves.toBe('doc-from-session-b');

    await stopSession('session-a');
    await stopSession('session-b');
  });

  it('prefers an exact-file session over a folder-only session', async () => {
    diskSyncMocks.resolveSourceDocId.mockImplementation(
      async sessionId => `doc-from-${sessionId}`
    );
    const common = {
      workspaceId: 'workspace-session-priority',
      syncFolder: '/tmp/disk-sync-session-priority',
    };
    const sourceFile = `${common.syncFolder}/source.md`;

    await startSession('session-folder-only', common);
    await startSession('session-exact-file', { ...common, sourceFile });

    await expect(
      resolveSourceDocId(common.workspaceId, common.syncFolder, sourceFile)
    ).resolves.toBe('doc-from-session-exact-file');

    await stopSession('session-folder-only');
    await stopSession('session-exact-file');
  });

  it('matches Windows disk-sync paths case-insensitively', () => {
    expect(
      diskSyncPathsEqual(
        'C:\\Notes\\Markdown\\Source.md',
        'c:\\notes\\markdown\\source.md',
        'win32'
      )
    ).toBe(true);
  });
});
