import type { Logger } from '@blocksuite/global/utils';
import isEqual from 'lodash-es/isEqual';
import { Subject } from 'rxjs';
import type { Doc } from 'yjs';
import {
  applyUpdate,
  encodeStateAsUpdate,
  encodeStateVector,
  mergeUpdates,
} from 'yjs';

import {
  PriorityAsyncQueue,
  SharedPriorityTarget,
} from '../utils/async-queue.js';
import { MANUALLY_STOP, throwIfAborted } from '../utils/throw-if-aborted.js';
import { DocPeerStep } from './consts.js';
import type { DocSource } from './source.js';

export interface DocPeerStatus {
  step: DocPeerStep;
  totalDocs: number;
  loadedDocs: number;
  pendingPullUpdates: number;
  pendingPushUpdates: number;
}

/**
 * # DocPeer
 * A DocPeer is responsible for syncing one Storage with one Y.Doc and its subdocs.
 *
 * ```
 *                    ┌─────┐
 *                    │Start│
 *                    └──┬──┘
 *                       │
 *    ┌──────┐     ┌─────▼──────┐        ┌────┐
 *    │listen◄─────┤pull rootdoc│        │peer│
 *    └──┬───┘     └─────┬──────┘        └──┬─┘
 *       │               │ onLoad()         │
 *    ┌──▼───┐     ┌─────▼──────┐      ┌────▼────┐
 *    │listen◄─────┤pull subdocs│      │subscribe│
 *    └──┬───┘     └─────┬──────┘      └────┬────┘
 *       │               │ onReady()        │
 *    ┌──▼──┐      ┌─────▼───────┐       ┌──▼──┐
 *    │queue├──────►apply updates◄───────┤queue│
 *    └─────┘      └─────────────┘       └─────┘
 * ```
 *
 * listen: listen for updates from ydoc, typically from user modifications.
 * subscribe: listen for updates from storage, typically from other users.
 *
 */
export class SyncPeer {
  private _status: DocPeerStatus = {
    step: DocPeerStep.LoadingRootDoc,
    totalDocs: 1,
    loadedDocs: 0,
    pendingPullUpdates: 0,
    pendingPushUpdates: 0,
  };

  readonly abort = new AbortController();

  // handle updates from storage
  handleStorageUpdates = (id: string, data: Uint8Array) => {
    this.state.pullUpdatesQueue.push({
      id,
      data,
    });
    this.updateSyncStatus();
  };

  // handle subdocs changes, append new subdocs to queue, remove subdocs from queue
  handleSubdocsUpdate = ({
    added,
    removed,
  }: {
    added: Set<Doc>;
    removed: Set<Doc>;
  }) => {
    for (const subdoc of added) {
      this.state.subdocsLoadQueue.push({ id: subdoc.guid, doc: subdoc });
    }

    for (const subdoc of removed) {
      this.disconnectDoc(subdoc);
      this.state.subdocsLoadQueue.remove(doc => doc.doc === subdoc);
    }
    this.updateSyncStatus();
  };

  // handle updates from ydoc
  handleYDocUpdates = (update: Uint8Array, origin: string, doc: Doc) => {
    // don't push updates from storage
    if (origin === this.name) {
      return;
    }

    const exist = this.state.pushUpdatesQueue.find(({ id }) => id === doc.guid);
    if (exist) {
      exist.data.push(update);
    } else {
      this.state.pushUpdatesQueue.push({
        id: doc.guid,
        data: [update],
      });
    }

    this.updateSyncStatus();
  };

  readonly onStatusChange = new Subject<DocPeerStatus>();

  readonly state: {
    connectedDocs: Map<string, Doc>;
    pushUpdatesQueue: PriorityAsyncQueue<{
      id: string;
      data: Uint8Array[];
    }>;
    pushingUpdate: boolean;
    pullUpdatesQueue: PriorityAsyncQueue<{
      id: string;
      data: Uint8Array;
    }>;
    subdocLoading: boolean;
    subdocsLoadQueue: PriorityAsyncQueue<{ id: string; doc: Doc }>;
  } = {
    connectedDocs: new Map(),
    pushUpdatesQueue: new PriorityAsyncQueue([], this.priorityTarget),
    pushingUpdate: false,
    pullUpdatesQueue: new PriorityAsyncQueue([], this.priorityTarget),
    subdocLoading: false,
    subdocsLoadQueue: new PriorityAsyncQueue([], this.priorityTarget),
  };

