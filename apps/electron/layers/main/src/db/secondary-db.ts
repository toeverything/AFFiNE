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

  close() {
    this.db?.close();
    this.db = null;
  }

  override destroy() {
    this.flushUpdateQueue();
    this.unsubscribers.forEach(unsub => unsub());
    this.db?.close();
    this.yDoc.destroy();
  }

  get workspaceId() {
    return this.upstream.workspaceId;
  }

  // do not update db immediately, instead, push to a queue
  // and flush the queue in a future time
  addUpdateToUpdateQueue(update: Uint8Array) {
    this.updateQueue.push(update);
    this.debouncedFlush();
  }

  flushUpdateQueue() {
    logger.debug(
      'flushUpdateQueue',
      this.workspaceId,
      'queue',
      this.updateQueue.length
    );
    const updates = [...this.updateQueue];
    this.updateQueue = [];
    this.connect();
    this.addUpdateToSQLite(updates);
    this.close();
  }

  // flush after 5s, but will not wait for more than 10s
  debouncedFlush = debounce(this.flushUpdateQueue, FLUSH_WAIT_TIME, {
    maxWait: FLUSH_MAX_WAIT_TIME,
  });

  runCounter = 0;

  // wrap the fn with connect and close
  // it only works for sync functions
  run = <T extends (...args: any[]) => any>(fn: T) => {
    try {
      if (this.runCounter === 0) {
        this.connect();
      }
      this.runCounter++;
      return fn();
    } catch (err) {
      logger.error(err);
    } finally {
      this.runCounter--;
      if (this.runCounter === 0) {
        this.close();
      }
    }
  };

  setupAndListen() {
    if (this.firstConnected) {
      return;
    }
    this.firstConnected = true;

    const onUpstreamUpdate = (update: Uint8Array, origin: YOrigin) => {
      if (origin === 'renderer') {
        // update to upstream yDoc should be replicated to self yDoc
        this.applyUpdate(update, 'upstream');
      }
    };

    const onSelfUpdate = (update: Uint8Array, origin: YOrigin) => {
      // for self update from upstream, we need to push it to external DB
      if (origin === 'upstream') {
        this.addUpdateToUpdateQueue(update);
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

    this.run(() => {
      // apply all updates from upstream
      const upstreamUpdate = this.upstream.getDocAsUpdates();
      // to initialize the yDoc, we need to apply all updates from the db
      this.applyUpdate(upstreamUpdate, 'upstream');

      this.pull();
    });
  }

  applyUpdate = (data: Uint8Array, origin: YOrigin = 'upstream') => {
    Y.applyUpdate(this.yDoc, data, origin);
  };

  // TODO: have a better solution to handle blobs
  syncBlobs() {
    this.run(() => {
      // pull blobs
      const blobsKeys = this.getBlobKeys();
      const upstreamBlobsKeys = this.upstream.getBlobKeys();
      // put every missing blob to upstream
      for (const key of blobsKeys) {
        if (!upstreamBlobsKeys.includes(key)) {
          const blob = this.getBlob(key);
          if (blob) {
            this.upstream.addBlob(key, blob);
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
    const updates = this.run(() => {
      // TODO: no need to get all updates, just get the latest ones (using a cursor, etc)?
      this.syncBlobs();
      return this.getUpdates().map(update => update.data);
    });

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
