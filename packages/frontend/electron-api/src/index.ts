import type Buffer from 'buffer';

type Buffer = Buffer.Buffer;

export interface WorkspaceMeta {
  id: string;
  mainDBPath: string;
  secondaryDBPath?: string; // assume there will be only one
}

export type PrimitiveHandlers = (...args: any[]) => Promise<any>;

export type DBHandlers = {
  getDocAsUpdates: (
    workspaceId: string,
    subdocId?: string
  ) => Promise<Uint8Array | false>;
  applyDocUpdate: (
    id: string,
    update: Uint8Array,
    subdocId?: string
  ) => Promise<void>;
  addBlob: (
    workspaceId: string,
    key: string,
    data: Uint8Array
  ) => Promise<void>;
  getBlob: (workspaceId: string, key: string) => Promise<Buffer | null>;
  deleteBlob: (workspaceId: string, key: string) => Promise<void>;
  getBlobKeys: (workspaceId: string) => Promise<string[]>;
  getDefaultStorageLocation: () => Promise<string>;
};

export type DebugHandlers = {
  revealLogFile: () => Promise<string>;
  logFilePath: () => Promise<string>;
};

export type ErrorMessage =
  | 'DB_FILE_ALREADY_LOADED'
  | 'DB_FILE_PATH_INVALID'
  | 'DB_FILE_INVALID'
  | 'DB_FILE_MIGRATION_FAILED'
  | 'FILE_ALREADY_EXISTS'
  | 'UNKNOWN_ERROR';

export interface LoadDBFileResult {
  workspaceId?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

export interface SaveDBFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

export interface SelectDBFileLocationResult {
  filePath?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

export interface MoveDBFileResult {
  filePath?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

// provide a backdoor to set dialog path for testing in playwright
export interface FakeDialogResult {
  canceled?: boolean;
  filePath?: string;
  filePaths?: string[];
}

export type DialogHandlers = {
  revealDBFile: (workspaceId: string) => Promise<void>;
  loadDBFile: () => Promise<LoadDBFileResult>;
  saveDBFileAs: (workspaceId: string) => Promise<SaveDBFileResult>;
  moveDBFile: (
    workspaceId: string,
    dbFileLocation?: string
  ) => Promise<MoveDBFileResult>;
  selectDBFileLocation: () => Promise<SelectDBFileLocationResult>;
  setFakeDialogResult: (result: any) => Promise<void>;
};

export type UIHandlers = {
  handleThemeChange: (theme: 'system' | 'light' | 'dark') => Promise<any>;
  handleSidebarVisibilityChange: (visible: boolean) => Promise<any>;
  handleMinimizeApp: () => Promise<any>;
  handleMaximizeApp: () => Promise<any>;
  handleCloseApp: () => Promise<any>;
  getGoogleOauthCode: () => Promise<any>;
  getChallengeResponse: (resource: string) => Promise<string>;
};

export type ClipboardHandlers = {
  copyAsImageFromString: (dataURL: string) => Promise<void>;
};

export type ExportHandlers = {
  savePDFFileAs: (title: string) => Promise<any>;
};

export interface UpdateMeta {
  version: string;
  allowAutoUpdate: boolean;
}

export type UpdaterConfig = {
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
};

export type UpdaterHandlers = {
  currentVersion: () => Promise<string>;
  quitAndInstall: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  getConfig: () => Promise<UpdaterConfig>;
  setConfig: (newConfig: Partial<UpdaterConfig>) => Promise<void>;
  checkForUpdates: () => Promise<{ version: string } | null>;
};

export type WorkspaceHandlers = {
  list: () => Promise<[workspaceId: string, meta: WorkspaceMeta][]>;
  delete: (id: string) => Promise<void>;
  getMeta: (id: string) => Promise<WorkspaceMeta>;
  clone: (id: string, newId: string) => Promise<void>;
};

export interface UpdaterEvents {
  onUpdateAvailable: (fn: (versionMeta: UpdateMeta) => void) => () => void;
  onUpdateReady: (fn: (versionMeta: UpdateMeta) => void) => () => void;
  onDownloadProgress: (fn: (progress: number) => void) => () => void;
}

export interface ApplicationMenuEvents {
  onNewPageAction: (fn: () => void) => () => void;
}

export interface DBEvents {
  onExternalUpdate: (
    fn: (update: {
      workspaceId: string;
      update: Uint8Array;
      docId?: string;
    }) => void
  ) => () => void;
}

export interface WorkspaceEvents {
  onMetaChange: (
    fn: (workspaceId: string, meta: WorkspaceMeta) => void
  ) => () => void;
}

export interface UIEvents {
  onMaximized: (fn: (maximized: boolean) => void) => () => void;
}

export interface EventMap {
  updater: UpdaterEvents;
  applicationMenu: ApplicationMenuEvents;
  db: DBEvents;
  ui: UIEvents;
  workspace: WorkspaceEvents;
}
