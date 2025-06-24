import path from 'node:path';

import { DocStoragePool } from '@affine/native';
import { parseUniversalId } from '@affine/nbstore';
import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs-extra';

import { IpcHandle, IpcScope } from '../../../ipc';
import { WorkspacePathService } from './workspace-path.service';

@Injectable()
export class NBStoreService {
  constructor(
    private readonly workspacePathService: WorkspacePathService,
    private readonly logger: Logger
  ) {}

  pool = new DocStoragePool();

  @IpcHandle({ scope: IpcScope.NBSTORE })
  connect = async (universalId: string) => {
    this.logger.log('connect', universalId, 'nbstore');
    const { peer, type, id } = parseUniversalId(universalId);
    const dbPath = await this.workspacePathService.getSpaceDBPath(
      peer,
      type,
      id
    );
    await fs.ensureDir(path.dirname(dbPath));
    await this.pool.connect(universalId, dbPath);
    await this.pool.setSpaceId(universalId, id);
  };

  @IpcHandle({ scope: IpcScope.NBSTORE })
  disconnect = this.pool.disconnect.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  pushUpdate = this.pool.pushUpdate.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getDocSnapshot = this.pool.getDocSnapshot.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  setDocSnapshot = this.pool.setDocSnapshot.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getDocUpdates = this.pool.getDocUpdates.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  markUpdatesMerged = this.pool.markUpdatesMerged.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  deleteDoc = this.pool.deleteDoc.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getDocClocks = this.pool.getDocClocks.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getDocClock = this.pool.getDocClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getBlob = this.pool.getBlob.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  setBlob = this.pool.setBlob.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  deleteBlob = this.pool.deleteBlob.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  releaseBlobs = this.pool.releaseBlobs.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  listBlobs = this.pool.listBlobs.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getPeerRemoteClocks = this.pool.getPeerRemoteClocks.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getPeerRemoteClock = this.pool.getPeerRemoteClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  setPeerRemoteClock = this.pool.setPeerRemoteClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getPeerPulledRemoteClocks = this.pool.getPeerPulledRemoteClocks.bind(
    this.pool
  );

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getPeerPulledRemoteClock = this.pool.getPeerPulledRemoteClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  setPeerPulledRemoteClock = this.pool.setPeerPulledRemoteClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getPeerPushedClocks = this.pool.getPeerPushedClocks.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getPeerPushedClock = this.pool.getPeerPushedClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  setPeerPushedClock = this.pool.setPeerPushedClock.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  clearClocks = this.pool.clearClocks.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  setBlobUploadedAt = this.pool.setBlobUploadedAt.bind(this.pool);

  @IpcHandle({ scope: IpcScope.NBSTORE })
  getBlobUploadedAt = this.pool.getBlobUploadedAt.bind(this.pool);
}
