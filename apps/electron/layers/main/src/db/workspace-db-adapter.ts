import type { Database } from 'better-sqlite3';
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

  override destroy() {
    this.db?.close();
    this.db = null;
    this.yDoc.destroy();

    // when db is closed, we can safely remove it from ensure-db list
    this.update$.complete();
  }

  getWorkspaceName = () => {
    return this.yDoc.getMap('space:meta').get('name') as string;
  };

  async init(): Promise<Database | undefined> {
    const db = super.connect();

    if (!this.firstConnected) {
      this.yDoc.on('update', (update: Uint8Array, origin: YOrigin) => {
        if (origin === 'renderer') {
          this.addUpdateToSQLite([update]);
        } else if (origin === 'external') {
          this.addUpdateToSQLite([update]);
          logger.debug('external update', this.workspaceId);
          dbSubjects.externalUpdate.next({
            workspaceId: this.workspaceId,
            update,
          });
        }
      });
    }

    const updates = this.getUpdates();
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

  override addBlob(key: string, value: Uint8Array) {
    const res = super.addBlob(key, value);
    this.update$.next();
    return res;
  }

  override deleteBlob(key: string) {
    super.deleteBlob(key);
    this.update$.next();
  }

  override addUpdateToSQLite(data: Uint8Array[]) {
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
  await db.init();
  return db;
}
