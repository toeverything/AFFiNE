import { parse, resolve } from 'node:path';

import { DocStorage, ValidationResult } from '@affine/native';
import { parseUniversalId } from '@affine/nbstore';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { isPathInsideBase } from '../../shared/utils';
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

const extension = 'affine';

function getDefaultDBFileName(name: string, id: string) {
  const fileName = `${name}_${id}.${extension}`;
  // make sure fileName is a valid file name
  return fileName.replace(/[/\\?%*:|"<>]/g, '-');
}

async function resolveExistingPath(path: string) {
  if (!(await fs.pathExists(path))) {
    return null;
  }
  try {
    return await fs.realpath(path);
  } catch {
    return resolve(path);
  }
}

async function isSameFilePath(sourcePath: string, targetPath: string) {
  if (resolve(sourcePath) === resolve(targetPath)) {
    return true;
  }

  const [resolvedSourcePath, resolvedTargetPath] = await Promise.all([
    resolveExistingPath(sourcePath),
    resolveExistingPath(targetPath),
  ]);

  return !!resolvedSourcePath && resolvedSourcePath === resolvedTargetPath;
}

async function normalizeImportDBPath(selectedPath: string) {
  if (!(await fs.pathExists(selectedPath))) {
    return null;
  }

  const [normalizedPath, workspacesBasePath] = await Promise.all([
    resolveExistingPath(selectedPath),
    resolveExistingPath(await getWorkspacesBasePath()),
  ]);
  const resolvedSelectedPath = normalizedPath ?? resolve(selectedPath);
  const resolvedWorkspacesBasePath =
    workspacesBasePath ?? resolve(await getWorkspacesBasePath());

  if (isPathInsideBase(resolvedWorkspacesBasePath, resolvedSelectedPath)) {
    logger.warn('loadDBFile: db file in app data dir');
    return null;
  }

  return resolvedSelectedPath;
}

/**
 * This function is called when the user clicks the "Save" button in the "Save Workspace" dialog.
 *
 * It will export a compacted database file to the given path
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

    if (!dbPath) {
      return {
        error: 'DB_FILE_PATH_INVALID',
      };
    }

    const ret = await mainRPC.showSaveDialog({
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
    });

    const filePath = ret.filePath;
    if (ret.canceled || !filePath) {
      return { canceled: true };
    }

    if (await isSameFilePath(dbPath, filePath)) {
      return { error: 'DB_FILE_PATH_INVALID' };
    }

    const tempFilePath = `${filePath}.${nanoid(6)}.tmp`;
    if (await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
    }

    try {
      await pool.vacuumInto(universalId, tempFilePath);
      await fs.move(tempFilePath, filePath, { overwrite: true });
    } finally {
      if (await fs.pathExists(tempFilePath)) {
        await fs.remove(tempFilePath);
      }
    }
    logger.log('saved', filePath);
    mainRPC.showItemInFolder(filePath).catch(err => {
      console.error(err);
    });
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
    const ret = await mainRPC.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Set Workspace Storage Location',
      buttonLabel: 'Select',
      defaultPath: await mainRPC.getPath('documents'),
      message: "Select a location to store the workspace's database file",
    });
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
export async function loadDBFile(): Promise<LoadDBFileResult> {
  try {
    const ret = await mainRPC.showOpenDialog({
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
    });
    const selectedPath = ret.filePaths?.[0];
    if (ret.canceled || !selectedPath) {
      logger.info('loadDBFile canceled');
      return { canceled: true };
    }

    const originalPath = await normalizeImportDBPath(selectedPath);
    if (!originalPath) {
      return { error: 'DB_FILE_PATH_INVALID' };
    }

    const workspaceId = nanoid(10);
    let storage = new DocStorage(originalPath);

    // if imported db is not a valid v2 db, we will treat it as a v1 db
    if (!(await storage.validate())) {
      return await cpV1DBFile(originalPath, workspaceId);
    }

    if (!(await storage.validateImportSchema())) {
      return { error: 'DB_FILE_INVALID' };
    }

    // v2 import logic
    const internalFilePath = await getSpaceDBPath(
      'local',
      'workspace',
      workspaceId
    );
    await fs.ensureDir(parse(internalFilePath).dir);
    await storage.vacuumInto(internalFilePath);
    logger.info(`loadDBFile, vacuum: ${originalPath} -> ${internalFilePath}`);

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

  const connection = new SqliteConnection(originalPath);
  try {
    if (!(await connection.validateImportSchema())) {
      return { error: 'DB_FILE_INVALID' };
    }

    const internalFilePath = await getWorkspaceDBPath('workspace', workspaceId);

    await fs.ensureDir(parse(internalFilePath).dir);
    await connection.vacuumInto(internalFilePath);
    logger.info(`loadDBFile, vacuum: ${originalPath} -> ${internalFilePath}`);

    await storeWorkspaceMeta(workspaceId, {
      id: workspaceId,
      mainDBPath: internalFilePath,
    });

    return {
      workspaceId,
    };
  } finally {
    await connection.close();
  }
}
