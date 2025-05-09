import type { SpaceType } from '@affine/nbstore';
import { AsyncLock } from '@toeverything/infra/utils';
import { Subject } from 'rxjs';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { logger } from '../../logger';
import { getWorkspaceMeta } from '../../workspace/meta';
import { SQLiteAdapter } from './db-adapter';
import { mergeUpdate } from './merge-update';

const TRIM_SIZE = 1;

export class WorkspaceSQLiteDB implements AsyncDisposable {
  lock = new AsyncLock();
  update$ = new Subject<void>();
  adapter = new SQLiteAdapter(this.path);

  constructor(
    public path: string,
    public workspaceId: string
  ) {}

  async transaction<T>(cb: () => Promise<T>): Promise<T> {
    using _lock = await this.lock.acquire();
    return await cb();
  }

  async destroy() {
    await this.adapter.destroy();

    // when db is closed, we can safely remove it from ensure-db list
    this.update$.complete();
  }

  [Symbol.asyncDispose] = async () => {
    await this.destroy();
  };

  private readonly toDBDocId = (docId: string) => {
    return this.workspaceId === docId ? undefined : docId;
  };

  getWorkspaceMeta = async () => {
    const ydoc = new YDoc();
    const updates = await this.adapter.getUpdates();
    updates.forEach(update => {
      applyUpdate(ydoc, update.data);
    });
    logger.log(
      `ydoc.getMap('meta').get('name')`,
      ydoc.getMap('meta').get('name'),
      this.path,
      updates.length
    );
    return ydoc.getMap('meta').toJSON();
  };

  getWorkspaceName = async () => {
    const meta = await this.getWorkspaceMeta();
    return meta.name;
  };

  async init() {
    const db = await this.adapter.connectIfNeeded();
    await this.tryTrim();
    return db;
  }

  async get(docId: string) {
    return this.adapter.getUpdates(docId);
  }

  // getUpdates then encode
  getDocAsUpdates = async (docId: string) => {
    const dbID = this.toDBDocId(docId);
    const update = await this.tryTrim(dbID);
    if (update) {
      return update;
    } else {
      const updates = await this.adapter.getUpdates(dbID);
      return mergeUpdate(updates.map(row => row.data));
    }
  };

  async getDocTimestamps() {
    return this.adapter.getDocTimestamps();
  }

  async addBlob(key: string, value: Uint8Array) {
    this.update$.next();
    const res = await this.adapter.addBlob(key, value);
    return res;
  }

  async getBlob(key: string) {
    return this.adapter.getBlob(key);
  }

  async getBlobKeys() {
    return this.adapter.getBlobKeys();
  }

  async deleteBlob(key: string) {
    this.update$.next();
    await this.adapter.deleteBlob(key);
  }

  async addUpdateToSQLite(update: Uint8Array, subdocId: string) {
    this.update$.next();
    await this.transaction(async () => {
      const dbID = this.toDBDocId(subdocId);
      const oldUpdate = await this.adapter.getUpdates(dbID);
      await this.adapter.replaceUpdates(dbID, [
        {
          data: mergeUpdate([...oldUpdate.map(u => u.data), update]),
          docId: dbID,
        },
      ]);
    });
  }

  async deleteUpdate(subdocId: string) {
    this.update$.next();
    await this.adapter.deleteUpdates(this.toDBDocId(subdocId));
  }

  private readonly tryTrim = async (dbID?: string) => {
    const count = (await this.adapter?.getUpdatesCount(dbID)) ?? 0;
    if (count > TRIM_SIZE) {
      return await this.transaction(async () => {
        logger.debug(`trim ${this.workspaceId}:${dbID} ${count}`);
        const updates = await this.adapter.getUpdates(dbID);
        const update = mergeUpdate(updates.map(row => row.data));
        const insertRows = [{ data: update, docId: dbID }];
        await this.adapter?.replaceUpdates(dbID, insertRows);
        logger.debug(`trim ${this.workspaceId}:${dbID} successfully`);
        return update;
      });
    }
    return null;
  };

  async checkpoint() {
    await this.adapter.checkpoint();
  }
}

export async function openWorkspaceDatabase(
  spaceType: SpaceType,
  spaceId: string
) {
  const meta = await getWorkspaceMeta(spaceType, spaceId);
  const db = new WorkspaceSQLiteDB(meta.mainDBPath, spaceId);
  await db.init();
  logger.info(`openWorkspaceDatabase [${spaceId}]`);
  return db;
}
