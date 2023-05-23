import path from 'node:path';

import fs from 'fs-extra';

import { type AppContext } from '../context';
import { logger } from '../logger';
import type { WorkspaceMeta } from '../type';

export async function listWorkspaces(
  context: AppContext
): Promise<[workspaceId: string, meta: WorkspaceMeta][]> {
  const basePath = path.join(context.appDataPath, 'workspaces');
  try {
    await fs.ensureDir(basePath);
    const dirs = await fs.readdir(basePath, {
      withFileTypes: true,
    });
    const metaList = (
      await Promise.all(
        dirs.map(async dir => {
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
  const basePath = path.join(context.appDataPath, 'workspaces', id);
  const movedPath = path.join(
    context.appDataPath,
    'delete-workspaces',
    `${id}`
  );
  try {
    return await fs.move(basePath, movedPath, {
      overwrite: true,
    });
  } catch (error) {
    logger.error('deleteWorkspace', error);
  }
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

export async function getWorkspaceMeta(
  context: AppContext,
  workspaceId: string
): Promise<WorkspaceMeta> {
  try {
    const basePath = getWorkspaceBasePath(context, workspaceId);
    const metaPath = getWorkspaceMetaPath(context, workspaceId);
    if (!(await fs.exists(metaPath))) {
      await fs.ensureDir(basePath);
      // create one if not exists
      const meta = {
        id: workspaceId,
        mainDBPath: getWorkspaceDBPath(context, workspaceId),
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
    await fs.writeJSON(metaPath, {
      ...currentMeta,
      ...meta,
    });
  } catch (err) {
    logger.error('storeWorkspaceMeta failed', err);
  }
}
