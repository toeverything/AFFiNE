import path from 'node:path';

import { app } from 'electron';
import { dialog, shell } from 'electron';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { appContext } from '../context';
import { ensureSQLiteDB } from '../db/ensure-db';
import { isValidDBFile } from '../db/helper';
import type { WorkspaceSQLiteDB } from '../db/workspace-db-adapter';
import { logger } from '../logger';
import {
  getWorkspaceDBPath,
  getWorkspaceMeta,
  listWorkspaces,
  storeWorkspaceMeta,
} from '../workspace';

// NOTE:
// we are using native dialogs because HTML dialogs do not give full file paths

export async function revealDBFile(workspaceId: string) {
  const meta = await getWorkspaceMeta(appContext, workspaceId);
  if (!meta) {
    return;
  }
  shell.showItemInFolder(meta.secondaryDBPath ?? meta.mainDBPath);
}

// provide a backdoor to set dialog path for testing in playwright
interface FakeDialogResult {
  canceled?: boolean;
  filePath?: string;
  filePaths?: string[];
}

// result will be used in the next call to showOpenDialog
// if it is being read once, it will be reset to undefined
let fakeDialogResult: FakeDialogResult | undefined = undefined;

function getFakedResult() {
  const result = fakeDialogResult;
  fakeDialogResult = undefined;
  return result;
}

export function setFakeDialogResult(result: FakeDialogResult | undefined) {
  fakeDialogResult = result;
  // for convenience, we will fill filePaths with filePath if it is not set
  if (result?.filePaths === undefined && result?.filePath !== undefined) {
    result.filePaths = [result.filePath];
  }
}

const ErrorMessages = [
  'DB_FILE_ALREADY_LOADED',
  'DB_FILE_PATH_INVALID',
  'DB_FILE_INVALID',
  'FILE_ALREADY_EXISTS',
  'UNKNOWN_ERROR',
] as const;

type ErrorMessage = (typeof ErrorMessages)[number];

interface SaveDBFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

const extension = 'affine';

