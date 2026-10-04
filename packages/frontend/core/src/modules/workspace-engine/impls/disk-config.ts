const DISK_SYNC_FLAG_STORAGE_KEY = 'affine-flag:enable_disk_sync';
const DISK_SYNC_FOLDERS_STORAGE_KEY = 'workspace-engine:disk-sync-folders:v1';
const DISK_SYNC_FOLDER_STORAGE_KEY_PREFIX =
  'workspace-engine:disk-sync-folder:v2:';
const DISK_SYNC_SOURCE_FILE_STORAGE_KEY_PREFIX =
  'workspace-engine:disk-sync-source-file:v1:';

type GlobalStateStorageLike = {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): Promise<void> | void;
  setOrThrow?<T>(key: string, value: T): Promise<void>;
  watch?<T>(key: string, callback: (value: T | undefined) => void): () => void;
};

function isDiskSyncSupported(): boolean {
  return BUILD_CONFIG.isElectron && BUILD_CONFIG.appBuildType === 'canary';
}

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
  if (!isDiskSyncSupported()) {
    return false;
  }
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return false;
  }
  return storage.get<boolean>(DISK_SYNC_FLAG_STORAGE_KEY) ?? false;
}

export function setDiskSyncEnabled(enabled: boolean): Promise<void> | void {
  if (!isDiskSyncSupported()) {
    return;
  }
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return;
  }
  return storage.set(DISK_SYNC_FLAG_STORAGE_KEY, enabled);
}

export function getDiskSyncFolderPath(workspaceId: string): string | null {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return null;
  }

  const folder = storage.get<unknown>(
    `${DISK_SYNC_FOLDER_STORAGE_KEY_PREFIX}${workspaceId}`
  );
  if (folder !== undefined) {
    return typeof folder === 'string' && folder.length > 0 ? folder : null;
  }

  return readFolderMap()[workspaceId] ?? null;
}

export function setDiskSyncFolderPath(
  workspaceId: string,
  folder: string | null
): Promise<void> | void {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return;
  }

  return storage.set(
    `${DISK_SYNC_FOLDER_STORAGE_KEY_PREFIX}${workspaceId}`,
    folder || null
  );
}

export function watchDiskSyncFolderPath(
  workspaceId: string,
  callback: (folder: string | null) => void
): () => void {
  const storage = getElectronGlobalStateStorage();
  if (!storage?.watch) {
    return () => {};
  }
  return storage.watch(
    `${DISK_SYNC_FOLDER_STORAGE_KEY_PREFIX}${workspaceId}`,
    () => callback(getDiskSyncFolderPath(workspaceId))
  );
}

export function getDiskSyncSourceFilePath(workspaceId: string): string | null {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return null;
  }

  const file = storage.get<unknown>(
    `${DISK_SYNC_SOURCE_FILE_STORAGE_KEY_PREFIX}${workspaceId}`
  );
  return typeof file === 'string' && file.length > 0 ? file : null;
}

export function setDiskSyncSourceFilePath(
  workspaceId: string,
  file: string | null
): Promise<void> | void {
  const storage = getElectronGlobalStateStorage();
  if (!storage) {
    return;
  }

  const key = `${DISK_SYNC_SOURCE_FILE_STORAGE_KEY_PREFIX}${workspaceId}`;
  const value = file || null;
  return storage.setOrThrow
    ? storage.setOrThrow(key, value)
    : storage.set(key, value);
}

export function getDiskSyncRemoteOptions(workspaceId: string): {
  syncFolder: string;
  sourceFile?: string;
} | null {
  if (!getDiskSyncEnabled()) {
    return null;
  }
  const folder = getDiskSyncFolderPath(workspaceId);
  if (!folder) {
    return null;
  }
  const sourceFile = getDiskSyncSourceFilePath(workspaceId);
  return sourceFile
    ? { syncFolder: folder, sourceFile }
    : { syncFolder: folder };
}

export const DISK_SYNC_FEATURE_FLAG_KEY = DISK_SYNC_FLAG_STORAGE_KEY;
export const DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY = DISK_SYNC_FOLDERS_STORAGE_KEY;
export const DISK_SYNC_FOLDER_GLOBAL_STATE_KEY_PREFIX =
  DISK_SYNC_FOLDER_STORAGE_KEY_PREFIX;
export const DISK_SYNC_SOURCE_FILE_GLOBAL_STATE_KEY_PREFIX =
  DISK_SYNC_SOURCE_FILE_STORAGE_KEY_PREFIX;
