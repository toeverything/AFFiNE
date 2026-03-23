import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { RecordingStateMachine } from '../../src/main/recording/state-machine';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createAttachedRecording(stateMachine: RecordingStateMachine) {
  const starting = stateMachine.dispatch({
    type: 'START_RECORDING',
  });

  stateMachine.dispatch({
    type: 'ATTACH_NATIVE_RECORDING',
    id: starting!.id,
    nativeId: 'native-1',
    startTime: 100,
    filepath: '/tmp/recording.opus',
    sampleRate: 48000,
    numberOfChannels: 2,
  });

  return starting!;
}

describe('RecordingStateMachine', () => {
  test('tracks session lifecycle through finalized without coupling import state', () => {
    const stateMachine = new RecordingStateMachine();

    const starting = stateMachine.dispatch({
      type: 'START_RECORDING',
    });
    expect(starting).toMatchObject({
      sessionStatus: 'starting',
    });

    const recording = stateMachine.dispatch({
      type: 'ATTACH_NATIVE_RECORDING',
      id: starting!.id,
      nativeId: 'native-1',
      startTime: 100,
      filepath: '/tmp/recording.opus',
      sampleRate: 48000,
      numberOfChannels: 2,
    });
    expect(recording).toMatchObject({
      sessionStatus: 'recording',
      artifact: {
        filepath: '/tmp/recording.opus',
        sampleRate: 48000,
        numberOfChannels: 2,
      },
    });

    const finalizing = stateMachine.dispatch({
      type: 'STOP_RECORDING',
      id: starting!.id,
    });
    expect(finalizing?.sessionStatus).toBe('finalizing');

    const finalized = stateMachine.dispatch({
      type: 'ATTACH_RECORDING_ARTIFACT',
      id: starting!.id,
      artifact: {
        filepath: '/tmp/recording.opus',
        durationMs: 1_000,
        size: 128,
        degraded: true,
        overflowCount: 2,
      },
    });
    expect(finalized).toMatchObject({
      sessionStatus: 'finalized',
      artifact: {
        filepath: '/tmp/recording.opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        durationMs: 1_000,
        size: 128,
        degraded: true,
        overflowCount: 2,
      },
    });
  });

  test.each([
    {
      name: 'finalized sessions',
      settleEvent: {
        type: 'ATTACH_RECORDING_ARTIFACT' as const,
        artifact: {
          filepath: '/tmp/recording.opus',
        },
      },
      expectedStatus: 'finalized',
    },
    {
      name: 'failed finalize sessions',
      settleEvent: {
        type: 'FINALIZE_RECORDING_FAILED' as const,
        errorMessage: 'boom',
      },
      expectedStatus: 'finalize_failed',
    },
  ])(
    'allows a new recording after $name',
    ({ settleEvent, expectedStatus }) => {
      const stateMachine = new RecordingStateMachine();

      const pending = createAttachedRecording(stateMachine);
      stateMachine.dispatch({
        type: 'STOP_RECORDING',
        id: pending.id,
      });

      const settled = stateMachine.dispatch({
        id: pending.id,
        ...settleEvent,
      });
      expect(settled?.sessionStatus).toBe(expectedStatus);

      const next = stateMachine.dispatch({
        type: 'START_RECORDING',
      });
      expect(next?.id).toBeGreaterThan(pending.id);
      expect(next?.sessionStatus).toBe('starting');
    }
  );
});

