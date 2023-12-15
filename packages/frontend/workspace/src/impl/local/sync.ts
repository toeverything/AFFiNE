import { createIndexedDBStorage } from './sync-indexeddb';
import { createSQLiteStorage } from './sync-sqlite';

export const createLocalStorage = (workspaceId: string) =>
  environment.isDesktop
    ? createSQLiteStorage(workspaceId)
    : createIndexedDBStorage(workspaceId);
