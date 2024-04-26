import type { InsertRow } from '@affine/native';
import { Subject } from 'rxjs';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { logger } from '../logger';
import { getWorkspaceMeta } from '../workspace/meta';
import { BaseSQLiteAdapter } from './base-db-adapter';
import { mergeUpdate } from './merge-update';

const TRIM_SIZE = 500;

export class WorkspaceSQLiteDB extends BaseSQLiteAdapter {
  role = 'primary';

  update$ = new Subject<void>();

  constructor(
    public override path: string,
    public workspaceId: string
  ) {
    super(path);
  }

  override async destroy() {
    await super.destroy();

    // when db is closed, we can safely remove it from ensure-db list
    this.update$.complete();
  }

  getWorkspaceName = async () => {
    const ydoc = new YDoc();
    const updates = await this.getUpdates();
    updates.forEach(update => {
      applyUpdate(ydoc, update.data);
    });
    return ydoc.getMap('meta').get('name') as string;
  };

  async init() {
    const db = await super.connectIfNeeded();
    await this.tryTrim();
    return db;
  }

  // getUpdates then encode
  getDocAsUpdates = async (docId?: string) => {
    const updates = await this.getUpdates(docId);
    return mergeUpdate(updates.map(row => row.data));
  };

  override async addBlob(key: string, value: Uint8Array) {
    this.update$.next();
    const res = await super.addBlob(key, value);
    return res;
  }

  override async deleteBlob(key: string) {
    this.update$.next();
    await super.deleteBlob(key);
  }

  override async addUpdateToSQLite(data: InsertRow[]) {
    this.update$.next();
    await super.addUpdateToSQLite(data);
  }

  private readonly tryTrim = async (docId?: string) => {
    const count = (await this.db?.getUpdatesCount(docId)) ?? 0;
    if (count > TRIM_SIZE) {
      logger.debug(`trim ${this.workspaceId}:${docId} ${count}`);
      const update = await this.getDocAsUpdates(docId);
      if (update) {
        const insertRows = [{ data: update, docId }];
        await this.db?.replaceUpdates(docId, insertRows);
        logger.debug(`trim ${this.workspaceId}:${docId} successfully`);
      }
    }
  };
}

export async function openWorkspaceDatabase(workspaceId: string) {
  const meta = await getWorkspaceMeta(workspaceId);
  const db = new WorkspaceSQLiteDB(meta.mainDBPath, workspaceId);
  await db.init();
  logger.info(`openWorkspaceDatabase [${workspaceId}]`);
  return db;
}
