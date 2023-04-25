import { dialog, shell } from 'electron';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { appContext } from './context';
import { exportDatabase } from './data/export';
import { getWorkspaceDBPath, isValidDBFile } from './data/sqlite';
import { ensureSQLiteDB } from './ensure-db';

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
    return null;
  }
  if (!isValidDBFile(filePath)) {
    // TODO: report invalid db file error?
    return false; // invalid db file
  }
  // symlink the db file to a new workspace id
  const workspaceId = nanoid(10);
  const linkedFilePath = await getWorkspaceDBPath(appContext, workspaceId);

  await fs.symlink(filePath, linkedFilePath);

  return { workspaceId };
}
