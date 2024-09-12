import path from 'node:path';

import fs from 'fs-extra';

import type { SpaceType } from '../db/types';
import { logger } from '../logger';
import { mainRPC } from '../main-rpc';
import type { WorkspaceMeta } from '../type';

let _appDataPath = '';

export async function getAppDataPath() {
  if (_appDataPath) {
    return _appDataPath;
  }
  _appDataPath = await mainRPC.getPath('sessionData');
  return _appDataPath;
}

export async function getWorkspacesBasePath() {
  return path.join(await getAppDataPath(), 'workspaces');
}

export async function getWorkspaceBasePath(
  spaceType: SpaceType,
  workspaceId: string
) {
  return path.join(
    await getAppDataPath(),
    spaceType === 'userspace' ? 'userspaces' : 'workspaces',
    workspaceId
  );
}

export async function getDeletedWorkspacesBasePath() {
  return path.join(await getAppDataPath(), 'deleted-workspaces');
}

export async function getWorkspaceDBPath(
  spaceType: SpaceType,
  workspaceId: string
) {
  return path.join(
    await getWorkspaceBasePath(spaceType, workspaceId),
    'storage.db'
  );
}

export async function getWorkspaceMetaPath(
  spaceType: SpaceType,
  workspaceId: string
) {
  return path.join(
    await getWorkspaceBasePath(spaceType, workspaceId),
    'meta.json'
  );
}

/**
 * Get workspace meta, create one if not exists
 * This function will also migrate the workspace if needed
 */
export async function getWorkspaceMeta(
  spaceType: SpaceType,
  workspaceId: string
): Promise<WorkspaceMeta> {
  try {
    const basePath = await getWorkspaceBasePath(spaceType, workspaceId);
    const metaPath = await getWorkspaceMetaPath(spaceType, workspaceId);
    if (
      !(await fs
        .access(metaPath)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.ensureDir(basePath);
      const dbPath = await getWorkspaceDBPath(spaceType, workspaceId);
      // create one if not exists
      const meta = {
        id: workspaceId,
        mainDBPath: dbPath,
        type: spaceType,
      };
      await fs.writeJSON(metaPath, meta);
      return meta;
    } else {
      const meta = await fs.readJSON(metaPath);
      return meta;
    }
  } catch (err) {
    logger.error('getWorkspaceMeta failed', err);
    throw err;
  }
}
