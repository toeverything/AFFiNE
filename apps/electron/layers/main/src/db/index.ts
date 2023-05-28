import { appContext } from '../context';
import type { MainEventListener, NamespaceHandlers } from '../type';
import { ensureSQLiteDB } from './ensure-db';
import { dbSubjects } from './subjects';

export * from './ensure-db';
export * from './subjects';

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
  getBlobKeys: async (_, workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlobKeys();
  },
  getDefaultStorageLocation: async () => {
    return appContext.appDataPath;
  },
} satisfies NamespaceHandlers;

export const dbEvents = {
  onExternalUpdate: (
    fn: (update: { workspaceId: string; update: Uint8Array }) => void
  ) => {
    const sub = dbSubjects.externalUpdate.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventListener>;
