import {
  BehaviorSubject,
  combineLatest,
  filter,
  first,
  lastValueFrom,
  map,
  Observable,
  of,
  ReplaySubject,
  share,
  switchMap,
  throttleTime,
} from 'rxjs';

import type { DocStorage, DocSyncStorage } from '../../storage';
import { DummyDocStorage } from '../../storage/dummy/doc';
import { DummyDocSyncStorage } from '../../storage/dummy/doc-sync';
import { takeUntilAbort } from '../../utils/take-until-abort';
import { MANUALLY_STOP } from '../../utils/throw-if-aborted';
import type { PeerStorageOptions } from '../types';
import { DocSyncPeer } from './peer';

export interface DocSyncState {
  total: number;
  syncing: number;
  synced: boolean;
  retrying: boolean;
  errorMessage: string | null;
}

export interface DocSyncDocState {
  synced: boolean;
  syncing: boolean;
  retrying: boolean;
  errorMessage: string | null;
}

const RESET_SYNC_CONNECT_TIMEOUT_MS = 30_000;

export interface DocSync {
  readonly state$: Observable<DocSyncState>;
  docState$(docId: string): Observable<DocSyncDocState>;
  waitForSynced(docId?: string, abort?: AbortSignal): Promise<void>;
  addPriority(id: string, priority: number): () => void;
  resetSync(): Promise<void>;
}

export class DocSyncImpl implements DocSync {
  private readonly peers$ = new BehaviorSubject<DocSyncPeer[]>([]);
  private get peers() {
    return this.peers$.value;
  }

  setRemotes(remotes: Record<string, DocStorage>) {
    this.storages.remotes = remotes;
    this.peers$.next(
      Object.entries(remotes).map(
        ([id, remote]) =>
          this.peers.find(
            peer => peer.peerId === id && peer.remote === remote
          ) ?? new DocSyncPeer(id, this.storages.local, this.sync, remote)
      )
    );
  }
  private abort: AbortController | null = null;
  private running: Promise<void> = Promise.resolve();
  private resetting: Promise<void> | null = null;

  private readonly _state$ = this.peers$.pipe(
    switchMap(peers =>
      peers.length ? combineLatest(peers.map(peer => peer.peerState$)) : of([])
    ),
    map(allPeers =>
      allPeers.length === 0
        ? {
            total: 0,
            syncing: 0,
            synced: true,
            retrying: false,
            errorMessage: null,
          }
        : {
            total: allPeers.reduce((acc, peer) => Math.max(acc, peer.total), 0),
            syncing: allPeers.reduce(
              (acc, peer) => Math.max(acc, peer.syncing),
              0
            ),
            synced: allPeers.every(peer => peer.synced),
            retrying: allPeers.some(peer => peer.retrying),
            errorMessage:
              allPeers.find(peer => peer.errorMessage)?.errorMessage ?? null,
          }
    ),
    share({
      connector: () => new ReplaySubject(1),
    })
  ) as Observable<DocSyncState>;

  state$ = this._state$.pipe(
    // throttle the state to 1 second to avoid spamming the UI
    throttleTime(1000, undefined, {
      leading: true,
      trailing: true,
    })
  );

  constructor(
    readonly storages: PeerStorageOptions<DocStorage>,
    readonly sync: DocSyncStorage
  ) {
    this.setRemotes(storages.remotes);
  }

  /**
   * for testing
   */
  static get dummy() {
    return new DocSyncImpl(
      {
        local: new DummyDocStorage(),
        remotes: {},
      },
      new DummyDocSyncStorage()
    );
  }

  private _docState$(docId: string): Observable<DocSyncDocState> {
    return this.peers$.pipe(
      switchMap(peers =>
        peers.length
          ? combineLatest(peers.map(peer => peer.docState$(docId)))
          : of([])
      ),
      map(allPeers => {
        return {
          errorMessage:
            allPeers.find(peer => peer.errorMessage)?.errorMessage ?? null,
          retrying: allPeers.some(peer => peer.retrying),
          syncing: allPeers.some(peer => peer.syncing),
          synced: allPeers.every(peer => peer.synced),
        };
      })
    );
  }

  docState$(docId: string): Observable<DocSyncDocState> {
    return this._docState$(docId).pipe(
      // throttle the state to 1 second to avoid spamming the UI
      throttleTime(1000, undefined, {
        leading: true,
        trailing: true,
      })
    );
  }

  async waitForSynced(docId?: string, abort?: AbortSignal): Promise<void> {
    const source$: Observable<DocSyncDocState | DocSyncState> = docId
      ? this._docState$(docId)
      : this._state$;
    await lastValueFrom(
      source$.pipe(
        filter(state => state.synced),
        takeUntilAbort(abort),
        first()
      )
    );
  }

  start() {
    if (this.abort) {
      this.abort.abort(MANUALLY_STOP);
    }
    const previous = this.running;
    const abort = new AbortController();
    this.abort = abort;
    this.running = previous.then(async () => {
      if (abort.signal.aborted) {
        return;
      }
      await Promise.allSettled(
        this.peers.map(peer => peer.mainLoop(abort.signal))
      );
    });
  }

  stop() {
    this.abort?.abort(MANUALLY_STOP);
    this.abort = null;
    return this.running;
  }

  addPriority(id: string, priority: number) {
    const subscription = this.peers$
      .pipe(
        switchMap(
          peers =>
            new Observable(() => {
              const undo = peers.map(peer => peer.addPriority(id, priority));
              return () => undo.forEach(dispose => dispose());
            })
        )
      )
      .subscribe();
    return () => subscription.unsubscribe();
  }

  resetSync() {
    if (this.resetting) {
      return this.resetting;
    }
    const resetting = this.performReset().finally(() => {
      if (this.resetting === resetting) {
        this.resetting = null;
      }
    });
    this.resetting = resetting;
    return resetting;
  }

  private async performReset() {
    const running = this.abort !== null;
    const shouldConnectSyncStorage =
      this.sync.connection.status === 'idle' ||
      this.sync.connection.status === 'closed';
    await this.stop();
    if (shouldConnectSyncStorage) {
      this.sync.connection.connect();
    }
    const abort = new AbortController();
    const timeoutId = setTimeout(() => {
      abort.abort(new Error('Connect to remote timeout'));
    }, RESET_SYNC_CONNECT_TIMEOUT_MS) as ReturnType<typeof setTimeout> & {
      unref?: () => void;
    };
    timeoutId.unref?.();
    try {
      await this.sync.connection.waitForConnected(abort.signal);
      await this.sync.clearClocks();
    } catch (error) {
      console.error('Failed to reset sync', error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (running) {
        this.start();
      } else if (shouldConnectSyncStorage) {
        this.sync.connection.disconnect();
      }
    }
  }
}
