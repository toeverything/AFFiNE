import type { SqliteConnection } from '@affine/native';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import type { AppContext } from '../context';
import { logger } from '../logger';
import type { YOrigin } from '../type';
import { mergeUpdateWorker } from '../workers';
import { getWorkspaceMeta } from '../workspace';
import { BaseSQLiteAdapter } from './base-db-adapter';
import { dbSubjects } from './subjects';

export class WorkspaceSQLiteDB extends BaseSQLiteAdapter {
  role = 'primary';
  yDoc = new Y.Doc();
  firstConnected = false;

  update$ = new Subject<void>();

  constructor(public override path: string, public workspaceId: string) {
    super(path);
  }

  override async destroy() {
    await super.destroy();
    this.yDoc.destroy();

    // when db is closed, we can safely remove it from ensure-db list
    this.update$.complete();
    this.firstConnected = false;
  }

  getWorkspaceName = () => {
    return this.yDoc.getMap('space:meta').get('name') as string;
  };

  async init() {
    const db = await super.connectIfNeeded();

    if (!this.firstConnected) {
      this.yDoc.on('update', async (update: Uint8Array, origin: YOrigin) => {
        if (origin === 'renderer') {
          await this.addUpdateToSQLite(db, [update]);
        } else if (origin === 'external') {
          dbSubjects.externalUpdate.next({
            workspaceId: this.workspaceId,
            update,
          });
          await this.addUpdateToSQLite(db, [update]);
          logger.debug('external update', this.workspaceId);
        }
      });
    }

    const updates = await this.getUpdates();
    const merged = await mergeUpdateWorker(updates.map(update => update.data));

    // to initialize the yDoc, we need to apply all updates from the db
    this.applyUpdate(merged, 'self');

    this.firstConnected = true;
    this.update$.next();

    return db;
  }

  getDocAsUpdates = () => {
    return Y.encodeStateAsUpdate(this.yDoc);
  };

  // non-blocking and use yDoc to validate the update
  // after that, the update is added to the db
  applyUpdate = (data: Uint8Array, origin: YOrigin = 'renderer') => {
    // todo: trim the updates when the number of records is too large
    // 1. store the current ydoc state in the db
    // 2. then delete the old updates
    // yjs-idb will always trim the db for the first time after DB is loaded
    Y.applyUpdate(this.yDoc, data, origin);
  };

  override async addBlob(key: string, value: Uint8Array) {
    const res = await super.addBlob(key, value);
    this.update$.next();
    return res;
  }

  override async deleteBlob(key: string) {
    super.deleteBlob(key);
    this.update$.next();
  }

  override async addUpdateToSQLite(db: SqliteConnection, data: Uint8Array[]) {
    super.addUpdateToSQLite(db, data);
    this.update$.next();
  }
}

export async function openWorkspaceDatabase(
  context: AppContext,
  workspaceId: string
) {
  const meta = await getWorkspaceMeta(context, workspaceId);
  const db = new WorkspaceSQLiteDB(meta.mainDBPath, workspaceId);
  await db.init();
  logger.info(`openWorkspaceDatabase [${workspaceId}]`);
  return db;
}
