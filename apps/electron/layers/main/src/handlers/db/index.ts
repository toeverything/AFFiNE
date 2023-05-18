import fs from 'fs-extra';

import { appContext } from '../../context';
import type { NamespaceHandlers } from '../type';
import { ensureSQLiteDB } from './ensure-db';

export const dbHandlers = {
  getDocAsUpdates: async (_, id: string) => {
    const workspaceDB = await ensureSQLiteDB(id);
    return workspaceDB.getDocAsUpdates();
  },
  applyDocUpdate: async (_, id: string, update: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(id);
    return workspaceDB.applyUpdate(update);
  },
  addBlob: async (_, workspaceId: string, key: string, data: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.addBlob(key, data);
  },
  getBlob: async (_, workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlob(key);
  },
  deleteBlob: async (_, workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.deleteBlob(key);
  },
  getPersistedBlobs: async (_, workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getPersistentBlobKeys();
  },
  getDefaultStorageLocation: async () => {
    return appContext.appDataPath;
  },
  getDBFilePath: async (_, workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return {
      path: workspaceDB.path,
      realPath: await fs.realpath(workspaceDB.path),
    };
  },
} satisfies NamespaceHandlers;
