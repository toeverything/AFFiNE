import { dialog, shell } from 'electron';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { logger } from '../../logger';
import { appContext } from './context';
import { ensureSQLiteDB } from './data/ensure-db';
import { exportDatabase } from './data/export';
import { getWorkspaceDBPath, isValidDBFile } from './data/sqlite';

/**
 * This function is called when the user clicks the "Save" button in the "Save Workspace" dialog.
 */
export async function openSaveDBFileDialog(workspaceId: string) {
  const db = await ensureSQLiteDB(workspaceId);
  const ret = await dialog.showSaveDialog({
    properties: ['showOverwriteConfirmation'],
    title: 'Save Workspace',
    showsTagField: false,
    buttonLabel: 'Save',
    defaultPath: `${db.getWorkspaceName()}_${workspaceId}.db`,
    message: 'Save Workspace as a SQLite Database file',
  });
  const filePath = ret.filePath;
  if (ret.canceled || !filePath) {
    return null;
  }

  await exportDatabase(db, filePath);
  shell.showItemInFolder(filePath);
  return filePath;
}

/**
 * This function is called when the user clicks the "Load" button in the "Load Workspace" dialog.
 *
 * It will
 * - symlink the db file to a new workspace id
 * - return the new workspace id
 */
export async function openLoadDBFileDialog() {
  const ret = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Load Workspace',
    buttonLabel: 'Load',
    filters: [
      {
        name: 'SQLite Database',
        extensions: ['db'],
      },
    ],
    message: 'Load Workspace from a SQLite Database file',
  });
  const filePath = ret.filePaths[0];
  if (ret.canceled || !filePath) {
    logger.info('openLoadDBFileDialog canceled');
    return { canceled: true };
  }
  if (!isValidDBFile(filePath)) {
    // TODO: report invalid db file error?
    return { error: 'invalid db file' }; // invalid db file
  }
  // symlink the db file to a new workspace id
  const workspaceId = nanoid(10);
  const linkedFilePath = await getWorkspaceDBPath(appContext, workspaceId);

  await fs.symlink(filePath, linkedFilePath);
  logger.info(`openLoadDBFileDialog: ${filePath} -> ${linkedFilePath}`);

  return { workspaceId };
}

export async function openMoveDBFileDialog(workspaceId: string) {
  const db = await ensureSQLiteDB(workspaceId);

  // get the real file path of db
  const realpath = await fs.realpath(db.path);
  const isLink = realpath !== db.path;

  const ret = await dialog.showSaveDialog({
    properties: ['showOverwriteConfirmation'],
    title: 'Move Workspace Storage',
    showsTagField: false,
    buttonLabel: 'Save',
    defaultPath: realpath,
    message: 'Move Workspace storage file',
  });

  const newFilePath = ret.filePath;
  if (
    ret.canceled ||
    !newFilePath ||
    newFilePath === realpath ||
    db.path === newFilePath
  ) {
    return null;
  }

  if (isLink) {
    // remove the old link to unblock new link
    await fs.unlink(db.path);
  }

  await fs.move(realpath, newFilePath, {
    overwrite: true,
  });

  await fs.symlink(newFilePath, db.path);
  logger.info(`openMoveDBFileDialog: ${realpath} -> ${newFilePath}`);
  db.reconnectDB();
  return newFilePath;
}
