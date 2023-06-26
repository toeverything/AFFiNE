import { mainRPC } from '../main-rpc';
import type { MainEventRegister } from '../type';
import { ensureSQLiteDB } from './ensure-db';
import { dbSubjects } from './subjects';

export * from './ensure-db';
export * from './subjects';

export const dbHandlers = {
  getDocAsUpdates: async (workspaceId: string, subdocId?: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getDocAsUpdates(subdocId);
  },
  applyDocUpdate: async (
    workspaceId: string,
    update: Uint8Array,
    subdocId?: string
  ) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.applyUpdate(update, 'renderer', subdocId);
  },
  addBlob: async (workspaceId: string, key: string, data: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.addBlob(key, data);
  },
  getBlob: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlob(key);
  },
  deleteBlob: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.deleteBlob(key);
  },
  getBlobKeys: async (workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlobKeys();
  },
  getDefaultStorageLocation: async () => {
    return await mainRPC.getPath('sessionData');
  },
};

export const dbEvents = {
  onExternalUpdate: (
    fn: (update: {
      workspaceId: string;
      update: Uint8Array;
      docId?: string;
    }) => void
  ) => {
    const sub = dbSubjects.externalUpdate.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
