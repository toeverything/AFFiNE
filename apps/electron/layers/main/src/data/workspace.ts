import path from 'node:path';

import fs from 'fs-extra';

import type { AppContext } from '../context';

export async function listWorkspaces(context: AppContext) {
  const basePath = path.join(context.appDataPath, 'workspaces');
  return fs.readdir(basePath);
}

export async function deleteWorkspace(context: AppContext, id: string) {
  const basePath = path.join(context.appDataPath, 'workspaces', id);
  const movedPath = path.join(
    context.appDataPath,
    'delete-workspaces',
    `${id}`
  );
  return fs.move(basePath, movedPath);
}
