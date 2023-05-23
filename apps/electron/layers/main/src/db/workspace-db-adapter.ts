import { Subject } from 'rxjs';
import * as Y from 'yjs';

import type { AppContext } from '../context';
import { logger } from '../logger';
import { getWorkspaceMeta } from '../workspace';
import { BaseSQLiteAdapter } from './base-db-adapter';
import { dbSubjects } from './subject';

type Origin = 'self' | 'external' | 'renderer';

export class WorkspaceSQLiteDB extends BaseSQLiteAdapter {
  yDoc = new Y.Doc();
  firstConnect = false;
  destroyed = false;

  update$ = new Subject<void>();

  constructor(public override path: string, public workspaceId: string) {
    super(path);
  }

  override async destroy() {
    this.db?.close();
    this.yDoc.destroy();

    // when db is closed, we can safely remove it from ensure-db list
    this.update$.complete();
  }

  getWorkspaceName = () => {
    return this.yDoc.getMap('space:meta').get('name') as string;
  };

  override async connect() {
    const db = super.connect();

    if (!this.firstConnect) {
      this.yDoc.on('update', (update: Uint8Array, origin: Origin) => {
        if (origin !== 'self') {
          this.addUpdateToSQLite(update);
        }
        if (origin === 'external') {
          logger.debug('external update', this.workspaceId);
          dbSubjects.externalUpdate.next({
            workspaceId: this.workspaceId,
            update,
          });
        }
      });
    }

    Y.transact(this.yDoc, async () => {
      const updates = await this.getUpdates();
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
  }

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

  override async addBlob(key: string, value: Uint8Array) {
    const res = super.addBlob(key, value);
    this.update$.next();
    return res;
  }

  override async deleteBlob(key: string) {
    super.deleteBlob(key);
    this.update$.next();
  }

  override async addUpdateToSQLite(data: Uint8Array) {
    super.addUpdateToSQLite(data);
    this.update$.next();
  }
}

export async function openWorkspaceDatabase(
  context: AppContext,
  workspaceId: string
) {
  const meta = await getWorkspaceMeta(context, workspaceId);
  const db = new WorkspaceSQLiteDB(meta.mainDBPath, workspaceId);
  await db.connect();
  return db;
}
