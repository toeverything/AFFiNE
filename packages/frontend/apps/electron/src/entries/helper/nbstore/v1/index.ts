import type { SpaceType } from '@affine/nbstore';
import { Injectable } from '@nestjs/common';

import { IpcHandle, IpcScope } from '../../../../ipc';
import { LegacyDBManager } from './db-manager.service';

@Injectable()
export class LegacyDBHandlers {
  constructor(private readonly dbManager: LegacyDBManager) {}

  @IpcHandle({ scope: IpcScope.DB })
  async getDocAsUpdates(
    spaceType: SpaceType,
    workspaceId: string,
    subdocId: string
  ) {
    const spaceDB = await this.dbManager.ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      // means empty update in yjs
      return new Uint8Array([0, 0]);
    }

    return spaceDB.getDocAsUpdates(subdocId);
  }

  @IpcHandle({ scope: IpcScope.DB })
  async getDocTimestamps(spaceType: SpaceType, workspaceId: string) {
    const spaceDB = await this.dbManager.ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      return [];
    }

    return spaceDB.getDocTimestamps();
  }

  @IpcHandle({ scope: IpcScope.DB })
  async getBlob(spaceType: SpaceType, workspaceId: string, key: string) {
    const spaceDB = await this.dbManager.ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      return null;
    }

    return spaceDB.getBlob(key);
  }

  @IpcHandle({ scope: IpcScope.DB })
  async getBlobKeys(spaceType: SpaceType, workspaceId: string) {
    const spaceDB = await this.dbManager.ensureSQLiteDB(spaceType, workspaceId);

    if (!spaceDB) {
      return [];
    }

    return spaceDB.getBlobKeys();
  }
}
