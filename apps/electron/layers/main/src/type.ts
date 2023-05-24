export type MainEventListener = (...args: any[]) => () => void;

export type IsomorphicHandler = (
  e: Electron.IpcMainInvokeEvent,
  ...args: any[]
) => Promise<any>;

export type NamespaceHandlers = {
  [key: string]: IsomorphicHandler;
};

export interface WorkspaceMeta {
  id: string;
  mainDBPath: string;
  secondaryDBPath?: string; // assume there will be only one
}

export type YOrigin = 'self' | 'external' | 'upstream' | 'renderer';