describe('recording feature', () => {
  const nativeStartRecording = vi.fn();
  const nativeStopRecording = vi.fn();
  const nativeAbortRecording = vi.fn();
  const ensureDirSync = vi.fn();
  const resolveExistingPathInBase = vi.fn(
    async (_base: string, filepath: string) => filepath
  );
  const getMainWindow = vi.fn(async () => ({
    show: vi.fn(),
  }));

  const storageState = new Map<string, unknown>();
  const watchSubjects = new Map<string, BehaviorSubject<unknown>>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storageState.clear();
    watchSubjects.clear();

    vi.doMock('@affine/native', () => ({
      ShareableContent: class ShareableContent {
        static applications() {
          return [];
        }

        static applicationWithProcessId() {
          return null;
        }

        static isUsingMicrophone() {
          return false;
        }

        static onApplicationListChanged() {
          return { unsubscribe: vi.fn() };
        }

        static onAppStateChanged() {
          return { unsubscribe: vi.fn() };
        }
      },
      startRecording: nativeStartRecording,
      stopRecording: nativeStopRecording,
      abortRecording: nativeAbortRecording,
    }));

    vi.doMock('electron', () => ({
      app: {
        getPath: vi.fn(() => '/tmp'),
        on: vi.fn(),
      },
      systemPreferences: {
        getMediaAccessStatus: vi.fn(() => 'granted'),
        askForMediaAccess: vi.fn(async () => true),
      },
    }));

    vi.doMock('fs-extra', () => ({
      default: {
        ensureDirSync,
        removeSync: vi.fn(),
      },
    }));

    vi.doMock('../../src/shared/utils', async () => {
      const actual = await vi.importActual('../../src/shared/utils');
      return {
        ...actual,
        isMacOS: () => false,
        isWindows: () => false,
        resolveExistingPathInBase,
      };
    });

    vi.doMock('../../src/main/shared-storage/storage', () => ({
      globalStateStorage: {
        get: (key: string) => storageState.get(key),
        set: (key: string, value: unknown) => {
          storageState.set(key, value);
          const subject$ = watchSubjects.get(key);
          subject$?.next(value);
        },
        watch: (key: string) => {
          const subject$ =
            watchSubjects.get(key) ??
            new BehaviorSubject(storageState.get(key));
          watchSubjects.set(key, subject$);
          return subject$.asObservable();
        },
      },
    }));

    vi.doMock('../../src/main/windows-manager', () => ({
      getMainWindow,
    }));

    vi.doMock('../../src/main/windows-manager/popup', () => ({
      popupManager: {
        get: () => ({
          showing: false,
          show: vi.fn(async () => undefined),
          hide: vi.fn(async () => undefined),
        }),
      },
    }));

    vi.doMock('lodash-es', () => ({
      debounce: (fn: (...args: unknown[]) => void) => fn,
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  test('slow start exposes starting state before native setup resolves', async () => {
    const startDeferred = createDeferred<{
      id: string;
      filepath: string;
      sampleRate: number;
      channels: number;
      startedAt: number;
    }>();
    nativeStartRecording.mockReturnValue(startDeferred.promise);

    const {
      recordingStatus$,
      setRecordingNativeModuleForTesting,
      startRecording,
    } = await import('../../src/main/recording/feature');
    setRecordingNativeModuleForTesting({
      ShareableContent: class ShareableContent {},
      startRecording: nativeStartRecording,
      stopRecording: nativeStopRecording,
      abortRecording: nativeAbortRecording,
    } as never);

    const startPromise = startRecording();
    expect(recordingStatus$.value).toMatchObject({
      status: 'starting',
    });

    startDeferred.resolve({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      startedAt: 123,
    });

    await startPromise;
    expect(recordingStatus$.value).toMatchObject({
      status: 'recording',
    });
    expect(recordingStatus$.value?.filepath).toContain('0.opus');
  });

  test('slow stop transitions through finalizing and then pending_import', async () => {
    nativeStartRecording.mockResolvedValue({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      startedAt: 123,
    });

    const stopDeferred = createDeferred<{
      id: string;
      filepath: string;
      sampleRate: number;
      channels: number;
      durationMs: number;
      size: number;
      degraded: boolean;
      overflowCount: number;
    }>();
    nativeStopRecording.mockReturnValue(stopDeferred.promise);

    const {
      getRecordingImportQueue,
      recordingStatus$,
      setRecordingNativeModuleForTesting,
      startRecording,
      stopRecording,
    } = await import('../../src/main/recording/feature');
    setRecordingNativeModuleForTesting({
      ShareableContent: class ShareableContent {},
      startRecording: nativeStartRecording,
      stopRecording: nativeStopRecording,
      abortRecording: nativeAbortRecording,
    } as never);

    const started = await startRecording();
    const stopPromise = stopRecording(started!.id);
    expect(recordingStatus$.value).toMatchObject({
      id: started!.id,
      status: 'finalizing',
    });

    stopDeferred.resolve({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      durationMs: 2_000,
      size: 256,
      degraded: true,
      overflowCount: 4,
    });

    await stopPromise;

    expect(recordingStatus$.value).toMatchObject({
      id: started!.id,
      status: 'pending_import',
      degraded: true,
      overflowCount: 4,
    });
    expect(getRecordingImportQueue()).toEqual([
      expect.objectContaining({
        id: started!.id,
        importStatus: 'pending_import',
        filepath: '/tmp/0.opus',
        degraded: true,
        overflowCount: 4,
      }),
    ]);
  });

  test('stop projection does not emit a null status between finalized and pending import', async () => {
    nativeStartRecording.mockResolvedValue({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      startedAt: 123,
    });

    const stopDeferred = createDeferred<{
      id: string;
      filepath: string;
      sampleRate: number;
      channels: number;
      durationMs: number;
      size: number;
      degraded: boolean;
      overflowCount: number;
    }>();
    nativeStopRecording.mockReturnValue(stopDeferred.promise);

    const {
      recordingStatus$,
      setRecordingNativeModuleForTesting,
      startRecording,
      stopRecording,
    } = await import('../../src/main/recording/feature');
    setRecordingNativeModuleForTesting({
      ShareableContent: class ShareableContent {},
      startRecording: nativeStartRecording,
      stopRecording: nativeStopRecording,
      abortRecording: nativeAbortRecording,
    } as never);

    const started = await startRecording();
    const seenStatuses: Array<string | null> = [];
    const subscription = recordingStatus$.subscribe(status => {
      seenStatuses.push(status?.status ?? null);
    });

    const stopPromise = stopRecording(started!.id);
    stopDeferred.resolve({
      id: 'native-1',
      filepath: '/tmp/0.opus',
      sampleRate: 48_000,
      channels: 2,
      durationMs: 2_000,
      size: 256,
      degraded: false,
      overflowCount: 0,
    });

    await stopPromise;
    subscription.unsubscribe();

    expect(seenStatuses).toContain('finalizing');
    expect(seenStatuses).toContain('pending_import');
    expect(seenStatuses).not.toContain(null);
  });

  test('stop failure releases the active slot for the next recording', async () => {
    nativeStartRecording
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
    nativeStopRecording.mockRejectedValue(new Error('native stop failed'));

    const {
      recordingStatus$,
      setRecordingNativeModuleForTesting,
      startRecording,
      stopRecording,
    } = await import('../../src/main/recording/feature');
    setRecordingNativeModuleForTesting({
      ShareableContent: class ShareableContent {},
      startRecording: nativeStartRecording,
      stopRecording: nativeStopRecording,
      abortRecording: nativeAbortRecording,
    } as never);

    const first = await startRecording();
    await stopRecording(first!.id);

    expect(recordingStatus$.value).toMatchObject({
      id: first!.id,
      status: 'finalize_failed',
      errorMessage: 'native stop failed',
    });

    const second = await startRecording();
    expect(second).toMatchObject({
      id: expect.any(Number),
      status: 'recording',
    });
    expect(second!.id).toBeGreaterThan(first!.id);
  });
});
