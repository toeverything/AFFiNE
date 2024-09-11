import { mainRPC } from '../main-rpc';
import type { MainEventRegister } from '../type';
import { ensureSQLiteDB } from './ensure-db';
import type { SpaceType } from './types';

export * from './ensure-db';

export const dbHandlers = {
  getDocAsUpdates: async (
    spaceType: SpaceType,
    workspaceId: string,
    subdocId: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.getDocAsUpdates(subdocId);
  },
  applyDocUpdate: async (
    spaceType: SpaceType,
    workspaceId: string,
    update: Uint8Array,
    subdocId: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.addUpdateToSQLite(update, subdocId);
  },
  deleteDoc: async (
    spaceType: SpaceType,
    workspaceId: string,
    subdocId: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.deleteUpdate(subdocId);
  },
  addBlob: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string,
    data: Uint8Array
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.addBlob(key, data);
  },
  getBlob: async (spaceType: SpaceType, workspaceId: string, key: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.getBlob(key);
  },
  deleteBlob: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.deleteBlob(key);
  },
  getBlobKeys: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.getBlobKeys();
  },
  getDefaultStorageLocation: async () => {
    return await mainRPC.getPath('sessionData');
  },
  getServerClock: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.serverClock.get(key);
  },
  setServerClock: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string,
    data: Uint8Array
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.serverClock.set(key, data);
  },
  getServerClockKeys: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.serverClock.keys();
  },
  clearServerClock: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.serverClock.clear();
  },
  delServerClock: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.serverClock.del(key);
  },
  getSyncMetadata: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.syncMetadata.get(key);
  },
  setSyncMetadata: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string,
    data: Uint8Array
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.syncMetadata.set(key, data);
  },
  getSyncMetadataKeys: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.syncMetadata.keys();
  },
  clearSyncMetadata: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.syncMetadata.clear();
  },
  delSyncMetadata: async (
    spaceType: SpaceType,
    workspaceId: string,
    key: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);
    return spaceDB.adapter.syncMetadata.del(key);
  },
};

export const dbEvents = {} satisfies Record<string, MainEventRegister>;
