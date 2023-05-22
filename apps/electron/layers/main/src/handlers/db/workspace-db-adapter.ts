import path from 'node:path';

import fs from 'fs-extra';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import type { AppContext } from '../../context';
import { dbSubjects } from '../../events/db';
import { logger } from '../../logger';
import { BaseSQLiteAdapter } from './base-db-adapter';

type Origin = 'self' | 'external' | 'renderer';

export class WorkspaceSQLiteDB extends BaseSQLiteAdapter {
  yDoc = new Y.Doc();
  firstConnect = false;
  destroyed = false;

  update$ = new Subject<void>();

  constructor(public path: string, public workspaceId: string) {
    super(path);
    this.connect();
  }

  // release resources
  destroy = () => {
    this.db?.close();
    this.yDoc.destroy();
  };

  getWorkspaceName = () => {
    return this.yDoc.getMap('space:meta').get('name') as string;
  };

  connect = () => {
    const db = super.connect();

    if (!this.firstConnect) {
      this.yDoc.on('update', (update: Uint8Array, origin: Origin) => {
        if (origin !== 'self') {
          this.addUpdateToSQLite(update);
        }
        if (origin === 'external') {
          logger.debug('external update', this.workspaceId);
          dbSubjects.dbFileUpdate.next({
            workspaceId: this.workspaceId,
            update,
          });
        }
      });
    }

    Y.transact(this.yDoc, () => {
      const updates = this.getUpdates();
      updates.forEach(update => {
        // give SQLITE_ORIGIN to skip self update
        Y.applyUpdate(this.yDoc, update.data, 'self');
      });
    });

    if (this.firstConnect) {
      logger.info('db reconnected', this.workspaceId);
    } else {
      logger.info('db connected', this.workspaceId);
    }

    this.firstConnect = true;
    this.update$.next();

    return db;
  };

  getDocAsUpdates = () => {
    return Y.encodeStateAsUpdate(this.yDoc);
  };

  // non-blocking and use yDoc to validate the update
  // after that, the update is added to the db
  applyUpdate = (data: Uint8Array, origin: Origin = 'renderer') => {
    Y.applyUpdate(this.yDoc, data, origin);

    // todo: trim the updates when the number of records is too large
    // 1. store the current ydoc state in the db
    // 2. then delete the old updates
    // yjs-idb will always trim the db for the first time after DB is loaded
    logger.debug('applyUpdate', this.workspaceId);
  };

  addBlob = (key: string, value: Uint8Array) => {
    const res = super.addBlob(key, value);
    this.update$.next();
    return res;
  };

  deleteBlob = (key: string) => {
    super.deleteBlob(key);
    this.update$.next();
  };

  addUpdateToSQLite = (data: Uint8Array) => {
    super.addUpdateToSQLite(data);
    this.update$.next();
  };
}

export async function getWorkspaceDBPath(
  context: AppContext,
  workspaceId: string
) {
  const basePath = path.join(context.appDataPath, 'workspaces', workspaceId);
  await fs.ensureDir(basePath);
  return path.join(basePath, 'storage.db');
}

export async function openWorkspaceDatabase(
  context: AppContext,
  workspaceId: string
) {
  const dbPath = await getWorkspaceDBPath(context, workspaceId);
  return new WorkspaceSQLiteDB(dbPath, workspaceId);
}
