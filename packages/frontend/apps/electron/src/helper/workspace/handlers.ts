import path from 'node:path';

import { DocStorage } from '@affine/native';
import {
  parseUniversalId,
  universalId as generateUniversalId,
} from '@affine/nbstore';
import fs from 'fs-extra';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { logger } from '../logger';
import { getDocStoragePool } from '../nbstore';
import { ensureSQLiteDisconnected } from '../nbstore/v1/ensure-db';
import { WorkspaceSQLiteDB } from '../nbstore/v1/workspace-db-adapter';
import type { WorkspaceMeta } from '../type';
import {
  getDeletedWorkspacesBasePath,
  getSpaceDBPath,
  getWorkspaceBasePathV1,
  getWorkspaceMeta,
} from './meta';

async function deleteWorkspaceV1(workspaceId: string) {
  try {
    await ensureSQLiteDisconnected('workspace', workspaceId);
    const basePath = await getWorkspaceBasePathV1('workspace', workspaceId);
    await fs.rmdir(basePath, { recursive: true });
  } catch (error) {
    logger.error('deleteWorkspaceV1', error);
  }
}

/**
 * Permanently delete the workspace data
 */
export async function deleteWorkspace(universalId: string) {
  const { peer, type, id } = parseUniversalId(universalId);
  await deleteWorkspaceV1(id);

  const dbPath = await getSpaceDBPath(peer, type, id);
  try {
    await getDocStoragePool().disconnect(universalId);
    await fs.rmdir(path.dirname(dbPath), { recursive: true });
  } catch (e) {
    logger.error('deleteWorkspace', e);
  }
}

/**
 * Move the workspace folder to `deleted-workspaces`
 * At the same time, permanently delete the v1 workspace folder if it's id exists in nbstore,
 * because trashing always happens after full sync from v1 to nbstore.
 */
export async function trashWorkspace(universalId: string) {
  const { peer, type, id } = parseUniversalId(universalId);
  await deleteWorkspaceV1(id);

  const dbPath = await getSpaceDBPath(peer, type, id);
  const basePath = await getDeletedWorkspacesBasePath();
  const movedPath = path.join(basePath, `${id}`);
  try {
    const storage = new DocStorage(dbPath);
    if (await storage.validate()) {
      const pool = getDocStoragePool();
      await pool.checkpoint(universalId);
      await pool.disconnect(universalId);
    }
    await fs.ensureDir(movedPath);
    // todo(@pengx17): it seems the db file is still being used at the point
    // on windows so that it cannot be moved. we will fallback to copy the dir instead.
    await fs.copy(path.dirname(dbPath), movedPath, {
      overwrite: true,
    });
    await fs.rmdir(path.dirname(dbPath), { recursive: true });
  } catch (error) {
    logger.error('trashWorkspace', error);
  }
}

export async function storeWorkspaceMeta(
  workspaceId: string,
  meta: Partial<WorkspaceMeta>
) {
  try {
    const basePath = await getWorkspaceBasePathV1('workspace', workspaceId);
    await fs.ensureDir(basePath);
    const metaPath = path.join(basePath, 'meta.json');
    const currentMeta = await getWorkspaceMeta('workspace', workspaceId);
    const newMeta = {
      ...currentMeta,
      ...meta,
    };
    await fs.writeJSON(metaPath, newMeta);
  } catch (err) {
    logger.error('storeWorkspaceMeta failed', err);
  }
}

type WorkspaceDocMeta = {
  id: string;
  name: string;
  avatar: Uint8Array | null;
  fileSize: number;
  updatedAt: Date;
  createdAt: Date;
  docCount: number;
  dbPath: string;
};

async function getWorkspaceDocMetaV1(
  workspaceId: string,
  dbPath: string
): Promise<WorkspaceDocMeta | null> {
  try {
    await using db = new WorkspaceSQLiteDB(dbPath, workspaceId);
    await db.init();
    await db.checkpoint();
    const meta = await db.getWorkspaceMeta();
    const dbFileSize = await fs.stat(dbPath);
    return {
      id: workspaceId,
      name: meta.name,
      avatar: await db.getBlob(meta.avatar),
      fileSize: dbFileSize.size,
      updatedAt: dbFileSize.mtime,
      createdAt: dbFileSize.birthtime,
      docCount: meta.pages.length,
      dbPath,
    };
  } catch {
    // ignore
  }
  return null;
}

async function getWorkspaceDocMeta(
  workspaceId: string,
  dbPath: string
): Promise<WorkspaceDocMeta | null> {
  const pool = getDocStoragePool();
  const universalId = generateUniversalId({
    peer: 'deleted-local',
    type: 'workspace',
    id: workspaceId,
  });
  try {
    await pool.connect(universalId, dbPath);
    await pool.checkpoint(universalId);
    const snapshot = await pool.getDocSnapshot(universalId, workspaceId);
    const pendingUpdates = await pool.getDocUpdates(universalId, workspaceId);
    if (snapshot) {
      const updates = snapshot.bin;
      const ydoc = new YDoc();
      applyUpdate(ydoc, updates);
      pendingUpdates.forEach(update => {
        applyUpdate(ydoc, update.bin);
      });
      const meta = ydoc.getMap('meta').toJSON();
      const dbFileStat = await fs.stat(dbPath);
      const blob = meta.avatar
        ? await pool.getBlob(universalId, meta.avatar)
        : null;
      return {
        id: workspaceId,
        name: meta.name,
        avatar: blob ? blob.data : null,
        fileSize: dbFileStat.size,
        updatedAt: dbFileStat.mtime,
        createdAt: dbFileStat.birthtime,
        docCount: meta.pages.length,
        dbPath,
      };
    }
  } catch {
    // try using v1
    return await getWorkspaceDocMetaV1(workspaceId, dbPath);
  } finally {
    await pool.disconnect(universalId);
  }
  return null;
}

export async function getDeletedWorkspaces() {
  const basePath = await getDeletedWorkspacesBasePath();
  const directories = await fs.readdir(basePath);
  const workspaceEntries = await Promise.all(
    directories.map(async dir => {
      const stats = await fs.stat(path.join(basePath, dir));
      if (!stats.isDirectory()) {
        return null;
      }
      const dbfileStats = await fs.stat(path.join(basePath, dir, 'storage.db'));
      return {
        id: dir,
        mtime: new Date(dbfileStats.mtime),
      };
    })
  );

  const workspaceIds = workspaceEntries
    .filter(v => v !== null)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .map(entry => entry.id);

  const items: WorkspaceDocMeta[] = [];

  // todo(@pengx17): add cursor based pagination
  for (const id of workspaceIds) {
    const meta = await getWorkspaceDocMeta(
      id,
      path.join(basePath, id, 'storage.db')
    );
    if (meta) {
      items.push(meta);
    } else {
      logger.warn('getDeletedWorkspaces', `No meta found for ${id}`);
    }
  }

  return {
    items: items,
  };
}

export async function deleteBackupWorkspace(id: string) {
  const basePath = await getDeletedWorkspacesBasePath();
  const workspacePath = path.join(basePath, id);
  await fs.rmdir(workspacePath, { recursive: true });
  logger.info(
    'deleteBackupWorkspace',
    `Deleted backup workspace: ${workspacePath}`
  );
}
