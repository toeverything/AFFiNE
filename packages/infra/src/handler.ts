export interface WorkspaceMeta {
  id: string;
  mainDBPath: string;
  secondaryDBPath?: string; // assume there will be only one
}

export type PrimitiveHandlers = (...args: any[]) => Promise<any>;
type TODO = any;

export abstract class HandlerManager<
  Namespace extends string,
  Handlers extends Record<string, PrimitiveHandlers>
> {
  abstract readonly app: TODO;
  abstract readonly namespace: Namespace;
  abstract readonly handlers: Handlers;
}

type DBHandlers = {
  getDocAsUpdates: (
    workspaceId: string,
    subdocId?: string
  ) => Promise<Uint8Array>;
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
  getBlob: (workspaceId: string, key: string) => Promise<any>;
  deleteBlob: (workspaceId: string, key: string) => Promise<void>;
  getBlobKeys: (workspaceId: string) => Promise<any>;
  getDefaultStorageLocation: () => Promise<string>;
};

export abstract class DBHandlerManager extends HandlerManager<
  'db',
  DBHandlers
> {}

type DebugHandlers = {
  revealLogFile: () => Promise<string>;
  logFilePath: () => Promise<string>;
};

export abstract class DebugHandlerManager extends HandlerManager<
  'debug',
  DebugHandlers
> {}

type DialogHandlers = {
  revealDBFile: (workspaceId: string) => Promise<any>;
  loadDBFile: () => Promise<any>;
  saveDBFileAs: (workspaceId: string) => Promise<any>;
  moveDBFile: (workspaceId: string, dbFileLocation?: string) => Promise<any>;
  selectDBFileLocation: () => Promise<any>;
  setFakeDialogResult: (result: any) => Promise<any>;
};

export abstract class DialogHandlerManager extends HandlerManager<
  'dialog',
  DialogHandlers
> {}

type UIHandlers = {
  handleThemeChange: (theme: 'system' | 'light' | 'dark') => Promise<any>;
  handleSidebarVisibilityChange: (visible: boolean) => Promise<any>;
  handleMinimizeApp: () => Promise<any>;
  handleMaximizeApp: () => Promise<any>;
  handleCloseApp: () => Promise<any>;
  getGoogleOauthCode: () => Promise<any>;
};

export abstract class UIHandlerManager extends HandlerManager<
  'ui',
  UIHandlers
> {}

type ExportHandlers = {
  savePDFFileAs: (title: string) => Promise<any>;
};

export abstract class ExportHandlerManager extends HandlerManager<
  'export',
  ExportHandlers
> {}

type UpdaterHandlers = {
  currentVersion: () => Promise<any>;
  quitAndInstall: () => Promise<any>;
  checkForUpdatesAndNotify: () => Promise<any>;
};

export abstract class UpdaterHandlerManager extends HandlerManager<
  'updater',
  UpdaterHandlers
> {}

type WorkspaceHandlers = {
  list: () => Promise<[workspaceId: string, meta: WorkspaceMeta][]>;
  delete: (id: string) => Promise<void>;
  getMeta: (id: string) => Promise<WorkspaceMeta>;
};

export abstract class WorkspaceHandlerManager extends HandlerManager<
  'workspace',
  WorkspaceHandlers
> {}

export type UnwrapManagerHandlerToServerSide<
  ElectronEvent extends {
    frameId: number;
    processId: number;
  },
  Manager extends HandlerManager<string, Record<string, PrimitiveHandlers>>
> = {
  [K in keyof Manager['handlers']]: Manager['handlers'][K] extends (
    ...args: infer Args
  ) => Promise<infer R>
    ? (event: ElectronEvent, ...args: Args) => Promise<R>
    : never;
};

export type UnwrapManagerHandlerToClientSide<
  Manager extends HandlerManager<string, Record<string, PrimitiveHandlers>>
> = {
  [K in keyof Manager['handlers']]: Manager['handlers'][K] extends (
    ...args: infer Args
  ) => Promise<infer R>
    ? (...args: Args) => Promise<R>
    : never;
};
