import { DebugLogger } from '@affine/debug';
import { Slot } from '@blocksuite/global/utils';
import type { Doc } from 'yjs';

import type { Storage } from '../storage';
import { SyncPeer, SyncPeerStep } from './peer';

export const MANUALLY_STOP = 'manually-stop';

/**
 * # SyncEngine
 *
 *                    ┌────────────┐
 *                    │ SyncEngine │
 *                    └─────┬──────┘
 *                          │
 *                          ▼
 *                    ┌────────────┐
 *                    │  SyncPeer  │
 *          ┌─────────┤   local    ├─────────┐
 *          │         └─────┬──────┘         │
 *          │               │                │
 *          ▼               ▼                ▼
 *   ┌────────────┐   ┌────────────┐   ┌────────────┐
 *   │  SyncPeer  │   │  SyncPeer  │   │  SyncPeer  │
 *   │   Remote   │   │   Remote   │   │   Remote   │
 *   └────────────┘   └────────────┘   └────────────┘
 *
 * Sync engine manage sync peers
 *
 * Sync steps:
 * 1. start local sync
 * 2. wait for local sync complete
 * 3. start remote sync
 * 4. continuously sync local and remote
 */
export enum SyncEngineStatus {
  Stopped = 0,
  Retrying = 1,
  LoadingRootDoc = 2,
  LoadingSubDoc = 3,
  Syncing = 4,
  Synced = 5,
}

export class SyncEngine {
  get rootDocId() {
    return this.rootDoc.guid;
  }

  logger = new DebugLogger('affine:sync-engine:' + this.rootDocId);
  private _status = SyncEngineStatus.Stopped;
  onStatusChange = new Slot<SyncEngineStatus>();
  private set status(s: SyncEngineStatus) {
    if (s !== this._status) {
      this.logger.info('status change', SyncEngineStatus[s]);
      this._status = s;
      this.onStatusChange.emit(s);
    }
  }

  get status() {
    return this._status;
  }

  private abort = new AbortController();

  constructor(
    private rootDoc: Doc,
    private local: Storage,
    private remotes: Storage[]
  ) {}

  start() {
    if (this.status !== SyncEngineStatus.Stopped) {
      this.stop();
    }
    this.abort = new AbortController();

    this.status = SyncEngineStatus.LoadingRootDoc;
    this.sync(this.abort.signal).catch(err => {
      // should never reach here
      this.logger.error(err);
    });
  }

  stop() {
    this.abort.abort(MANUALLY_STOP);
    this.status = SyncEngineStatus.Stopped;
  }

  // main sync process, should never return until abort
  async sync(signal: AbortSignal) {
    let localPeer: SyncPeer | null = null;
    const remotePeers: SyncPeer[] = [];
    const cleanUp: (() => void)[] = [];
    try {
      // Step 1: start local sync peer
      localPeer = new SyncPeer(this.rootDoc, this.local);

      // Step 2: wait for local sync complete
      await localPeer.waitForLoaded(signal);

      // Step 3: start remote sync peer
      remotePeers.push(
        ...this.remotes.map(remote => new SyncPeer(this.rootDoc, remote))
      );

      const peers = [localPeer, ...remotePeers];

      this.updateSyncingState(peers);

      for (const peer of peers) {
        cleanUp.push(
          peer.onStatusChange.on(() => {
            if (!signal.aborted) this.updateSyncingState(peers);
          }).dispose
        );
      }

      // Step 4: continuously sync local and remote

      // wait for abort
      await new Promise((_, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
        }
        signal.addEventListener('abort', () => {
          reject(signal.reason);
        });
      });
    } catch (error) {
      if (error === MANUALLY_STOP) {
        return;
      }
      throw error;
    } finally {
      // stop peers
      localPeer?.stop();
      for (const remotePeer of remotePeers) {
        remotePeer.stop();
      }
      for (const clean of cleanUp) {
        clean();
      }
    }
  }

  updateSyncingState(peers: SyncPeer[]) {
    let status = SyncEngineStatus.Synced;
    for (const peer of peers) {
      if (peer.status.step !== SyncPeerStep.Synced) {
        status = SyncEngineStatus.Syncing;
        break;
      }
    }
    for (const peer of peers) {
      if (peer.status.step === SyncPeerStep.LoadingSubDoc) {
        status = SyncEngineStatus.LoadingSubDoc;
        break;
      }
    }
    for (const peer of peers) {
      if (peer.status.step === SyncPeerStep.LoadingRootDoc) {
        status = SyncEngineStatus.LoadingRootDoc;
        break;
      }
    }
    for (const peer of peers) {
      if (peer.status.step === SyncPeerStep.Retrying) {
        status = SyncEngineStatus.Retrying;
        break;
      }
    }
    this.status = status;
  }

  async waitForSynced(abort?: AbortSignal) {
    if (this.status == SyncEngineStatus.Synced) {
      return;
    } else {
      return Promise.race([
        new Promise<void>(resolve => {
          this.onStatusChange.on(status => {
            if (status == SyncEngineStatus.Synced) {
              resolve();
            }
          });
        }),
        new Promise((_, reject) => {
          if (abort?.aborted) {
            reject(abort?.reason);
          }
          abort?.addEventListener('abort', () => {
            reject(abort.reason);
          });
        }),
      ]);
    }
  }

  async waitForLoadedRootDoc(abort?: AbortSignal) {
    if (this.status > SyncEngineStatus.LoadingRootDoc) {
      return;
    } else {
      return Promise.race([
        new Promise<void>(resolve => {
          this.onStatusChange.on(status => {
            if (status > SyncEngineStatus.LoadingRootDoc) {
              resolve();
            }
          });
        }),
        new Promise((_, reject) => {
          if (abort?.aborted) {
            reject(abort?.reason);
          }
          abort?.addEventListener('abort', () => {
            reject(abort.reason);
          });
        }),
      ]);
    }
  }
}
