import type { TypedEventEmitter } from './core/event-emitter';

export abstract class HandlerManager<
  Namespace extends string,
  Handlers extends Record<string, PrimitiveHandlers>,
> {
  static instance: HandlerManager<string, Record<string, PrimitiveHandlers>>;
  private _app: App<Namespace, Handlers>;
  private _namespace: Namespace;
  private _handlers: Handlers;

  constructor() {
    throw new Error('Method not implemented.');
  }

  private _initialized = false;

  registerHandlers(handlers: Handlers) {
    if (this._initialized) {
      throw new Error('Already initialized');
    }
    this._handlers = handlers;
    for (const [name, handler] of Object.entries(this._handlers)) {
      this._app.handle(`${this._namespace}:${name}`, (async (...args: any[]) =>
        handler(...args)) as any);
    }
    this._initialized = true;
  }

  invokeHandler<K extends keyof Handlers>(
    name: K,
    ...args: Parameters<Handlers[K]>
  ): Promise<ReturnType<Handlers[K]>> {
    return this._handlers[name](...args);
  }

  static getInstance(): HandlerManager<
    string,
    Record<string, PrimitiveHandlers>
  > {
    throw new Error('Method not implemented.');
  }
}

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

export type DebugHandlers = {
  revealLogFile: () => Promise<string>;
  logFilePath: () => Promise<string>;
};

export type DialogHandlers = {
  revealDBFile: (workspaceId: string) => Promise<any>;
  loadDBFile: () => Promise<any>;
  saveDBFileAs: (workspaceId: string) => Promise<any>;
  moveDBFile: (workspaceId: string, dbFileLocation?: string) => Promise<any>;
  selectDBFileLocation: () => Promise<any>;
  setFakeDialogResult: (result: any) => Promise<any>;
};

export type UIHandlers = {
  handleThemeChange: (theme: 'system' | 'light' | 'dark') => Promise<any>;
  handleSidebarVisibilityChange: (visible: boolean) => Promise<any>;
  handleMinimizeApp: () => Promise<any>;
  handleMaximizeApp: () => Promise<any>;
  handleCloseApp: () => Promise<any>;
  getGoogleOauthCode: () => Promise<any>;
};

export type ClipboardHandlers = {
  copyAsImageFromString: (dataURL: string) => Promise<void>;
};

export type ExportHandlers = {
  savePDFFileAs: (title: string) => Promise<any>;
};

export type UpdaterHandlers = {
  currentVersion: () => Promise<any>;
  quitAndInstall: () => Promise<any>;
  checkForUpdatesAndNotify: () => Promise<any>;
};

export type WorkspaceHandlers = {
  list: () => Promise<[workspaceId: string, meta: WorkspaceMeta][]>;
  delete: (id: string) => Promise<void>;
  getMeta: (id: string) => Promise<WorkspaceMeta>;
};

export type EventMap = DBHandlers &
  DebugHandlers &
  DialogHandlers &
  UIHandlers &
  ClipboardHandlers &
  ExportHandlers &
  UpdaterHandlers &
  WorkspaceHandlers;

export type UnwrapManagerHandlerToServerSide<
  ElectronEvent extends {
    frameId: number;
    processId: number;
  },
  Manager extends HandlerManager<string, Record<string, PrimitiveHandlers>>,
> = Manager extends HandlerManager<infer _, infer Handlers>
  ? {
      [K in keyof Handlers]: Handlers[K] extends (
        ...args: infer Args
      ) => Promise<infer R>
        ? (event: ElectronEvent, ...args: Args) => Promise<R>
        : never;
    }
  : never;

export type UnwrapManagerHandlerToClientSide<
  Manager extends HandlerManager<string, Record<string, PrimitiveHandlers>>,
> = Manager extends HandlerManager<infer _, infer Handlers>
  ? {
      [K in keyof Handlers]: Handlers[K] extends (
        ...args: infer Args
      ) => Promise<infer R>
        ? (...args: Args) => Promise<R>
        : never;
    }
  : never;

/**
 * @internal
 */
export type App<
  Namespace extends string,
  Handlers extends Record<string, PrimitiveHandlers>,
> = TypedEventEmitter<{
  [K in keyof Handlers as `${Namespace}:${K & string}`]: Handlers[K];
}>;
