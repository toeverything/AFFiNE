import assert from 'node:assert';

import type { InsertRow } from '@affine/native';
import { debounce } from 'lodash-es';
import * as Y from 'yjs';

import { logger } from '../logger';
import type { YOrigin } from '../type';
import { getWorkspaceMeta } from '../workspace';
import { BaseSQLiteAdapter } from './base-db-adapter';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';

const FLUSH_WAIT_TIME = 5000;
const FLUSH_MAX_WAIT_TIME = 10000;

// todo: trim db when it is too big
export class SecondaryWorkspaceSQLiteDB extends BaseSQLiteAdapter {
  role = 'secondary';
  yDoc = new Y.Doc();
  firstConnected = false;
  destroyed = false;

  updateQueue: { data: Uint8Array; docId?: string }[] = [];

  unsubscribers = new Set<() => void>();

  constructor(
    public override path: string,
    public upstream: WorkspaceSQLiteDB
  ) {
    super(path);
    this.init();
    logger.debug('[SecondaryWorkspaceSQLiteDB] created', this.workspaceId);
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

  override async destroy() {
    await this.flushUpdateQueue();
    this.unsubscribers.forEach(unsub => unsub());
    this.yDoc.destroy();
    await super.destroy();
    this.destroyed = true;
  }

  get workspaceId() {
    return this.upstream.workspaceId;
  }

  // do not update db immediately, instead, push to a queue
  // and flush the queue in a future time
  async addUpdateToUpdateQueue(update: InsertRow) {
    this.updateQueue.push(update);
    await this.debouncedFlush();
  }

  async flushUpdateQueue() {
    if (this.destroyed) {
      return;
    }
    logger.debug(
      'flushUpdateQueue',
      this.workspaceId,
      'queue',
      this.updateQueue.length
    );
    const updates = [...this.updateQueue];
    this.updateQueue = [];
    await this.run(async () => {
      await this.addUpdateToSQLite(updates);
    });
  }

  // flush after 5s, but will not wait for more than 10s
  debouncedFlush = debounce(this.flushUpdateQueue, FLUSH_WAIT_TIME, {
    maxWait: FLUSH_MAX_WAIT_TIME,
  });

  runCounter = 0;

  // wrap the fn with connect and close
  async run<T extends (...args: any[]) => any>(
    fn: T
  ): Promise<
    (T extends (...args: any[]) => infer U ? Awaited<U> : unknown) | undefined
  > {
    try {
      if (this.destroyed) {
        return;
      }
      await this.connectIfNeeded();
      this.runCounter++;
      return await fn();
    } catch (err) {
      logger.error(err);
      throw err;
    } finally {
      this.runCounter--;
      if (this.runCounter === 0) {
        // just close db, but not the yDoc
        await super.destroy();
      }
    }
  }

  setupListener(docId?: string) {
    logger.debug(
      'SecondaryWorkspaceSQLiteDB:setupListener',
      this.workspaceId,
      docId
    );
    const doc = this.getDoc(docId);
    const upstreamDoc = this.upstream.getDoc(docId);
    if (!doc || !upstreamDoc) {
      logger.warn(
        '[SecondaryWorkspaceSQLiteDB] setupListener: doc not found',
        docId
      );
      return;
    }

    const onUpstreamUpdate = (update: Uint8Array, origin: YOrigin) => {
      logger.debug(
        'SecondaryWorkspaceSQLiteDB:onUpstreamUpdate',
        origin,
        this.workspaceId,
        docId,
        update.length
      );
      if (origin === 'renderer' || origin === 'self') {
        // update to upstream yDoc should be replicated to self yDoc
        this.applyUpdate(update, 'upstream', docId);
      }
    };

    const onSelfUpdate = async (update: Uint8Array, origin: YOrigin) => {
      logger.debug(
        'SecondaryWorkspaceSQLiteDB:onSelfUpdate',
        origin,
        this.workspaceId,
        docId,
        update.length
      );
      // for self update from upstream, we need to push it to external DB
      if (origin === 'upstream') {
        await this.addUpdateToUpdateQueue({
          data: update,
          docId,
        });
      }

      if (origin === 'self') {
        this.upstream.applyUpdate(update, 'external', docId);
      }
    };

    const onSubdocs = ({ added }: { added: Set<Y.Doc> }) => {
      added.forEach(subdoc => {
        this.setupListener(subdoc.guid);
      });
    };

    doc.subdocs.forEach(subdoc => {
      this.setupListener(subdoc.guid);
    });

    // listen to upstream update
    this.upstream.yDoc.on('update', onUpstreamUpdate);
    doc.on('update', onSelfUpdate);
    doc.on('subdocs', onSubdocs);

    this.unsubscribers.add(() => {
      this.upstream.yDoc.off('update', onUpstreamUpdate);
      doc.off('update', onSelfUpdate);
      doc.off('subdocs', onSubdocs);
    });
  }

  init() {
    if (this.firstConnected) {
      return;
    }
    this.firstConnected = true;
    this.setupListener();
    // apply all updates from upstream
    // we assume here that the upstream ydoc is already sync'ed
    const syncUpstreamDoc = (docId?: string) => {
      const update = this.upstream.getDocAsUpdates(docId);
      if (update) {
        this.applyUpdate(update, 'upstream');
      }
    };
    syncUpstreamDoc();
    this.upstream.yDoc.subdocs.forEach(subdoc => {
      syncUpstreamDoc(subdoc.guid);
    });
  }

  applyUpdate = (
    data: Uint8Array,
    origin: YOrigin = 'upstream',
    docId?: string
  ) => {
    const doc = this.getDoc(docId);
    if (doc) {
      Y.applyUpdate(this.yDoc, data, origin);
    } else {
      logger.warn(
        '[SecondaryWorkspaceSQLiteDB] applyUpdate: doc not found',
        docId
      );
    }
  };

  // TODO: have a better solution to handle blobs
  async syncBlobs() {
    await this.run(async () => {
      // skip if upstream db is not connected (maybe it is already closed)
      const blobsKeys = await this.getBlobKeys();
      if (!this.upstream.db || this.upstream.db?.isClose) {
        return;
      }
      const upstreamBlobsKeys = await this.upstream.getBlobKeys();
      // put every missing blob to upstream
      for (const key of blobsKeys) {
        if (!upstreamBlobsKeys.includes(key)) {
          const blob = await this.getBlob(key);
          if (blob) {
            await this.upstream.addBlob(key, blob);
            logger.debug('syncBlobs', this.workspaceId, key);
          }
        }
      }
    });
  }

  /**
   * pull from external DB file and apply to embedded yDoc
   * workflow:
   * - connect to external db
   * - get updates
   * - apply updates to local yDoc
   * - get blobs and put new blobs to upstream
   * - disconnect
   */
  async pull() {
    const start = performance.now();
    assert(this.upstream.db, 'upstream db should be connected');
    const rows = await this.run(async () => {
      // TODO: no need to get all updates, just get the latest ones (using a cursor, etc)?
      await this.syncBlobs();
      return await this.getAllUpdates();
    });

    if (!rows || this.destroyed) {
      return;
    }

    // apply root doc first
    rows.forEach(row => {
      if (!row.docId) {
        this.applyUpdate(row.data, 'self');
      }
    });

    rows.forEach(row => {
      if (row.docId) {
        this.applyUpdate(row.data, 'self', row.docId);
      }
    });

    logger.debug(
      'pull external updates',
      this.path,
      rows.length,
      (performance.now() - start).toFixed(2),
      'ms'
    );
  }
}

export async function getSecondaryWorkspaceDBPath(workspaceId: string) {
  const meta = await getWorkspaceMeta(workspaceId);
  return meta?.secondaryDBPath;
}
