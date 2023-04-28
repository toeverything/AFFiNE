import path from 'node:path';

import { dialog, shell } from 'electron';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { appContext } from './context';
import { ensureSQLiteDB } from './data/ensure-db';
import { getWorkspaceDBPath, isValidDBFile } from './data/sqlite';
import { logger } from './logger';

// NOTE:
// we are using native dialogs because HTML dialogs do not give full file paths

export async function revealDBFile(workspaceId: string) {
  const workspaceDB = await ensureSQLiteDB(workspaceId);
  shell.showItemInFolder(workspaceDB.path);
}

/**
 * This function is called when the user clicks the "Save" button in the "Save Workspace" dialog.
 *
 * It will just copy the file to the given path
 */
export async function saveDBFileAs(workspaceId: string) {
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
  if (ret.canceled || !filePath || filePath === db.path) {
    return null;
  }

  await fs.copyFile(db.path, filePath);
  logger.log('saved', filePath);
  shell.showItemInFolder(filePath);
  return filePath;
}

/**
 * This function is called when the user clicks the "Load" button in the "Load Workspace" dialog.
 *
 * It will
 * - symlink the source db file to a new workspace id to app-data
 * - return the new workspace id
 *
 * eg, it will create a new folder in app-data:
 * <app-data>/<app-name>/workspaces/<workspace-id>/storage.db
 *
 * On the renderer side, after the UI got a new workspace id, it will
 * update the local workspace id list and then connect to it.
 *
 */
export async function loadDBFile() {
  const ret = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Load Workspace',
    buttonLabel: 'Load',
    filters: [
      {
        name: 'SQLite Database',
        // do we want to support other file format?
        extensions: ['db'],
      },
    ],
    message: 'Load Workspace from a SQLite Database file',
  });
  const filePath = ret.filePaths?.[0];
  if (ret.canceled || !filePath) {
    logger.info('loadDBFile canceled');
    return { canceled: true };
  }

  // the imported file should not be in app data dir
  if (filePath.startsWith(appContext.appDataPath)) {
    logger.warn('loadDBFile: db file in app data dir');
    return { error: 'db file path not valid' };
  }

  if (!isValidDBFile(filePath)) {
    // TODO: report invalid db file error?
    return { error: 'invalid db file' }; // invalid db file
  }

  // symlink the db file to a new workspace id
  const workspaceId = nanoid(10);
  const linkedFilePath = await getWorkspaceDBPath(appContext, workspaceId);

  await fs.ensureDir(path.join(appContext.appDataPath, 'workspaces'));

  await fs.symlink(filePath, linkedFilePath);
  logger.info(`loadDBFile, symlink: ${filePath} -> ${linkedFilePath}`);

  return { workspaceId };
}

/**
 * This function is called when the user clicks the "Move" button in the "Move Workspace Storage" setting.
 *
 * It will
 * - move the source db file to a new location
 * - symlink the new location to the old db file
 * - return the new file path
 */
export async function moveDBFile(workspaceId: string) {
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
  // skips if
  // - user canceled the dialog
  // - user selected the same file
  // - user selected the same file in the link file in app data dir
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

  await fs.ensureSymlink(newFilePath, db.path);
  logger.info(`openMoveDBFileDialog symlink: ${realpath} -> ${newFilePath}`);
  db.reconnectDB();
  return newFilePath;
}
