import path from 'node:path';

import fs from 'fs-extra';

import { type AppContext } from '../context';
import { ensureSQLiteDB } from '../db/ensure-db';
import { logger } from '../logger';
import type { WorkspaceMeta } from '../type';
import { workspaceSubjects } from './subjects';

export async function listWorkspaces(
  context: AppContext
): Promise<[workspaceId: string, meta: WorkspaceMeta][]> {
  const basePath = getWorkspacesBasePath(context);
  try {
    await fs.ensureDir(basePath);
    const dirs = await fs.readdir(basePath, {
      withFileTypes: true,
    });
    const metaList = (
      await Promise.all(
        dirs.map(async dir => {
          // ? shall we put all meta in a single file instead of one file per workspace?
          return await getWorkspaceMeta(context, dir.name);
        })
      )
    ).filter((w): w is WorkspaceMeta => !!w);
    return metaList.map(meta => [meta.id, meta]);
  } catch (error) {
    logger.error('listWorkspaces', error);
    return [];
  }
}

export async function deleteWorkspace(context: AppContext, id: string) {
  const basePath = getWorkspaceBasePath(context, id);
  const movedPath = path.join(
    context.appDataPath,
    'delete-workspaces',
    `${id}`
  );
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

export function getWorkspacesBasePath(context: AppContext) {
  return path.join(context.appDataPath, 'workspaces');
}

export function getWorkspaceBasePath(context: AppContext, workspaceId: string) {
  return path.join(context.appDataPath, 'workspaces', workspaceId);
}

export function getWorkspaceDBPath(context: AppContext, workspaceId: string) {
  const basePath = getWorkspaceBasePath(context, workspaceId);
  return path.join(basePath, 'storage.db');
}

export function getWorkspaceMetaPath(context: AppContext, workspaceId: string) {
  const basePath = getWorkspaceBasePath(context, workspaceId);
  return path.join(basePath, 'meta.json');
}

/**
 * Get workspace meta, create one if not exists
 * This function will also migrate the workspace if needed
 */
export async function getWorkspaceMeta(
  context: AppContext,
  workspaceId: string
): Promise<WorkspaceMeta> {
  try {
    const basePath = getWorkspaceBasePath(context, workspaceId);
    const metaPath = getWorkspaceMetaPath(context, workspaceId);
    if (!(await fs.exists(metaPath))) {
      // since not meta is found, we will migrate symlinked db file if needed
      await fs.ensureDir(basePath);
      const dbPath = getWorkspaceDBPath(context, workspaceId);

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
  context: AppContext,
  workspaceId: string,
  meta: Partial<WorkspaceMeta>
) {
  try {
    const basePath = getWorkspaceBasePath(context, workspaceId);
    await fs.ensureDir(basePath);
    const metaPath = path.join(basePath, 'meta.json');
    const currentMeta = await getWorkspaceMeta(context, workspaceId);
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
