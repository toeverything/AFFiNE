import { parse } from 'node:path';

import { DocStorage, ValidationResult } from '@affine/native';
import { parseUniversalId } from '@affine/nbstore';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { logger } from '../logger';
import { mainRPC } from '../main-rpc';
import { getDocStoragePool } from '../nbstore';
import { storeWorkspaceMeta } from '../workspace';
import {
  getSpaceDBPath,
  getWorkspaceDBPath,
  getWorkspacesBasePath,
} from '../workspace/meta';

export type ErrorMessage =
  | 'DB_FILE_PATH_INVALID'
  | 'DB_FILE_INVALID'
  | 'UNKNOWN_ERROR';

export interface LoadDBFileResult {
  workspaceId?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

export interface SaveDBFileResult {
  filePath?: string;
  canceled?: boolean;
  error?: ErrorMessage;
}

export interface SelectDBFileLocationResult {
  filePath?: string;
  error?: ErrorMessage;
  canceled?: boolean;
}

// provide a backdoor to set dialog path for testing in playwright
export interface FakeDialogResult {
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
  universalId: string,
  name: string
): Promise<SaveDBFileResult> {
  try {
    const { peer, type, id } = parseUniversalId(universalId);
    const dbPath = await getSpaceDBPath(peer, type, id);

    // connect to the pool and make sure all changes (WAL) are written to db
    const pool = getDocStoragePool();
    await pool.connect(universalId, dbPath);
    await pool.checkpoint(universalId); // make sure all changes (WAL) are written to db

    const fakedResult = getFakedResult();
    if (!dbPath) {
      return {
        error: 'DB_FILE_PATH_INVALID',
      };
    }

    const ret =
      fakedResult ??
      (await mainRPC.showSaveDialog({
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
        defaultPath: getDefaultDBFileName(name, id),
        message: 'Save Workspace as a SQLite Database file',
      }));

    const filePath = ret.filePath;
    if (ret.canceled || !filePath) {
      return {
        canceled: true,
      };
    }

    await fs.copyFile(dbPath, filePath);
    logger.log('saved', filePath);
    if (!fakedResult) {
      mainRPC.showItemInFolder(filePath).catch(err => {
        console.error(err);
      });
    }
    return { filePath };
  } catch (err) {
    logger.error('saveDBFileAs', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

export async function selectDBFileLocation(): Promise<SelectDBFileLocationResult> {
  try {
    const ret =
      getFakedResult() ??
      (await mainRPC.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Set Workspace Storage Location',
        buttonLabel: 'Select',
        defaultPath: await mainRPC.getPath('documents'),
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

/**
 * This function is called when the user clicks the "Load" button in the "Load Workspace" dialog.
 *
 * It will
 * - symlink the source db file to a new workspace id to app-data
 * - return the new workspace id
 *
 * eg, it will create a new folder in app-data:
 * <app-data>/<app-name>/<workspaces|userspaces>/<peer>/<workspace-id>/storage.db
 *
 * On the renderer side, after the UI got a new workspace id, it will
 * update the local workspace id list and then connect to it.
 *
 */
export async function loadDBFile(
  dbFilePath?: string
): Promise<LoadDBFileResult> {
  try {
    const provided =
      getFakedResult() ??
      (dbFilePath
        ? {
            filePath: dbFilePath,
            filePaths: [dbFilePath],
            canceled: false,
          }
        : undefined);
    const ret =
      provided ??
      (await mainRPC.showOpenDialog({
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
    const originalPath = ret.filePaths?.[0];
    if (ret.canceled || !originalPath) {
      logger.info('loadDBFile canceled');
      return { canceled: true };
    }

    // the imported file should not be in app data dir
    if (originalPath.startsWith(await getWorkspacesBasePath())) {
      logger.warn('loadDBFile: db file in app data dir');
      return { error: 'DB_FILE_PATH_INVALID' };
    }

    const workspaceId = nanoid(10);
    let storage = new DocStorage(originalPath);

    // if imported db is not a valid v2 db, we will treat it as a v1 db
    if (!(await storage.validate())) {
      return await cpV1DBFile(originalPath, workspaceId);
    }

    // v2 import logic
    const internalFilePath = await getSpaceDBPath(
      'local',
      'workspace',
      workspaceId
    );
    await fs.ensureDir(parse(internalFilePath).dir);
    await fs.copy(originalPath, internalFilePath);
    logger.info(`loadDBFile, copy: ${originalPath} -> ${internalFilePath}`);

    storage = new DocStorage(internalFilePath);
    await storage.setSpaceId(workspaceId);

    return {
      workspaceId,
    };
  } catch (err) {
    logger.error('loadDBFile', err);
    return {
      error: 'UNKNOWN_ERROR',
    };
  }
}

async function cpV1DBFile(
  originalPath: string,
  workspaceId: string
): Promise<LoadDBFileResult> {
  const { SqliteConnection } = await import('@affine/native');

  const validationResult = await SqliteConnection.validate(originalPath);

  if (validationResult !== ValidationResult.Valid) {
    return { error: 'DB_FILE_INVALID' }; // invalid db file
  }

  // checkout to make sure wal is flushed
  const connection = new SqliteConnection(originalPath);
  await connection.connect();
  await connection.checkpoint();
  await connection.close();

  const internalFilePath = await getWorkspaceDBPath('workspace', workspaceId);

  await fs.ensureDir(await getWorkspacesBasePath());
  await fs.copy(originalPath, internalFilePath);
  logger.info(`loadDBFile, copy: ${originalPath} -> ${internalFilePath}`);

  await storeWorkspaceMeta(workspaceId, {
    id: workspaceId,
    mainDBPath: internalFilePath,
  });

  return {
    workspaceId,
  };
}
