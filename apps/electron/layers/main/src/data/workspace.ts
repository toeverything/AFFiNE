import path from 'node:path';

import fs from 'fs-extra';

import type { AppContext } from '../context';
import { logger } from '../logger';

export async function listWorkspaces(context: AppContext) {
  const basePath = path.join(context.appDataPath, 'workspaces');
  try {
    await fs.ensureDir(basePath);
    return await fs
      .readdir(basePath, {
        withFileTypes: true,
      })
      .then(dirs => dirs.filter(dir => dir.isDirectory()).map(dir => dir.name));
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
