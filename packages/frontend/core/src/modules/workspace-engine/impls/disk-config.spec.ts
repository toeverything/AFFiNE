import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DISK_SYNC_FEATURE_FLAG_KEY,
  DISK_SYNC_FOLDER_GLOBAL_STATE_KEY_PREFIX,
  DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY,
  DISK_SYNC_SOURCE_FILE_GLOBAL_STATE_KEY_PREFIX,
  getDiskSyncEnabled,
  getDiskSyncFolderPath,
  getDiskSyncRemoteOptions,
  getDiskSyncSourceFilePath,
  setDiskSyncEnabled,
  setDiskSyncFolderPath,
  setDiskSyncSourceFilePath,
  watchDiskSyncFolderPath,
} from './disk-config';

describe('disk-config', () => {
  const originalBuildConfig = globalThis.BUILD_CONFIG;
  const originalSharedStorage = (globalThis as any).__sharedStorage;
  const state = new Map<string, unknown>();
  let watchedKey: string | null;
  let watchCallback: (() => void) | null;

  beforeEach(() => {
    state.clear();
    watchedKey = null;
    watchCallback = null;
    (globalThis as any).__sharedStorage = {
      globalState: {
        get<T>(key: string): T | undefined {
          return state.get(key) as T | undefined;
        },
        set<T>(key: string, value: T): void {
          state.set(key, value);
        },
        watch<T>(key: string, callback: (value: T | undefined) => void) {
          watchedKey = key;
          watchCallback = () => callback(state.get(key) as T | undefined);
          return () => {};
        },
      },
    };
    globalThis.BUILD_CONFIG = {
      ...originalBuildConfig,
      isElectron: true,
      appBuildType: 'canary',
    };
  });

  afterEach(() => {
    globalThis.BUILD_CONFIG = originalBuildConfig;
    (globalThis as any).__sharedStorage = originalSharedStorage;
  });

  it('reads and writes feature flag from electron global state', () => {
    expect(getDiskSyncEnabled()).toBe(false);

    void setDiskSyncEnabled(true);
    expect(getDiskSyncEnabled()).toBe(true);
    expect(state.get(DISK_SYNC_FEATURE_FLAG_KEY)).toBe(true);
  });

  it('exposes the persistence promise from electron global state writes', () => {
    const persisted = Promise.resolve();
    (globalThis as any).__sharedStorage.globalState.set = <T>(
      key: string,
      value: T
    ) => {
      state.set(key, value);
      return persisted;
    };

    expect(setDiskSyncFolderPath('workspace-a', '/tmp/a')).toBe(persisted);
    expect(setDiskSyncEnabled(true)).toBe(persisted);
  });

  it('uses the rejecting persistence path for source-file selection', async () => {
    const persistenceError = new Error('IPC write failed');
    (globalThis as any).__sharedStorage.globalState.setOrThrow = () =>
      Promise.reject(persistenceError);

    await expect(
      setDiskSyncSourceFilePath('workspace-a', '/tmp/a/source.md')
    ).rejects.toBe(persistenceError);
  });

  it('watches the workspace-specific folder key', () => {
    const observed: Array<string | null> = [];
    watchDiskSyncFolderPath('workspace-a', folder => observed.push(folder));

    expect(watchedKey).toBe(
      `${DISK_SYNC_FOLDER_GLOBAL_STATE_KEY_PREFIX}workspace-a`
    );
    state.set(watchedKey!, '/tmp/updated');
    watchCallback?.();
    expect(observed).toEqual(['/tmp/updated']);
  });

  it('stores folder path per workspace and resolves remote options only when enabled', () => {
    void setDiskSyncFolderPath('workspace-a', '/tmp/a');
    void setDiskSyncSourceFilePath('workspace-a', '/tmp/a/A.md');
    expect(getDiskSyncFolderPath('workspace-a')).toBe('/tmp/a');
    expect(getDiskSyncSourceFilePath('workspace-a')).toBe('/tmp/a/A.md');
    expect(
      state.get(`${DISK_SYNC_FOLDER_GLOBAL_STATE_KEY_PREFIX}workspace-a`)
    ).toBe('/tmp/a');
    expect(
      state.get(`${DISK_SYNC_SOURCE_FILE_GLOBAL_STATE_KEY_PREFIX}workspace-a`)
    ).toBe('/tmp/a/A.md');

    expect(getDiskSyncRemoteOptions('workspace-a')).toBeNull();

    void setDiskSyncEnabled(true);
    expect(getDiskSyncRemoteOptions('workspace-a')).toEqual({
      syncFolder: '/tmp/a',
      sourceFile: '/tmp/a/A.md',
    });
  });

  it('keeps folder sync behavior when no source file is configured', () => {
    void setDiskSyncFolderPath('workspace-a', '/tmp/a');
    void setDiskSyncEnabled(true);

    expect(getDiskSyncRemoteOptions('workspace-a')).toEqual({
      syncFolder: '/tmp/a',
    });
  });

  it('persists workspace folders under independent keys', () => {
    void setDiskSyncFolderPath('workspace-a', '/tmp/a');
    void setDiskSyncFolderPath('workspace-b', '/tmp/b');

    expect([...state.values()]).toContain('/tmp/a');
    expect([...state.values()]).toContain('/tmp/b');
    expect(getDiskSyncFolderPath('workspace-a')).toBe('/tmp/a');
    expect(getDiskSyncFolderPath('workspace-b')).toBe('/tmp/b');
  });

  it('reads legacy folder maps when no workspace key exists', () => {
    state.set(DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY, {
      'workspace-legacy': '/tmp/legacy',
    });

    expect(getDiskSyncFolderPath('workspace-legacy')).toBe('/tmp/legacy');
  });

  it('ignores config when not running in electron', () => {
    globalThis.BUILD_CONFIG = {
      ...globalThis.BUILD_CONFIG,
      isElectron: false,
    };
    state.set(DISK_SYNC_FEATURE_FLAG_KEY, true);
    state.set(DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY, {
      'workspace-b': '/tmp/b',
    });

    expect(getDiskSyncEnabled()).toBe(false);
    expect(getDiskSyncFolderPath('workspace-b')).toBeNull();
    expect(getDiskSyncRemoteOptions('workspace-b')).toBeNull();
  });

  it('ignores persisted disk sync config outside canary builds', () => {
    globalThis.BUILD_CONFIG = {
      ...globalThis.BUILD_CONFIG,
      appBuildType: 'stable',
    };
    state.set(DISK_SYNC_FEATURE_FLAG_KEY, true);
    state.set(DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY, {
      'workspace-stable': '/tmp/stable',
    });

    expect(getDiskSyncEnabled()).toBe(false);
    expect(getDiskSyncRemoteOptions('workspace-stable')).toBeNull();
  });
});
