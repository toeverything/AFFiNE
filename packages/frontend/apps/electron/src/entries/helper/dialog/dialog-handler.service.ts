import path from 'node:path';

import { DocStorage, ValidationResult } from '@affine/native';
import { parseUniversalId } from '@affine/nbstore';
import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { IpcHandle, IpcScope } from '../../../ipc';
import { MainRpcService } from '../main-rpc';
import { NBStoreService } from '../nbstore/nbstore.service';
import { WorkspacePathService } from '../nbstore/workspace-path.service';
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

const extension = 'affine';

function getDefaultDBFileName(name: string, id: string) {
  const fileName = `${name}_${id}.${extension}`;
  // make sure fileName is a valid file name
  return fileName.replace(/[/\\?%*:|"<>]/g, '-');
}

/**
 * Service that handles dialog-related operations
 */
@Injectable()
export class DialogHandlerService {
  context = 'DialogHandlerService';

  constructor(
    private readonly rpcService: MainRpcService,
    private readonly workspacePathService: WorkspacePathService,
    private readonly nbstore: NBStoreService,
    private readonly logger: Logger
  ) {}

  // result will be used in the next call to showOpenDialog
  // if it is being read once, it will be reset to undefined
  fakeDialogResult: FakeDialogResult | undefined = undefined;

  getFakedResult() {
    const result = this.fakeDialogResult;
    this.fakeDialogResult = undefined;
    return result;
  }

  /**
   * Sets a fake dialog result that will be used by subsequent dialog-showing methods.
   * This is primarily used for testing purposes (e.g., with Playwright) to simulate
   * user interaction with file dialogs without actually displaying them.
   * The fake result is consumed after one use.
   * @param result - The fake dialog result to set, or undefined to clear any existing fake result.
   */
  @IpcHandle({ scope: IpcScope.DIALOG })
  setFakeDialogResult(result: FakeDialogResult | undefined) {
    this.fakeDialogResult = result;
    // for convenience, we will fill filePaths with filePath if it is not set
    if (result?.filePaths === undefined && result?.filePath !== undefined) {
      result.filePaths = [result.filePath];
    }
  }

  /**
   * This function is called when the user clicks the "Save" button in the "Save Workspace" dialog.
   *
   * It will just copy the file to the given path
   */
  @IpcHandle({ scope: IpcScope.DIALOG })
  async saveDBFileAs(
    universalId: string,
    name: string
  ): Promise<SaveDBFileResult> {
    try {
      const { peer, type, id } = parseUniversalId(universalId);
      const dbPath = await this.workspacePathService.getSpaceDBPath(
        peer,
        type,
        id
      );

      // connect to the pool and make sure all changes (WAL) are written to db
      const pool = this.nbstore.pool;
      await pool.connect(universalId, dbPath);
      await pool.checkpoint(universalId); // make sure all changes (WAL) are written to db

      const fakedResult = this.getFakedResult();
      if (!dbPath) {
        return {
          error: 'DB_FILE_PATH_INVALID',
        };
      }

      const ret =
        fakedResult ??
        (await this.rpcService.rpc?.showSaveDialog({
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

      if (!ret) {
        return {
          error: 'UNKNOWN_ERROR',
        };
      }

      const filePath = ret.filePath;
      if (ret.canceled || !filePath) {
        return {
          canceled: true,
        };
      }

      await fs.copyFile(dbPath, filePath);
      this.logger.log('saved', filePath, this.context);
      if (!fakedResult) {
        this.rpcService.rpc?.showItemInFolder(filePath).catch(err => {
          this.logger.error(err, this.context);
        });
      }
      return { filePath };
    } catch (err) {
      this.logger.error('saveDBFileAs', err, this.context);
      return {
        error: 'UNKNOWN_ERROR',
      };
    }
  }

  /**
   * Show an open dialog
   */
  @IpcHandle({ scope: IpcScope.DIALOG })
  async loadDBFile(dbFilePath?: string): Promise<LoadDBFileResult> {
    try {
      const provided =
        this.getFakedResult() ??
        (dbFilePath
          ? {
              filePath: dbFilePath,
              filePaths: [dbFilePath],
              canceled: false,
            }
          : undefined);
      const ret =
        provided ??
        (await this.rpcService.rpc?.showOpenDialog({
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

      if (!ret) {
        return {
          error: 'UNKNOWN_ERROR',
        };
      }

      const originalPath = ret.filePaths?.[0];
      if (ret.canceled || !originalPath) {
        this.logger.log('loadDBFile canceled', this.context);
        return { canceled: true };
      }

      // the imported file should not be in app data dir
      if (
        originalPath.startsWith(
          await this.workspacePathService.getWorkspacesBasePath()
        )
      ) {
        this.logger.warn('loadDBFile: db file in app data dir', this.context);
        return { error: 'DB_FILE_PATH_INVALID' };
      }

      const workspaceId = nanoid(10);
      let storage = new DocStorage(originalPath);

      // if imported db is not a valid v2 db, we will treat it as a v1 db
      if (!(await storage.validate())) {
        return await this.cpV1DBFile(originalPath, workspaceId);
      }

      // v2 import logic
      const internalFilePath = await this.workspacePathService.getSpaceDBPath(
        'local',
        'workspace',
        workspaceId
      );
      await fs.ensureDir(path.parse(internalFilePath).dir);
      await fs.copy(originalPath, internalFilePath);
      this.logger.log(
        `loadDBFile, copy: ${originalPath} -> ${internalFilePath}`,
        this.context
      );

      storage = new DocStorage(internalFilePath);
      await storage.setSpaceId(workspaceId);

      return {
        workspaceId,
      };
    } catch (err) {
      this.logger.error('loadDBFile', err, this.context);
      return {
        error: 'UNKNOWN_ERROR',
      };
    }
  }

  @IpcHandle({ scope: IpcScope.DIALOG })
  async selectDBFileLocation(): Promise<SelectDBFileLocationResult> {
    try {
      const ret =
        this.getFakedResult() ??
        (await this.rpcService.rpc?.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Set Workspace Storage Location',
          buttonLabel: 'Select',
          defaultPath: await this.rpcService.rpc?.getPath('documents'),
          message: "Select a location to store the workspace's database file",
        }));

      if (!ret) {
        return {
          error: 'UNKNOWN_ERROR',
        };
      }

      const dir = ret.filePaths?.[0];
      if (ret.canceled || !dir) {
        return {
          canceled: true,
        };
      }
      return { filePath: dir };
    } catch (err) {
      this.logger.error('selectDBFileLocation', err, this.context);
      return {
        error: (err as any).message,
      };
    }
  }

  async cpV1DBFile(
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

    const internalFilePath = await this.workspacePathService.getWorkspaceDBPath(
      'workspace',
      workspaceId
    );

    await fs.ensureDir(await this.workspacePathService.getWorkspacesBasePath());
    await fs.copy(originalPath, internalFilePath);
    this.logger.log(
      `loadDBFile, copy: ${originalPath} -> ${internalFilePath}`,
      this.context
    );

    await this.workspacePathService.storeWorkspaceMeta(workspaceId, {
      id: workspaceId,
      mainDBPath: internalFilePath,
    });

    return {
      workspaceId,
    };
  }
}