  get name() {
    return this.source.name;
  }

  private set status(s: DocPeerStatus) {
    if (!isEqual(s, this._status)) {
      this.logger.debug(`doc-peer:${this.name} status change`, s);
      this._status = s;
      this.onStatusChange.next(s);
    }
  }

  get status() {
    return this._status;
  }

  constructor(
    readonly rootDoc: Doc,
    readonly source: DocSource,
    readonly priorityTarget = new SharedPriorityTarget(),
    readonly logger: Logger
  ) {
    this.logger.debug(`doc-peer:${this.name} start`);

    this.syncRetryLoop(this.abort.signal).catch(err => {
      // should not reach here
      console.error(err);
    });
  }

  async connectDoc(doc: Doc, abort: AbortSignal) {
    const { data: docData, state: inStorageState } =
      (await this.source.pull(doc.guid, encodeStateVector(doc))) ?? {};
    throwIfAborted(abort);

    if (docData && docData.length > 0) {
      applyUpdate(doc, docData, 'load');
    }

    // diff root doc and in-storage, save updates to pendingUpdates
    this.state.pushUpdatesQueue.push({
      id: doc.guid,
      data: [encodeStateAsUpdate(doc, inStorageState)],
    });

    this.state.connectedDocs.set(doc.guid, doc);

    // start listen root doc changes
    doc.on('update', this.handleYDocUpdates);

    // mark rootDoc as loaded
    doc.emit('sync', [true, doc]);

    this.updateSyncStatus();
  }

  disconnectDoc(doc: Doc) {
    doc.off('update', this.handleYDocUpdates);
    this.state.connectedDocs.delete(doc.guid);
    this.updateSyncStatus();
  }

  initState() {
    this.state.connectedDocs.clear();
    this.state.pushUpdatesQueue.clear();
    this.state.pullUpdatesQueue.clear();
    this.state.subdocsLoadQueue.clear();
    this.state.pushingUpdate = false;
    this.state.subdocLoading = false;
  }

  /**
   * stop sync
   *
   * DocPeer is one-time use, this peer should be discarded after call stop().
   */
  stop() {
    this.logger.debug(`doc-peer:${this.name} stop`);
    this.abort.abort(MANUALLY_STOP);
  }

  /**
   * main synchronization logic
   */
  async sync(abortOuter: AbortSignal) {
    this.initState();
    const abortInner = new AbortController();

    abortOuter.addEventListener('abort', reason => {
      abortInner.abort(reason);
    });

    let dispose: (() => void) | null = null;
    try {
      this.updateSyncStatus();

      // start listen storage updates
      dispose = await this.source.subscribe(
        this.handleStorageUpdates,
        reason => {
          // abort if storage disconnect, should trigger retry loop
          abortInner.abort('subscribe disconnect:' + reason);
        }
      );
      throwIfAborted(abortInner.signal);

      // Step 1: load root doc
      await this.connectDoc(this.rootDoc, abortInner.signal);

      // Step 2: load subdocs
      this.state.subdocsLoadQueue.push(
        ...Array.from(this.rootDoc.getSubdocs()).map(doc => ({
          id: doc.guid,
          doc,
        }))
      );
      this.updateSyncStatus();

      this.rootDoc.on('subdocs', this.handleSubdocsUpdate);

      // Finally: start sync
      await Promise.all([
        // load subdocs
        (async () => {
          while (throwIfAborted(abortInner.signal)) {
            const subdoc = await this.state.subdocsLoadQueue.next(
              abortInner.signal
            );
            this.state.subdocLoading = true;
            this.updateSyncStatus();
            await this.connectDoc(subdoc.doc, abortInner.signal);
            this.state.subdocLoading = false;
            this.updateSyncStatus();
          }
        })(),
        // pull updates
        (async () => {
          while (throwIfAborted(abortInner.signal)) {
            const { id, data } = await this.state.pullUpdatesQueue.next(
              abortInner.signal
            );
            // don't apply empty data or Uint8Array([0, 0])
            if (
              !(
                data.byteLength === 0 ||
                (data.byteLength === 2 && data[0] === 0 && data[1] === 0)
              )
            ) {
              const subdoc = this.state.connectedDocs.get(id);
              if (subdoc) {
                applyUpdate(subdoc, data, this.name);
              }
            }
            this.updateSyncStatus();
          }
        })(),
        // push updates
        (async () => {
          while (throwIfAborted(abortInner.signal)) {
            const { id, data } = await this.state.pushUpdatesQueue.next(
              abortInner.signal
            );
            this.state.pushingUpdate = true;
            this.updateSyncStatus();

            const merged = mergeUpdates(data);

            // don't push empty data or Uint8Array([0, 0])
            if (
              !(
                merged.byteLength === 0 ||
                (merged.byteLength === 2 && merged[0] === 0 && merged[1] === 0)
              )
            ) {
              await this.source.push(id, merged);
            }

            this.state.pushingUpdate = false;
            this.updateSyncStatus();
          }
        })(),
      ]);
    } finally {
      dispose?.();
      for (const docs of this.state.connectedDocs.values()) {
        this.disconnectDoc(docs);
      }
      this.rootDoc.off('subdocs', this.handleSubdocsUpdate);
    }
  }

