import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
        watchSubjects.get(key)?.next(value);
      },
      watch: (key: string) => {
        const watchSubject$ =
          watchSubjects.get(key) ?? new BehaviorSubject(storageState.get(key));
        watchSubjects.set(key, watchSubject$);
        return watchSubject$.asObservable();
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

async function loadRecordingFeature() {
  const feature = await import('../../src/main/recording/feature');
  feature.setRecordingNativeModuleForTesting({
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
  } as never);
  return feature;
}

afterEach(() => {
  vi.clearAllTimers();
});

describe('recording feature', () => {
  test('slow start exposes starting state before native setup resolves', async () => {
    const startDeferred = createDeferred<{
      id: string;
      filepath: string;
      sampleRate: number;
      channels: number;
      startedAt: number;
    }>();
    nativeStartRecording.mockReturnValue(startDeferred.promise);

    const { getCurrentRecordingStatus, startRecording } =
      await loadRecordingFeature();

    const startPromise = startRecording();
    expect(getCurrentRecordingStatus()).toMatchObject({
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
    expect(getCurrentRecordingStatus()).toMatchObject({
      status: 'recording',
    });
    expect(getCurrentRecordingStatus()?.filepath).toContain('0.opus');
  });

  test('stop handoff moves from finalizing to pending_import without clearing the popup state', async () => {
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
      getCurrentRecordingStatus,
      getRecordingImportQueue,
      recordingStatus$,
      startRecording,
      stopRecording,
    } = await loadRecordingFeature();

    const started = await startRecording();
    const seenStatuses: Array<string | null> = [];
    const subscription = recordingStatus$.subscribe(status => {
      seenStatuses.push(status?.status ?? null);
    });

    const stopPromise = stopRecording(started!.id);
    expect(getCurrentRecordingStatus()).toMatchObject({
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
    subscription.unsubscribe();

    expect(getCurrentRecordingStatus()).toMatchObject({
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
    expect(seenStatuses).toContain('finalizing');
    expect(seenStatuses).toContain('pending_import');
    expect(seenStatuses).not.toContain(null);
  });

  test('system-audio start does not reuse a pending app-scoped prompt', async () => {
    nativeStartRecording.mockResolvedValue({
      id: 'native-1',
      filepath: '/tmp/system.opus',
      sampleRate: 48_000,
      channels: 2,
      startedAt: 123,
    });

    const { newRecording, startRecording } = await loadRecordingFeature();
    newRecording({
      processGroupId: 100,
      name: 'Zoom',
      bundleIdentifier: 'us.zoom.xos',
      icon: undefined,
      isRunning: true,
      apps: [
        {
          info: {} as never,
          isRunning: true,
          processId: 42,
          processGroupId: 100,
          bundleIdentifier: 'us.zoom.xos',
          name: 'Zoom',
        },
      ],
    });

    await startRecording();

    expect(nativeStartRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        appProcessId: undefined,
      })
    );
  });

  test('disableRecordingFeature clears the active session so a new recording can start', async () => {
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

    const feature = await loadRecordingFeature();

    const first = await feature.startRecording();
    expect(feature.getCurrentRecordingStatus()).toMatchObject({
      id: first!.id,
      status: 'recording',
    });

    await feature.disableRecordingFeature();
    expect(feature.getCurrentRecordingStatus()).toBeNull();
    expect(nativeAbortRecording).toHaveBeenCalledWith('native-1');

    const second = await feature.startRecording();
    expect(second).toMatchObject({
      id: expect.any(Number),
      status: 'recording',
    });
    expect(second!.id).toBeGreaterThan(first!.id);
  });
});
