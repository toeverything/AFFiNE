import path from 'node:path';

import fs from 'fs-extra';

import type { AppContext } from '../context';
import { logger } from '../logger';

export async function listWorkspaces(context: AppContext) {
  const basePath = path.join(context.appDataPath, 'workspaces');
  try {
    return fs.readdir(basePath);
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
    return fs.move(basePath, movedPath, {
      overwrite: true,
    });
  } catch (error) {
    logger.error('deleteWorkspace', error);
  }
}
