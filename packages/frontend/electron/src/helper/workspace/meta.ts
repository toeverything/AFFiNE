import path from 'node:path';

import fs from 'fs-extra';

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

export async function getWorkspaceBasePath(workspaceId: string) {
  return path.join(await getAppDataPath(), 'workspaces', workspaceId);
}

export async function getDeletedWorkspacesBasePath() {
  return path.join(await getAppDataPath(), 'deleted-workspaces');
}

export async function getWorkspaceDBPath(workspaceId: string) {
  return path.join(await getWorkspaceBasePath(workspaceId), 'storage.db');
}

export async function getWorkspaceMetaPath(workspaceId: string) {
  return path.join(await getWorkspaceBasePath(workspaceId), 'meta.json');
}

/**
 * Get workspace meta, create one if not exists
 * This function will also migrate the workspace if needed
 */
export async function getWorkspaceMeta(
  workspaceId: string
): Promise<WorkspaceMeta> {
  try {
    const basePath = await getWorkspaceBasePath(workspaceId);
    const metaPath = await getWorkspaceMetaPath(workspaceId);
    if (
      !(await fs
        .access(metaPath)
        .then(() => true)
        .catch(() => false))
    ) {
      // since not meta is found, we will migrate symlinked db file if needed
      await fs.ensureDir(basePath);
      const dbPath = await getWorkspaceDBPath(workspaceId);

      // todo: remove this after migration (in stable version)
      const realDBPath = (await fs
        .access(dbPath)
        .then(() => true)
        .catch(() => false))
        ? await fs.realpath(dbPath)
        : dbPath;
      const isLink = realDBPath !== dbPath;
      if (isLink) {
        await fs.copy(realDBPath, dbPath);
      }
      // create one if not exists
      const meta = {
        id: workspaceId,
        mainDBPath: dbPath,
        secondaryDBPath: isLink ? realDBPath : undefined,
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
