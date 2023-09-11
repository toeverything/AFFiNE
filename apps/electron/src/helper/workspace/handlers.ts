import path from 'node:path';

import fs from 'fs-extra';

import { ensureSQLiteDB } from '../db/ensure-db';
import { logger } from '../logger';
import type { WorkspaceMeta } from '../type';
import {
  getDeletedWorkspacesBasePath,
  getWorkspaceBasePath,
  getWorkspaceMeta,
  getWorkspacesBasePath,
} from './meta';
import { workspaceSubjects } from './subjects';

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
