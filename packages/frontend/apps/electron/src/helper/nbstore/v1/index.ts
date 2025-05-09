import type { SpaceType } from '@affine/nbstore';

import type { MainEventRegister } from '../../type';
import { ensureSQLiteDB } from './ensure-db';

export * from './ensure-db';

export const dbHandlers = {
  getDocAsUpdates: async (
    spaceType: SpaceType,
    workspaceId: string,
    subdocId: string
  ) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      // means empty update in yjs
      return new Uint8Array([0, 0]);
    }

    return spaceDB.getDocAsUpdates(subdocId);
  },
  getDocTimestamps: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      return [];
    }

    return spaceDB.getDocTimestamps();
  },
  getBlob: async (spaceType: SpaceType, workspaceId: string, key: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      return null;
    }

    return spaceDB.getBlob(key);
  },
  getBlobKeys: async (spaceType: SpaceType, workspaceId: string) => {
    const spaceDB = await ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      return [];
    }

    return spaceDB.getBlobKeys();
  },
};

export const dbEvents = {} satisfies Record<string, MainEventRegister>;
