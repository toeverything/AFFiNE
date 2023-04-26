import { dialog, shell } from 'electron';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

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

  return { workspaceId };
}
