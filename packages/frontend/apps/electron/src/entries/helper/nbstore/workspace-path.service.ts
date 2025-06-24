import path from 'node:path';

import { type SpaceType } from '@affine/nbstore';
import { Injectable } from '@nestjs/common';
import fs from 'fs-extra';

import { logger } from '../../main/logger';
import { isWindows } from '../../main/utils';
import { MainRpcService } from '../main-rpc';

@Injectable()
export class WorkspacePathService {
  constructor(private readonly mainRpcService: MainRpcService) {}

  _appDataPath: string | undefined;

  async getAppDataPath() {
    if (this._appDataPath) {
      return this._appDataPath;
    }
    this._appDataPath = await this.mainRpcService.rpc?.getPath('sessionData');
    if (!this._appDataPath) {
      throw new Error('App data path not found');
    }
    return this._appDataPath;
  }

  async getWorkspacesBasePath() {
    const appDataPath = await this.getAppDataPath();
    return path.join(appDataPath, 'workspaces');
  }

  async getWorkspaceBasePathV1(spaceType: SpaceType, workspaceId: string) {
    const appDataPath = await this.getAppDataPath();
    return path.join(
      appDataPath,
      spaceType === 'userspace' ? 'userspaces' : 'workspaces',
      isWindows() ? workspaceId.replace(':', '_') : workspaceId
    );
  }

  async getSpaceBasePath(spaceType: SpaceType) {
    return path.join(
      await this.getAppDataPath(),
      spaceType === 'userspace' ? 'userspaces' : 'workspaces'
    );
  }

  escapeFilename(name: string) {
    // replace all special characters with '_' and replace repeated '_' with a single '_' and remove trailing '_'
    return name
      .replaceAll(/[\\/!@#$%^&*()+~`"':;,?<>|]/g, '_')
      .split('_')
      .filter(Boolean)
      .join('_');
  }

  async getSpaceDBPath(peer: string, spaceType: SpaceType, id: string) {
    const spaceBasePath = await this.getSpaceBasePath(spaceType);
    return path.join(
      spaceBasePath,
      this.escapeFilename(peer),
      id,
      'storage.db'
    );
  }

  async getDeletedWorkspacesBasePath() {
    const appDataPath = await this.getAppDataPath();
    return path.join(appDataPath, 'deleted-workspaces');
  }

  async getWorkspaceDBPath(spaceType: SpaceType, workspaceId: string) {
    const workspaceBasePath = await this.getWorkspaceBasePathV1(
      spaceType,
      workspaceId
    );
    return path.join(workspaceBasePath, 'storage.db');
  }

  async getWorkspaceMetaPath(spaceType: SpaceType, workspaceId: string) {
    const workspaceBasePath = await this.getWorkspaceBasePathV1(
      spaceType,
      workspaceId
    );
    return path.join(workspaceBasePath, 'meta.json');
  }

  /**
   * Get workspace meta, create one if not exists
   * This function will also migrate the workspace if needed
   */
  async getWorkspaceMeta(spaceType: SpaceType, workspaceId: string) {
    const dbPath = await this.getWorkspaceDBPath(spaceType, workspaceId);

    return {
      mainDBPath: dbPath,
      id: workspaceId,
    };
  }

  async storeWorkspaceMeta(
    workspaceId: string,
    meta: Partial<{
      mainDBPath: string;
      id: string;
    }>
  ) {
    try {
      const basePath = await this.getWorkspaceBasePathV1(
        'workspace',
        workspaceId
      );
      await fs.ensureDir(basePath);
      const metaPath = path.join(basePath, 'meta.json');
      const currentMeta = await this.getWorkspaceMeta('workspace', workspaceId);
      const newMeta = {
        ...currentMeta,
        ...meta,
      };
      await fs.writeJSON(metaPath, newMeta);
    } catch (err) {
      logger.error('storeWorkspaceMeta failed', err);
    }
  }
}
