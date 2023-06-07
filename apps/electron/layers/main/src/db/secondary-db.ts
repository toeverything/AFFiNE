import assert from 'node:assert';

import type { SqliteConnection } from '@affine/native';
import { debounce } from 'lodash-es';
import * as Y from 'yjs';

import type { AppContext } from '../context';
import { logger } from '../logger';
import type { YOrigin } from '../type';
import { mergeUpdateWorker } from '../workers';
import { getWorkspaceMeta } from '../workspace';
import { BaseSQLiteAdapter } from './base-db-adapter';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';

const FLUSH_WAIT_TIME = 5000;
const FLUSH_MAX_WAIT_TIME = 10000;

export class SecondaryWorkspaceSQLiteDB extends BaseSQLiteAdapter {
  role = 'secondary';
  yDoc = new Y.Doc();
  firstConnected = false;

  updateQueue: Uint8Array[] = [];

  unsubscribers = new Set<() => void>();

  constructor(
    public override path: string,
    public upstream: WorkspaceSQLiteDB
  ) {
    super(path);
    this.setupAndListen();
    logger.debug('[SecondaryWorkspaceSQLiteDB] created', this.workspaceId);
  }

  override async destroy() {
    const { db } = this;
    await this.flushUpdateQueue(db);
    this.unsubscribers.forEach(unsub => unsub());
    this.yDoc.destroy();
    await super.destroy();
  }

  get workspaceId() {
    return this.upstream.workspaceId;
  }

  // do not update db immediately, instead, push to a queue
  // and flush the queue in a future time
  async addUpdateToUpdateQueue(db: SqliteConnection, update: Uint8Array) {
    this.updateQueue.push(update);
    await this.debouncedFlush(db);
  }

  async flushUpdateQueue(db = this.db) {
    if (!db) {
      return; // skip if db is not connected
    }
    logger.debug(
      'flushUpdateQueue',
      this.workspaceId,
      'queue',
      this.updateQueue.length
    );
    const updates = [...this.updateQueue];
    this.updateQueue = [];
    await db.connect();
    await this.addUpdateToSQLite(db, updates);
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
      await this.connectIfNeeded();
      this.runCounter++;
      return await fn();
    } catch (err) {
      logger.error(err);
    } finally {
      this.runCounter--;
      if (this.runCounter === 0) {
        await super.destroy();
      }
    }
  }

  setupAndListen() {
    if (this.firstConnected) {
      return;
    }
    this.firstConnected = true;
    const { db } = this;

    const onUpstreamUpdate = (update: Uint8Array, origin: YOrigin) => {
      if (origin === 'renderer') {
        // update to upstream yDoc should be replicated to self yDoc
        this.applyUpdate(update, 'upstream');
      }
    };

    const onSelfUpdate = (update: Uint8Array, origin: YOrigin) => {
      // for self update from upstream, we need to push it to external DB
      if (origin === 'upstream') {
        this.addUpdateToUpdateQueue(db!, update);
      }

      if (origin === 'self') {
        this.upstream.applyUpdate(update, 'external');
      }
    };

    // listen to upstream update
    this.upstream.yDoc.on('update', onUpstreamUpdate);
    this.yDoc.on('update', onSelfUpdate);

    this.unsubscribers.add(() => {
      this.upstream.yDoc.off('update', onUpstreamUpdate);
      this.yDoc.off('update', onSelfUpdate);
    });

    this.run(async () => {
      // apply all updates from upstream
      const upstreamUpdate = this.upstream.getDocAsUpdates();
      // to initialize the yDoc, we need to apply all updates from the db
      this.applyUpdate(upstreamUpdate, 'upstream');
    });
  }

  applyUpdate = (data: Uint8Array, origin: YOrigin = 'upstream') => {
    Y.applyUpdate(this.yDoc, data, origin);
  };

  // TODO: have a better solution to handle blobs
  async syncBlobs() {
    await this.run(async () => {
      // pull blobs
      const blobsKeys = await this.getBlobKeys();
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
    const updates = await this.run(async () => {
      // TODO: no need to get all updates, just get the latest ones (using a cursor, etc)?
      await this.syncBlobs();
      return (await this.getUpdates()).map(update => update.data);
    });

    if (!updates) {
      return;
    }

    const merged = await mergeUpdateWorker(updates);
    this.applyUpdate(merged, 'self');

    logger.debug(
      'pull external updates',
      this.path,
      updates.length,
      (performance.now() - start).toFixed(2),
      'ms'
    );
  }
}

export async function getSecondaryWorkspaceDBPath(
  context: AppContext,
  workspaceId: string
) {
  const meta = await getWorkspaceMeta(context, workspaceId);
  return meta?.secondaryDBPath;
}
