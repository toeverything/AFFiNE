import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const storageState = new Map<string, unknown>();

vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storageState.clear();

  vi.doMock('../../src/main/shared-storage/storage', () => ({
    globalStateStorage: {
      get: (key: string) => storageState.get(key),
      set: (key: string, value: unknown) => {
        storageState.set(key, value);
      },
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

async function createCoordinator(controllerOverrides?: {
  startRecording?: ReturnType<typeof vi.fn>;
  stopRecording?: ReturnType<typeof vi.fn>;
  abortRecording?: ReturnType<typeof vi.fn>;
}) {
  const { RecordingCoordinator } =
    await import('../../src/main/recording/coordinator');
  const controller = {
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    abortRecording: vi.fn(),
    ...controllerOverrides,
  };

  return {
    coordinator: new RecordingCoordinator(
      '/tmp',
      async filepath => filepath,
      async () => controller
    ),
    controller,
  };
}

describe('RecordingCoordinator', () => {
  test('disabling can await native abort before allowing another start', async () => {
    const startRecording = vi.fn().mockResolvedValue({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      startedAt: 123,
    });
    const stopRecording = vi.fn();
    let releaseAbort!: () => void;
    const abortRecording = vi.fn(
      () =>
        new Promise<void>(resolve => {
          releaseAbort = resolve;
        })
    );

    const { coordinator } = await createCoordinator({
      startRecording,
      stopRecording,
      abortRecording,
    });

    await coordinator.start();
    const abortPromise = coordinator.abortActive();
    await Promise.resolve();

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(abortRecording).toHaveBeenCalledWith('native-1');

    releaseAbort();
    await abortPromise;

    await coordinator.start();
    expect(startRecording).toHaveBeenCalledTimes(2);
  });

  test('claiming an import binds it to a workspace and stable doc id', async () => {
    storageState.set('recordingJobs:v2', [
      {
        id: 7,
        phase: 'recorded',
        appName: 'Zoom',
        startTime: 1000,
        createdAt: 1,
        updatedAt: 1,
        artifact: {
          filepath: '/tmp/meeting.opus',
          sampleRate: 48_000,
          numberOfChannels: 2,
        },
      },
    ]);

    const { coordinator } = await createCoordinator();

    const claimed = coordinator.claimImport(7, 'workspace-1');

    expect(claimed).toMatchObject({
      id: 7,
      workspaceId: 'workspace-1',
      docId: 'recording-7',
      importStatus: 'importing',
    });
    expect(coordinator.importQueue()).toEqual([
      expect.objectContaining({
        id: 7,
        workspaceId: 'workspace-1',
        docId: 'recording-7',
        importStatus: 'importing',
      }),
    ]);
  });

  test('reopens interrupted imports as pending work while suppressing stale terminal popups', async () => {
    storageState.set('recordingJobs:v2', [
      {
        id: 1,
        phase: 'importing',
        appName: 'Zoom',
        startTime: 1000,
        createdAt: 1,
        updatedAt: 1,
        artifact: {
          filepath: '/tmp/interrupted.opus',
        },
        import: {
          workspaceId: 'workspace-1',
          docId: 'recording-1',
          leaseExpiresAt: Date.now() + 10_000,
        },
      },
      {
        id: 2,
        phase: 'imported',
        appName: 'Meet',
        startTime: 2000,
        createdAt: 2,
        updatedAt: 2,
        artifact: {
          filepath: '/tmp/imported.opus',
        },
      },
      {
        id: 3,
        phase: 'failed',
        appName: 'Teams',
        startTime: 3000,
        createdAt: 3,
        updatedAt: 3,
        artifact: {
          filepath: '/tmp/failed.opus',
        },
        error: {
          stage: 'import',
          message: 'import failed',
        },
      },
    ]);

    const { coordinator } = await createCoordinator();

    expect(coordinator.importQueue()).toEqual([
      expect.objectContaining({
        id: 1,
        importStatus: 'pending_import',
      }),
    ]);
    expect(coordinator.currentStatus()).toBeNull();
  });

  test('abortActive clears the local job even when native abort fails', async () => {
    const startRecording = vi.fn().mockResolvedValue({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      startedAt: 123,
    });
    const abortRecording = vi
      .fn()
      .mockRejectedValue(new Error('native abort failed'));
    const { coordinator } = await createCoordinator({
      startRecording,
      abortRecording,
    });

    await coordinator.start();

    await expect(coordinator.abortActive()).rejects.toThrow(
      'native abort failed'
    );
    expect(coordinator.currentStatus()).toBeNull();
    expect(coordinator.jobs).toEqual([]);
  });

  test('start failures project to start_failed and release the active slot', async () => {
    const startRecording = vi
      .fn()
      .mockRejectedValueOnce(new Error('native start failed'))
      .mockResolvedValueOnce({
        id: 'native-2',
        filepath: '/tmp/1.opus',
        sampleRate: 48_000,
        channels: 2,
        startedAt: 456,
      });
    const { coordinator } = await createCoordinator({
      startRecording,
    });

    const failed = await coordinator.start();
    expect(failed).toMatchObject({
      phase: 'failed',
      error: {
        stage: 'start',
        message: 'native start failed',
      },
    });
    expect(coordinator.currentStatus()).toMatchObject({
      status: 'start_failed',
      errorMessage: 'native start failed',
    });

    const next = await coordinator.start();
    expect(next).toMatchObject({
      id: 1,
      phase: 'recording',
    });
  });

  test('stop failures project to finalize_failed and release the active slot', async () => {
    const startRecording = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'native-1',
        filepath: '/tmp/0.opus',
        sampleRate: 48_000,
        channels: 2,
        startedAt: 123,
      })
      .mockResolvedValueOnce({
        id: 'native-2',
        filepath: '/tmp/1.opus',
        sampleRate: 48_000,
        channels: 2,
        startedAt: 456,
      });
    const stopRecording = vi
      .fn()
      .mockRejectedValueOnce(new Error('native stop failed'));
    const { coordinator } = await createCoordinator({
      startRecording,
      stopRecording,
    });

    const first = await coordinator.start();
    await coordinator.stop(first!.id);

    expect(coordinator.currentStatus()).toMatchObject({
      id: first!.id,
      status: 'finalize_failed',
      errorMessage: 'native stop failed',
    });

    const next = await coordinator.start();
    expect(next).toMatchObject({
      id: 1,
      phase: 'recording',
    });
  });

  test.each([
    {
      name: 'successful import completion',
      settleImport: (coordinator: {
        completeImport: (id: number) => unknown;
      }) => coordinator.completeImport(7),
      expectedStatus: 'imported',
    },
    {
      name: 'failed import completion',
      settleImport: (coordinator: {
        failImport: (id: number, errorMessage?: string) => unknown;
      }) => coordinator.failImport(7, 'import failed'),
      expectedStatus: 'import_failed',
    },
  ])(
    'projects $name without leaking completed queue items into the import queue',
    async ({ settleImport, expectedStatus }) => {
      storageState.set('recordingJobs:v2', [
        {
          id: 7,
          phase: 'recorded',
          appName: 'Zoom',
          startTime: 1000,
          createdAt: 1,
          updatedAt: 1,
          artifact: {
            filepath: '/tmp/meeting.opus',
            sampleRate: 48_000,
            numberOfChannels: 2,
          },
        },
      ]);

      const { coordinator } = await createCoordinator();
      settleImport(coordinator as never);

      expect(coordinator.currentStatus()).toMatchObject({
        id: 7,
        status: expectedStatus,
      });
      expect(coordinator.importQueue()).toEqual([]);
    }
  );

  test.each([
    {
      name: 'successful imports',
      seed: {
        id: 11,
        phase: 'imported' as const,
        appName: 'Zoom',
        startTime: 1000,
        createdAt: 1,
        updatedAt: 1,
        artifact: {
          filepath: '/tmp/imported.opus',
        },
      },
    },
    {
      name: 'failed imports',
      seed: {
        id: 12,
        phase: 'failed' as const,
        appName: 'Meet',
        startTime: 1000,
        createdAt: 1,
        updatedAt: 1,
        artifact: {
          filepath: '/tmp/failed.opus',
        },
        error: {
          stage: 'import' as const,
          message: 'import failed',
        },
      },
    },
  ])(
    'suppresses persisted terminal $name from the current status',
    async ({ seed }) => {
      storageState.set('recordingJobs:v2', [seed]);

      const { coordinator } = await createCoordinator();

      expect(coordinator.currentStatus()).toBeNull();
      expect(coordinator.importQueue()).toEqual([]);
    }
  );

  test('dismissing an import failure clears the popup projection without dropping the saved artifact', async () => {
    storageState.set('recordingJobs:v2', [
      {
        id: 7,
        phase: 'failed',
        appName: 'Zoom',
        startTime: 1000,
        createdAt: 1,
        updatedAt: 1,
        artifact: {
          filepath: '/tmp/meeting.opus',
        },
        error: {
          stage: 'import',
          message: 'import failed',
        },
      },
    ]);

    const { coordinator } = await createCoordinator();
    coordinator.dismiss(7);

    expect(coordinator.currentStatus()).toBeNull();
    expect(coordinator.importQueue()).toEqual([]);
    expect(storageState.get('recordingJobs:v2')).toEqual([
      expect.objectContaining({
        id: 7,
        phase: 'failed',
        dismissedAt: expect.any(Number),
        artifact: expect.objectContaining({
          filepath: '/tmp/meeting.opus',
        }),
        error: {
          stage: 'import',
          message: 'import failed',
        },
      }),
    ]);
  });
});
