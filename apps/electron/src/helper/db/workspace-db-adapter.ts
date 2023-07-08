import type { InsertRow } from '@affine/native';
import { debounce } from 'lodash-es';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import { logger } from '../logger';
import type { YOrigin } from '../type';
import { getWorkspaceMeta } from '../workspace';
import { BaseSQLiteAdapter } from './base-db-adapter';
import { dbSubjects } from './subjects';

const TRIM_SIZE = 500;

export class WorkspaceSQLiteDB extends BaseSQLiteAdapter {
  role = 'primary';
  yDoc = new Y.Doc();
  firstConnected = false;

  update$ = new Subject<void>();

  constructor(
    public override path: string,
    public workspaceId: string
  ) {
    super(path);
  }

  override async destroy() {
    await super.destroy();
    this.yDoc.destroy();

    // when db is closed, we can safely remove it from ensure-db list
    this.update$.complete();
    this.firstConnected = false;
  }

  getDoc(docId?: string) {
    if (!docId) {
      return this.yDoc;
    }
    // this should be pretty fast and we don't need to cache it
    for (const subdoc of this.yDoc.subdocs) {
      if (subdoc.guid === docId) {
        return subdoc;
      }
    }
    return null;
  }

  getWorkspaceName = () => {
    return this.yDoc.getMap('meta').get('name') as string;
  };

  setupListener(docId?: string) {
    logger.debug(
      'WorkspaceSQLiteDB:setupListener',
      this.workspaceId,
      docId,
      this.getWorkspaceName()
    );
    const doc = this.getDoc(docId);
    if (doc) {
      const onUpdate = async (update: Uint8Array, origin: YOrigin) => {
        logger.debug(
          'WorkspaceSQLiteDB:onUpdate',
          this.workspaceId,
          docId,
          update.length
        );
        const insertRows = [{ data: update, docId }];
        if (origin === 'renderer') {
          await this.addUpdateToSQLite(insertRows);
        } else if (origin === 'external') {
          dbSubjects.externalUpdate.next({
            workspaceId: this.workspaceId,
            update,
            docId,
          });
          await this.addUpdateToSQLite(insertRows);
          logger.debug('external update', this.workspaceId);
        }
      };
      doc.subdocs.forEach(subdoc => {
        this.setupListener(subdoc.guid);
      });
      const onSubdocs = ({ added }: { added: Set<Y.Doc> }) => {
        logger.info('onSubdocs', this.workspaceId, docId, added);
        added.forEach(subdoc => {
          this.setupListener(subdoc.guid);
        });
      };

      doc.on('update', onUpdate);
      doc.on('subdocs', onSubdocs);
    } else {
      logger.error('setupListener: doc not found', docId);
    }
  }

  async init() {
    const db = await super.connectIfNeeded();

    if (!this.firstConnected) {
      this.setupListener();
    }

    const updates = await this.getAllUpdates();

    // apply root first (without ID).
    // subdoc will be available after root is applied
    updates.forEach(update => {
      if (!update.docId) {
        this.applyUpdate(update.data, 'self');
      }
    });

    // then, for all subdocs, apply the updates
    updates.forEach(update => {
      if (update.docId) {
        this.applyUpdate(update.data, 'self', update.docId);
      }
    });

    this.firstConnected = true;
    this.update$.next();

    return db;
  }

  // unlike getUpdates, this will return updates in yDoc
  getDocAsUpdates = (docId?: string) => {
    const doc = docId ? this.getDoc(docId) : this.yDoc;
    if (doc) {
      return Y.encodeStateAsUpdate(doc);
    }
    return null;
  };

  // non-blocking and use yDoc to validate the update
  // after that, the update is added to the db
  applyUpdate = (
    data: Uint8Array,
    origin: YOrigin = 'renderer',
    docId?: string
  ) => {
    // todo: trim the updates when the number of records is too large
    // 1. store the current ydoc state in the db
    // 2. then delete the old updates
    // yjs-idb will always trim the db for the first time after DB is loaded
    const doc = this.getDoc(docId);
    if (doc) {
      Y.applyUpdate(doc, data, origin);
    } else {
      logger.warn('[WorkspaceSQLiteDB] applyUpdate: doc not found', docId);
    }
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
    data.forEach(row => {
      this.trimWhenNecessary(row.docId)?.catch(err => {
        logger.error('trimWhenNecessary failed', err);
      });
    });
    await super.addUpdateToSQLite(data);
  }

  trimWhenNecessary = debounce(async (docId?: string) => {
    if (this.firstConnected) {
      const count = (await this.db?.getUpdatesCount(docId)) ?? 0;
      if (count > TRIM_SIZE) {
        logger.debug(`trim ${this.workspaceId}:${docId} ${count}`);
        const update = this.getDocAsUpdates(docId);
        if (update) {
          const insertRows = [{ data: update, docId }];
          await this.db?.replaceUpdates(docId, insertRows);
          logger.debug(`trim ${this.workspaceId}:${docId} successfully`);
        }
      }
    }
  }, 1000);
}

export async function openWorkspaceDatabase(workspaceId: string) {
  const meta = await getWorkspaceMeta(workspaceId);
  const db = new WorkspaceSQLiteDB(meta.mainDBPath, workspaceId);
  await db.init();
  logger.info(`openWorkspaceDatabase [${workspaceId}]`);
  return db;
}
