export interface WorkspaceMeta {
  id: string;
  mainDBPath: string;
  secondaryDBPath?: string; // assume there will be only one
}

export type YOrigin = 'self' | 'external' | 'upstream' | 'renderer';

export type MainEventRegister = (...args: any[]) => () => void;