  /**
   * auto retry after 5 seconds if sync failed
   */
  async syncRetryLoop(abort: AbortSignal) {
    while (abort.aborted === false) {
      try {
        await this.sync(abort);
      } catch (err) {
        if (err === MANUALLY_STOP || abort.aborted) {
          return;
        }

        this.logger.error(`doc-peer:${this.name} sync error`, err);
      }
      try {
        this.logger.error(`doc-peer:${this.name} retry after 5 seconds`);
        this.status = {
          step: DocPeerStep.Retrying,
          totalDocs: 1,
          loadedDocs: 0,
          pendingPullUpdates: 0,
          pendingPushUpdates: 0,
        };
        await Promise.race([
          new Promise<void>(resolve => {
            setTimeout(resolve, 5 * 1000);
          }),
          new Promise((_, reject) => {
            // exit if manually stopped
            if (abort.aborted) {
              reject(abort.reason);
            }
            abort.addEventListener('abort', () => {
              reject(abort.reason);
            });
          }),
        ]);
      } catch (err) {
        if (err === MANUALLY_STOP || abort.aborted) {
          return;
        }

        // should never reach here
        throw err;
      }
    }
  }

  updateSyncStatus() {
    let step;
    if (this.state.connectedDocs.size === 0) {
      step = DocPeerStep.LoadingRootDoc;
    } else if (this.state.subdocsLoadQueue.length || this.state.subdocLoading) {
      step = DocPeerStep.LoadingSubDoc;
    } else if (
      this.state.pullUpdatesQueue.length ||
      this.state.pushUpdatesQueue.length ||
      this.state.pushingUpdate
    ) {
      step = DocPeerStep.Syncing;
    } else {
      step = DocPeerStep.Synced;
    }

    this.status = {
      step: step,
      totalDocs:
        this.state.connectedDocs.size + this.state.subdocsLoadQueue.length,
      loadedDocs: this.state.connectedDocs.size,
      pendingPullUpdates:
        this.state.pullUpdatesQueue.length + (this.state.subdocLoading ? 1 : 0),
      pendingPushUpdates:
        this.state.pushUpdatesQueue.length + (this.state.pushingUpdate ? 1 : 0),
    };
  }

  async waitForLoaded(abort?: AbortSignal) {
    if (this.status.step >= DocPeerStep.LoadingSubDoc) {
      return;
    }
    await Promise.race([
      new Promise<void>(resolve => {
        this.onStatusChange.subscribe(status => {
          if (status.step >= DocPeerStep.LoadingSubDoc) {
            resolve();
          }
        });
      }),
      new Promise((_, reject) => {
        if (abort?.aborted) {
          reject(abort.reason);
        }
        abort?.addEventListener('abort', () => {
          reject(abort.reason);
        });
      }),
    ]);
    throwIfAborted(abort);
  }

  async waitForSynced(abort?: AbortSignal) {
    if (this.status.step === DocPeerStep.Synced) {
      return;
    }
    await Promise.race([
      new Promise<void>(resolve => {
        this.onStatusChange.subscribe(status => {
          if (status.step === DocPeerStep.Synced) {
            resolve();
          }
        });
      }),
      new Promise((_, reject) => {
        if (abort?.aborted) {
          reject(abort.reason);
        }
        abort?.addEventListener('abort', () => {
          reject(abort.reason);
        });
      }),
    ]);
    throwIfAborted(abort);
  }
}
