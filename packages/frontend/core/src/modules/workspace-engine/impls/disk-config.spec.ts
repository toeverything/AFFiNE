import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DISK_SYNC_FEATURE_FLAG_KEY,
  DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY,
  getDiskSyncEnabled,
  getDiskSyncFolderPath,
  getDiskSyncRemoteOptions,
  setDiskSyncEnabled,
  setDiskSyncFolderPath,
} from './disk-config';

describe('disk-config', () => {
  const originalBuildConfig = globalThis.BUILD_CONFIG;
  const originalSharedStorage = (globalThis as any).__sharedStorage;
  const state = new Map<string, unknown>();

  beforeEach(() => {
    state.clear();
    (globalThis as any).__sharedStorage = {
      globalState: {
        get<T>(key: string): T | undefined {
          return state.get(key) as T | undefined;
        },
        set<T>(key: string, value: T): void {
          state.set(key, value);
        },
      },
    };
    globalThis.BUILD_CONFIG = {
      ...originalBuildConfig,
      isElectron: true,
    };
  });

  afterEach(() => {
    globalThis.BUILD_CONFIG = originalBuildConfig;
    (globalThis as any).__sharedStorage = originalSharedStorage;
  });

  it('reads and writes feature flag from electron global state', () => {
    expect(getDiskSyncEnabled()).toBe(false);

    setDiskSyncEnabled(true);
    expect(getDiskSyncEnabled()).toBe(true);
    expect(state.get(DISK_SYNC_FEATURE_FLAG_KEY)).toBe(true);
  });

  it('stores folder path per workspace and resolves remote options only when enabled', () => {
    setDiskSyncFolderPath('workspace-a', '/tmp/a');
    expect(getDiskSyncFolderPath('workspace-a')).toBe('/tmp/a');
    expect(state.get(DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY)).toEqual({
      'workspace-a': '/tmp/a',
    });

    expect(getDiskSyncRemoteOptions('workspace-a')).toBeNull();

    setDiskSyncEnabled(true);
    expect(getDiskSyncRemoteOptions('workspace-a')).toEqual({
      syncFolder: '/tmp/a',
    });
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
});