function getDefaultDBFileName(name: string, id: string) {
  const fileName = `${name}_${id}.${extension}`;
  // make sure fileName is a valid file name
  return fileName.replace(/[/\\?%*:|"<>]/g, '-');
}

/**
 * This function is called when the user clicks the "Save" button in the "Save Workspace" dialog.
 *
 * It will just copy the file to the given path
 */
export async function saveDBFileAs(
  workspaceId: string
): Promise<SaveDBFileResult> {
  try {
    const db = await ensureSQLiteDB(workspaceId);
    const ret =
      getFakedResult() ??
      (await dialog.showSaveDialog({
        properties: ['showOverwriteConfirmation'],
        title: 'Save Workspace',
        showsTagField: false,
        buttonLabel: 'Save',
        filters: [
          {
            extensions: [extension],
            name: '',
          },
        ],
        defaultPath: getDefaultDBFileName(db.getWorkspaceName(), workspaceId),
        message: 'Save Workspace as a SQLite Database file',
      }));
    const filePath = ret.filePath;
    if (ret.canceled || !filePath) {
      return {
        canceled: true,
      };
    }

    await fs.copyFile(db.path, filePath);
    logger.log('saved', filePath);
    shell.showItemInFolder(filePath);
    return { filePath };
  } catch (err) {
    logger.error('saveDBFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

interface SelectDBFileLocationResult {
  filePath?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

export async function selectDBFileLocation(): Promise<SelectDBFileLocationResult> {
  try {
    const ret =
      getFakedResult() ??
      (await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Set Workspace Storage Location',
        buttonLabel: 'Select',
        defaultPath: app.getPath('documents'),
        message: "Select a location to store the workspace's database file",
      }));
    const dir = ret.filePaths?.[0];
    if (ret.canceled || !dir) {
      return {
        canceled: true,
      };
    }
    return { filePath: dir };
  } catch (err) {
    logger.error('selectDBFileLocation', err);
    return {
      error: (err as any).message,
    };
  }
}

interface LoadDBFileResult {
  workspaceId?: string;
  error?: ErrorMessage;
  canceled?: boolean;
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
export async function loadDBFile(): Promise<LoadDBFileResult> {
  try {
    const ret =
      getFakedResult() ??
      (await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Load Workspace',
        buttonLabel: 'Load',
        filters: [
          {
            name: 'SQLite Database',
            // do we want to support other file format?
            extensions: ['db', 'affine'],
          },
        ],
        message: 'Load Workspace from a AFFiNE file',
      }));
    const filePath = ret.filePaths?.[0];
    if (ret.canceled || !filePath) {
      logger.info('loadDBFile canceled');
      return { canceled: true };
    }

    // the imported file should not be in app data dir
    if (filePath.startsWith(path.join(appContext.appDataPath, 'workspaces'))) {
      logger.warn('loadDBFile: db file in app data dir');
      return { error: 'DB_FILE_PATH_INVALID' };
    }

    if (await dbFileAlreadyLoaded(filePath)) {
      logger.warn('loadDBFile: db file already loaded');
      return { error: 'DB_FILE_ALREADY_LOADED' };
    }

    if (!isValidDBFile(filePath)) {
      // TODO: report invalid db file error?
      return { error: 'DB_FILE_INVALID' }; // invalid db file
    }

    // copy the db file to a new workspace id
    const workspaceId = nanoid(10);
    const internalFilePath = getWorkspaceDBPath(appContext, workspaceId);

    await fs.ensureDir(path.join(appContext.appDataPath, 'workspaces'));

    await fs.copy(filePath, internalFilePath);
    logger.info(`loadDBFile, copy: ${filePath} -> ${internalFilePath}`);

    await storeWorkspaceMeta(appContext, workspaceId, {
      id: workspaceId,
      mainDBPath: internalFilePath,
      secondaryDBPath: filePath,
    });

    return { workspaceId };
  } catch (err) {
    logger.error('loadDBFile', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

interface MoveDBFileResult {
  filePath?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

/**
 * This function is called when the user clicks the "Move" button in the "Move Workspace Storage" setting.
 *
 * It will
 * - copy the source db file to a new location
 * - remove the old db external file
 * - update the external db file path in the workspace meta
 * - return the new file path
 */
export async function moveDBFile(
  workspaceId: string,
  dbFileDir?: string
): Promise<MoveDBFileResult> {
  let db: WorkspaceSQLiteDB | null = null;
  try {
    db = await ensureSQLiteDB(workspaceId);

    const meta = await getWorkspaceMeta(appContext, workspaceId);

    const oldDir = meta.secondaryDBPath
      ? path.dirname(meta.secondaryDBPath)
      : null;
    const defaultDir = oldDir ?? app.getPath('documents');

    const newName = getDefaultDBFileName(db.getWorkspaceName(), workspaceId);

    const newDirPath =
      dbFileDir ??
      (
        getFakedResult() ??
        (await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Move Workspace Storage',
          buttonLabel: 'Move',
          defaultPath: defaultDir,
          message: 'Move Workspace storage file',
        }))
      ).filePaths?.[0];

    // skips if
    // - user canceled the dialog
    // - user selected the same dir
    if (!newDirPath || newDirPath === oldDir) {
      return {
        canceled: true,
      };
    }

    const newFilePath = path.join(newDirPath, newName);

    if (await fs.pathExists(newFilePath)) {
      return {
        error: 'FILE_ALREADY_EXISTS',
      };
    }

    logger.info(`[moveDBFile] copy ${meta.mainDBPath} -> ${newFilePath}`);

    await fs.copy(meta.mainDBPath, newFilePath);

    // remove the old db file, but we don't care if it fails
    if (meta.secondaryDBPath) {
      fs.remove(meta.secondaryDBPath);
    }

    // update meta
    await storeWorkspaceMeta(appContext, workspaceId, {
      secondaryDBPath: newFilePath,
    });

    return {
      filePath: newFilePath,
    };
  } catch (err) {
    db?.destroy();
    logger.error('[moveDBFile]', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

async function dbFileAlreadyLoaded(path: string) {
  const meta = await listWorkspaces(appContext);
  const paths = meta.map(m => m[1].secondaryDBPath);
  return paths.includes(path);
}
