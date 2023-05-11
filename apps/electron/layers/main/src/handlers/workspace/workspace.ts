import path from 'node:path';

import fs from 'fs-extra';

import type { AppContext } from '../../context';
import { logger } from '../../logger';

interface WorkspaceMeta {
  path: string;
  realpath: string;
}

export async function listWorkspaces(
  context: AppContext
): Promise<[workspaceId: string, meta: WorkspaceMeta][]> {
  const basePath = path.join(context.appDataPath, 'workspaces');
  try {
    await fs.ensureDir(basePath);
    const dirs = await fs.readdir(basePath, {
      withFileTypes: true,
    });

    const meta = await Promise.all(
      dirs.map(async dir => {
        const dbFilePath = path.join(basePath, dir.name, 'storage.db');
        if (dir.isDirectory() && (await fs.exists(dbFilePath))) {
          // try read storage.db under it
          const realpath = await fs.realpath(dbFilePath);
          return [dir.name, { path: dbFilePath, realpath }] as [
            string,
            WorkspaceMeta
          ];
        } else {
          return null;
        }
      })
    );

    return meta.filter((w): w is [string, WorkspaceMeta] => !!w);
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
