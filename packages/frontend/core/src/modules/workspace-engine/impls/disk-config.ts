const DISK_SYNC_FLAG_STORAGE_KEY = 'affine-flag:enable_disk_sync';
const DISK_SYNC_FOLDERS_STORAGE_KEY = 'workspace-engine:disk-sync-folders:v1';

type GlobalStateStorageLike = {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
};

function getElectronGlobalStateStorage(): GlobalStateStorageLike | null {
  if (!BUILD_CONFIG.isElectron) {
    return null;
  }
  const sharedStorage = (
    globalThis as {
      __sharedStorage?: { globalState?: GlobalStateStorageLike };
    }
  ).__sharedStorage;
  return sharedStorage?.globalState ?? null;
}

function normalizeFolderMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const validEntries = Object.entries(value).filter(
    ([workspaceId, folder]) =>
      typeof workspaceId === 'string' &&
      workspaceId.length > 0 &&
      typeof folder === 'string' &&
      folder.length > 0
  );

  return Object.fromEntries(validEntries);
}

function readFolderMap(): Record<string, string> {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return {};
  }
  return normalizeFolderMap(
    storage.get<Record<string, string>>(DISK_SYNC_FOLDERS_STORAGE_KEY)
  );
}

export function getDiskSyncEnabled(): boolean {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return false;
  }
  return storage.get<boolean>(DISK_SYNC_FLAG_STORAGE_KEY) ?? false;
}

export function setDiskSyncEnabled(enabled: boolean): void {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return;
  }
  storage.set(DISK_SYNC_FLAG_STORAGE_KEY, enabled);
}

export function getDiskSyncFolderPath(workspaceId: string): string | null {
  return readFolderMap()[workspaceId] ?? null;
}

export function setDiskSyncFolderPath(
  workspaceId: string,
  folder: string | null
): void {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return;
  }

  const folders = readFolderMap();
  if (!folder) {
    delete folders[workspaceId];
  } else {
    folders[workspaceId] = folder;
  }
  storage.set(DISK_SYNC_FOLDERS_STORAGE_KEY, folders);
}

export function getDiskSyncRemoteOptions(workspaceId: string): {
  syncFolder: string;
} | null {
  if (!getDiskSyncEnabled()) {
    return null;
  }
  const folder = getDiskSyncFolderPath(workspaceId);
  if (!folder) {
    return null;
  }
  return { syncFolder: folder };
}

export const DISK_SYNC_FEATURE_FLAG_KEY = DISK_SYNC_FLAG_STORAGE_KEY;
export const DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY = DISK_SYNC_FOLDERS_STORAGE_KEY;
