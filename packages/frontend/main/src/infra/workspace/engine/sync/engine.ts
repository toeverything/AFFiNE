import { DebugLogger } from '@affine/debug';
import { Slot } from '@blocksuite/global/utils';
import type { Doc } from 'yjs';

import { createIdentifier } from '../../../di';
import { SharedPriorityTarget } from '../../../utils/async-queue';
import { MANUALLY_STOP, throwIfAborted } from '../../../utils/throw-if-aborted';
import { SyncEngineStep, SyncPeerStep } from './consts';
import { SyncPeer, type SyncPeerStatus } from './peer';
import { type SyncStorage } from './storage';

export interface SyncEngineStatus {
  step: SyncEngineStep;
  local: SyncPeerStatus | null;
  remotes: (SyncPeerStatus | null)[];
  retrying: boolean;
}

export const LocalSyncStorage =
  createIdentifier<SyncStorage>('LocalSyncStorage');

export const RemoteSyncStorage =
  createIdentifier<SyncStorage>('RemoteSyncStorage');

/**
 * # SyncEngine
 *
 * ```
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
 * ```
 *
 * Sync engine manage sync peers
 *
 * Sync steps:
 * 1. start local sync
 * 2. wait for local sync complete
 * 3. start remote sync
 * 4. continuously sync local and remote
 */
export class SyncEngine {
  get rootDocId() {
    return this.rootDoc.guid;
  }

  logger = new DebugLogger('affine:sync-engine:' + this.rootDocId);
  private _status: SyncEngineStatus;
  onStatusChange = new Slot<SyncEngineStatus>();
  private set status(s: SyncEngineStatus) {
    this.logger.debug('status change', s);
    this._status = s;
    this.onStatusChange.emit(s);
  }

  priorityTarget = new SharedPriorityTarget();

  get status() {
    return this._status;
  }

  private abort = new AbortController();

  constructor(
    private readonly rootDoc: Doc,
    private readonly local: SyncStorage,
    private readonly remotes: SyncStorage[]
  ) {
    this._status = {
      step: SyncEngineStep.Stopped,
      local: null,
      remotes: remotes.map(() => null),
      retrying: false,
    };
  }

  start() {
    if (this.status.step !== SyncEngineStep.Stopped) {
      this.forceStop();
    }
    this.abort = new AbortController();

    this.sync(this.abort.signal).catch(err => {
      // should never reach here
      this.logger.error(err);
    });
  }

  canGracefulStop() {
    return !!this.status.local && this.status.local.pendingPushUpdates === 0;
  }

  async waitForGracefulStop(abort?: AbortSignal) {
    await Promise.race([
      new Promise((_, reject) => {
        if (abort?.aborted) {
          reject(abort?.reason);
        }
        abort?.addEventListener('abort', () => {
          reject(abort.reason);
        });
      }),
      new Promise<void>(resolve => {
        this.onStatusChange.on(() => {
          if (this.canGracefulStop()) {
            resolve();
          }
        });
      }),
    ]);
    throwIfAborted(abort);
    this.forceStop();
  }

  forceStop() {
    this.abort.abort(MANUALLY_STOP);
    this._status = {
      step: SyncEngineStep.Stopped,
      local: null,
      remotes: this.remotes.map(() => null),
      retrying: false,
    };
  }

  // main sync process, should never return until abort
  async sync(signal: AbortSignal) {
    const state: {
      localPeer: SyncPeer | null;
      remotePeers: (SyncPeer | null)[];
    } = {
      localPeer: null,
      remotePeers: this.remotes.map(() => null),
    };

    const cleanUp: (() => void)[] = [];
    try {
      // Step 1: start local sync peer
      state.localPeer = new SyncPeer(
        this.rootDoc,
        this.local,
        this.priorityTarget
      );

      cleanUp.push(
        state.localPeer.onStatusChange.on(() => {
          if (!signal.aborted)
            this.updateSyncingState(state.localPeer, state.remotePeers);
        }).dispose
      );

      this.updateSyncingState(state.localPeer, state.remotePeers);

      // Step 2: wait for local sync complete
      await state.localPeer.waitForLoaded(signal);

      // Step 3: start remote sync peer
      state.remotePeers = this.remotes.map(remote => {
        const peer = new SyncPeer(this.rootDoc, remote, this.priorityTarget);
        cleanUp.push(
          peer.onStatusChange.on(() => {
            if (!signal.aborted)
              this.updateSyncingState(state.localPeer, state.remotePeers);
          }).dispose
        );
        return peer;
      });

      this.updateSyncingState(state.localPeer, state.remotePeers);

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
      if (error === MANUALLY_STOP || signal.aborted) {
        return;
      }
      throw error;
    } finally {
      // stop peers
      state.localPeer?.stop();
      for (const remotePeer of state.remotePeers) {
        remotePeer?.stop();
      }
      for (const clean of cleanUp) {
        clean();
      }
    }
  }

  updateSyncingState(local: SyncPeer | null, remotes: (SyncPeer | null)[]) {
    let step = SyncEngineStep.Synced;
    const allPeer = [local, ...remotes];
    for (const peer of allPeer) {
      if (!peer || peer.status.step !== SyncPeerStep.Synced) {
        step = SyncEngineStep.Syncing;
        break;
      }
    }
    this.status = {
      step,
      local: local?.status ?? null,
      remotes: remotes.map(peer => peer?.status ?? null),
      retrying: allPeer.some(
        peer => peer?.status.step === SyncPeerStep.Retrying
      ),
    };
  }

  async waitForSynced(abort?: AbortSignal) {
    if (this.status.step === SyncEngineStep.Synced) {
      return;
    } else {
      return Promise.race([
        new Promise<void>(resolve => {
          this.onStatusChange.on(status => {
            if (status.step === SyncEngineStep.Synced) {
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
    function isLoadedRootDoc(status: SyncEngineStatus) {
      return ![status.local, ...status.remotes].some(
        peer => !peer || peer.step <= SyncPeerStep.LoadingRootDoc
      );
    }
    if (isLoadedRootDoc(this.status)) {
      return;
    } else {
      return Promise.race([
        new Promise<void>(resolve => {
          this.onStatusChange.on(status => {
            if (isLoadedRootDoc(status)) {
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

  setPriorityRule(target: ((id: string) => boolean) | null) {
    this.priorityTarget.priorityRule = target;
  }
}
