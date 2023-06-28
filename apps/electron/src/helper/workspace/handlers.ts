import path from 'node:path';

import fs from 'fs-extra';

import { ensureSQLiteDB } from '../db/ensure-db';
import { logger } from '../logger';
import { mainRPC } from '../main-rpc';
import type { WorkspaceMeta } from '../type';
import { workspaceSubjects } from './subjects';

let _appDataPath = '';

async function getAppDataPath() {
  if (_appDataPath) {
    return _appDataPath;
  }
  _appDataPath = await mainRPC.getPath('sessionData');
  return _appDataPath;
}

export async function listWorkspaces(): Promise<
  [workspaceId: string, meta: WorkspaceMeta][]
> {
  const basePath = await getWorkspacesBasePath();
  try {
    await fs.ensureDir(basePath);
    const dirs = (
      await fs.readdir(basePath, {
        withFileTypes: true,
      })
    ).filter(d => d.isDirectory());
    const metaList = (
      await Promise.all(
        dirs.map(async dir => {
          // ? shall we put all meta in a single file instead of one file per workspace?
          return await getWorkspaceMeta(dir.name);
        })
      )
    ).filter((w): w is WorkspaceMeta => !!w);
    return metaList.map(meta => [meta.id, meta]);
  } catch (error) {
    logger.error('listWorkspaces', error);
    return [];
  }
}

export async function deleteWorkspace(id: string) {
  const basePath = await getWorkspaceBasePath(id);
  const movedPath = path.join(await getDeletedWorkspacesBasePath(), `${id}`);
  try {
    const db = await ensureSQLiteDB(id);
    await db.destroy();
    return await fs.move(basePath, movedPath, {
      overwrite: true,
    });
  } catch (error) {
    logger.error('deleteWorkspace', error);
  }
}

export async function getWorkspacesBasePath() {
  return path.join(await getAppDataPath(), 'workspaces');
}

export async function getWorkspaceBasePath(workspaceId: string) {
  return path.join(await getAppDataPath(), 'workspaces', workspaceId);
}

async function getDeletedWorkspacesBasePath() {
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
    if (!(await fs.exists(metaPath))) {
      // since not meta is found, we will migrate symlinked db file if needed
      await fs.ensureDir(basePath);
      const dbPath = await getWorkspaceDBPath(workspaceId);

      // todo: remove this after migration (in stable version)
      const realDBPath = (await fs.exists(dbPath))
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

export async function storeWorkspaceMeta(
  workspaceId: string,
  meta: Partial<WorkspaceMeta>
) {
  try {
    const basePath = await getWorkspaceBasePath(workspaceId);
    await fs.ensureDir(basePath);
    const metaPath = path.join(basePath, 'meta.json');
    const currentMeta = await getWorkspaceMeta(workspaceId);
    const newMeta = {
      ...currentMeta,
      ...meta,
    };
    await fs.writeJSON(metaPath, newMeta);
    workspaceSubjects.meta.next({
      workspaceId,
      meta: newMeta,
    });
  } catch (err) {
    logger.error('storeWorkspaceMeta failed', err);
  }
}
