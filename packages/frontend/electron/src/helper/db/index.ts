import { mainRPC } from '../main-rpc';
import type { MainEventRegister } from '../type';
import { ensureSQLiteDB } from './ensure-db';

export * from './ensure-db';

export const dbHandlers = {
  getDocAsUpdates: async (workspaceId: string, subdocId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getDocAsUpdates(subdocId);
  },
  applyDocUpdate: async (
    workspaceId: string,
    update: Uint8Array,
    subdocId: string
  ) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.addUpdateToSQLite(update, subdocId);
  },
  deleteDoc: async (workspaceId: string, subdocId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.deleteUpdate(subdocId);
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
  getServerClock: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.serverClock.get(key);
  },
  setServerClock: async (
    workspaceId: string,
    key: string,
    data: Uint8Array
  ) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.serverClock.set(key, data);
  },
  getServerClockKeys: async (workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.serverClock.keys();
  },
  clearServerClock: async (workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.serverClock.clear();
  },
  delServerClock: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.serverClock.del(key);
  },
  getSyncMetadata: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.syncMetadata.get(key);
  },
  setSyncMetadata: async (
    workspaceId: string,
    key: string,
    data: Uint8Array
  ) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.syncMetadata.set(key, data);
  },
  getSyncMetadataKeys: async (workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.syncMetadata.keys();
  },
  clearSyncMetadata: async (workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.syncMetadata.clear();
  },
  delSyncMetadata: async (workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.adapter.syncMetadata.del(key);
  },
};

export const dbEvents = {} satisfies Record<string, MainEventRegister>;
