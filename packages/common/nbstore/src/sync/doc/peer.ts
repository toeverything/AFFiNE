import { remove } from 'lodash-es';
import { nanoid } from 'nanoid';
import {
  BehaviorSubject,
  Observable,
  ReplaySubject,
  share,
  Subject,
} from 'rxjs';

import type {
  DocStorage,
  DocSyncStorage,
  DocUpdate,
  PeerWorkspaceState,
} from '../../storage';
import { DummyDocSyncStorage } from '../../storage/dummy/doc-sync';
import { AsyncPriorityQueue } from '../../utils/async-priority-queue';
import { ClockMap } from '../../utils/clock';
import { isEmptyUpdate } from '../../utils/is-empty-update';
import { throwIfAborted } from '../../utils/throw-if-aborted';
import {
  diffUpdate,
  encodeStateVectorFromUpdate,
  mergeUpdates,
} from '../../utils/yjs-codec';
import type { DocSyncState } from './index';

type Job =
  | {
      type: 'connect';
      docId: string;
    }
  | {
      type: 'push';
      docId: string;
      update?: Uint8Array;
      clock: Date;
    }
  | {
      type: 'pull';
      docId: string;
      remoteClock?: Date;
    }
  | {
      type: 'pullAndPush';
      docId: string;
    }
  | {
      type: 'save';
      docId: string;
      update?: Uint8Array;
      remoteClock: Date;
    };

interface Status {
  docs: Set<string>;
  connectedDocs: Set<string>;
  docErrors: Map<string, Error>;
  retryOnLocalUpdate: Set<string>;
  jobDocQueue: AsyncPriorityQueue;
  jobMap: Map<string, Job[]>;
  remoteClocks: ClockMap;
  remoteStateVectors: Map<string, Uint8Array>;
  syncing: boolean;
  retrying: boolean;
  skipped: boolean;
  errorMessage: string | null;
}

interface PeerState {
  total: number;
  syncing: number;
  retrying: boolean;
  synced: boolean;
  errorMessage: string | null;
  error?: DocSyncState['error'];
}

interface PeerDocState {
  syncing: boolean;
  synced: boolean;
  retrying: boolean;
  errorMessage: string | null;
}

interface DocSyncPeerOptions {
  mergeUpdates?: (updates: Uint8Array[]) => Promise<Uint8Array> | Uint8Array;
}

function isRemotePermissionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const name = error.name.toUpperCase();
  return (
    name === 'DOC_ACTION_DENIED' ||
    name === 'SPACE_ACCESS_DENIED' ||
    name === 'ACCESS_DENIED'
  );
}

function isDocScopedError(error: unknown) {
  return (
    isRemotePermissionError(error) ||
    (error instanceof Error && error.message === 'invalid_binary') ||
    (error instanceof Error &&
      (['DOC_NOT_FOUND', 'DOC_UPDATE_INVALID', 'DOC_UPDATE_TOO_LARGE'].includes(
        error.name
      ) ||
        error.name === 'DISK_SOURCE_EXPORT_FAILED' ||
        error.name === 'DISK_SOURCE_REVIEW_REQUIRED'))
  );
}

function isEqualUint8Arrays(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 *
 * @param local - local doc data
 * @param localSv - local doc state vector
 * @param remoteDiff - remote doc data diff with local doc state vector,
 * should calculated by `Y.diffUpdate(remoteDocData, localSv)`
 * @param remoteSv - remote doc state vector
 * @returns null if no diff, otherwise return the diff data
 */
function docDiffUpdate(
  local: Uint8Array,
  localSv: Uint8Array,
  remoteDiff: Uint8Array,
  remoteSv: Uint8Array
) {
  // if localSv is not equal to remoteSv, return the diff data
  if (!isEqualUint8Arrays(localSv, remoteSv)) {
    return diffUpdate(local, remoteSv);
  }

  // localDiff is the deletedSet of local doc
  const localDiff = diffUpdate(local, localSv);

  // if localDiff is equal to remoteDiff, return null, means no diff
  if (isEqualUint8Arrays(localDiff, remoteDiff)) {
    return null;
  } else {
    // otherwise, return the diff data
    return diffUpdate(local, remoteSv);
  }
}

export class DocSyncPeer {
  /**
   * random unique id for recognize self in "update" event
   */
  private readonly uniqueId = `sync:${this.peerId}:${nanoid()}`;
  private readonly prioritySettings = new Map<string, number>();

  readonly syncMetadata: DocSyncStorage;
  readonly workspaceState$ = new BehaviorSubject<PeerWorkspaceState | null>(
    this.remote.workspaceStateScope
      ? { ready: false, cacheToken: 0, docs: [], clocks: {} }
      : null
  );
  private readonly metadataPeer =
    this.remote.workspaceStateScope ?? this.peerId;
  private inventoryRefresh?: Promise<void>;
  private inventoryDirty = false;
  private signal?: AbortSignal;

  private eligible(docId: string) {
    const state = this.workspaceState$.value;
    return (
      !this.remote.workspaceStateScope ||
      docId === this.local.spaceId ||
      this.remote.localReservedDocIds?.includes(docId) ||
      !!state?.docs.some(doc => doc.docId === docId) ||
      (!!state && Object.hasOwn(state.clocks, docId))
    );
  }

  private async readWorkspaceState(signal = this.signal) {
    const state = await this.syncMetadata.getPeerWorkspaceState(
      this.metadataPeer,
      this.local.spaceId
    );
    if (
      signal?.aborted ||
      state.cacheToken <= (this.workspaceState$.value?.cacheToken ?? -1)
    )
      return;
    this.workspaceState$.next(state);
    const allowed = new Set([
      ...state.docs.map(doc => doc.docId),
      ...Object.keys(state.clocks),
      this.local.spaceId,
    ]);
    for (const docId of this.status.docs) {
      if (!this.eligible(docId)) {
        this.status.docs.delete(docId);
        this.status.connectedDocs.delete(docId);
        this.status.jobDocQueue.remove(docId);
        this.status.jobMap.delete(docId);
        this.status.docErrors.delete(docId);
      }
    }
    for (const doc of state.docs)
      this.status.remoteClocks.setIfBigger(doc.docId, new Date(doc.timestamp));
    for (const [docId, timestamp] of Object.entries(state.clocks))
      this.status.remoteClocks.setIfBigger(docId, new Date(timestamp));
    for (const docId of allowed) this.actions.addDoc(docId);
    this.statusUpdatedSubject$.next(true);
  }

  private async revokeWorkspaceState(signal = this.signal) {
    throwIfAborted(signal);
    await this.syncMetadata.invalidatePeerWorkspaceState(
      this.metadataPeer,
      this.local.spaceId
    );
    while (true) {
      const state = await this.syncMetadata.getPeerWorkspaceState(
        this.metadataPeer,
        this.local.spaceId
      );
      if (
        await this.syncMetadata.installPeerWorkspaceState(
          this.metadataPeer,
          this.local.spaceId,
          state.cacheToken,
          { docs: [], clocks: {} }
        )
      )
        break;
    }
    await this.readWorkspaceState(signal);
  }

  async refreshWorkspaceState(invalidate = true) {
    const getWorkspaceState = this.remote.getWorkspaceState?.bind(this.remote);
    if (!this.remote.workspaceStateScope || !getWorkspaceState) return;
    if (invalidate)
      await this.syncMetadata.invalidatePeerWorkspaceState(
        this.metadataPeer,
        this.local.spaceId
      );
    this.inventoryDirty = true;
    if (this.inventoryRefresh) return this.inventoryRefresh;
    const signal = this.signal;
    const refresh = async () => {
      while (this.inventoryDirty) {
        this.inventoryDirty = false;
        throwIfAborted(signal);
        const before = await this.syncMetadata.getPeerWorkspaceState(
          this.metadataPeer,
          this.local.spaceId
        );
        const state = await getWorkspaceState();
        throwIfAborted(signal);
        if (
          !(await this.syncMetadata.installPeerWorkspaceState(
            this.metadataPeer,
            this.local.spaceId,
            before.cacheToken,
            state
          ))
        ) {
          this.inventoryDirty = true;
          continue;
        }
        await this.readWorkspaceState(signal);
      }
    };
    const running = refresh()
      .catch(async error => {
        throwIfAborted(signal);
        if (isRemotePermissionError(error))
          await this.revokeWorkspaceState(signal);
        throw error;
      })
      .finally(() => {
        if (this.inventoryRefresh === running)
          this.inventoryRefresh = undefined;
      });
    this.inventoryRefresh = running;
    return running;
  }

  async createDoc(docId: string) {
    await Promise.all([
      this.local.connection.waitForConnected(),
      this.syncMetadata.connection.waitForConnected(),
    ]);
    const clock = await this.local.pushDocUpdate({
      docId,
      bin: new Uint8Array([0, 0]),
      createForPeer: this.metadataPeer,
    });
    await this.readWorkspaceState();
    return clock;
  }

  private async pushRemote(update: DocUpdate) {
    const creating =
      this.workspaceState$.value?.docs.some(
        doc => doc.docId === update.docId && doc.pendingCreate
      ) ?? false;
    const result = await this.remote.pushDocUpdate(
      { ...update, intent: creating ? 'create' : 'update' },
      this.uniqueId
    );
    if (creating) {
      await this.refreshWorkspaceState();
      await this.syncMetadata.confirmPeerDocCreate(
        this.metadataPeer,
        update.docId
      );
      await this.readWorkspaceState();
    }
    return result;
  }

  constructor(
    readonly peerId: string,
    readonly local: DocStorage,
    syncMetadata: DocSyncStorage,
    readonly remote: DocStorage,
    readonly options: DocSyncPeerOptions = {}
  ) {
    this.syncMetadata =
      remote.syncMetadataScope === 'connection'
        ? new DummyDocSyncStorage()
        : syncMetadata;
  }

  private status: Status = {
    docs: new Set<string>(),
    connectedDocs: new Set<string>(),
    docErrors: new Map<string, Error>(),
    retryOnLocalUpdate: new Set<string>(),
    jobDocQueue: new AsyncPriorityQueue(),
    jobMap: new Map(),
    remoteClocks: new ClockMap(new Map()),
    remoteStateVectors: new Map(),
    syncing: false,
    retrying: false,
    skipped: false,
    errorMessage: null,
  };
  private readonly statusUpdatedSubject$ = new Subject<string | true>();

  private async acknowledgeRemoteSourceUpdate(docId: string) {
    if (!this.remote.acknowledgeDocUpdate) {
      return;
    }
    const local = await this.local.getDoc(docId);
    if (local) {
      await this.remote.acknowledgeDocUpdate(docId, local.bin);
    }
  }

  private async prepareRemoteDoc(docId: string) {
    if (!this.remote.prepareDocImport) {
      return;
    }
    const local = await this.local.getDoc(docId);
    const root = await this.local.getDoc(this.local.spaceId);
    await this.remote.prepareDocImport(
      docId,
      local?.bin ?? null,
      root?.bin ?? null
    );
  }

  private get currentErrorMessage() {
    return (
      this.status.errorMessage ??
      this.status.docErrors.values().next().value?.message ??
      null
    );
  }

  private get currentError(): DocSyncState['error'] {
    const rootError = this.status.docErrors.get(this.local.spaceId);
    const entry = rootError
      ? ([this.local.spaceId, rootError] as const)
      : this.status.docErrors.entries().next().value;
    if (!entry) return undefined;
    const [docId, error] = entry;
    return {
      docId,
      name: error.name,
      data: 'data' in error ? error.data : undefined,
    };
  }

  peerState$ = new Observable<PeerState>(subscribe => {
    const next = () => {
      if (this.status.skipped) {
        subscribe.next({
          total: 0,
          syncing: 0,
          synced: true,
          retrying: false,
          errorMessage: null,
        });
      } else if (!this.status.syncing) {
        // if syncing = false, jobMap is empty
        subscribe.next({
          total: this.status.docs.size,
          syncing: this.status.docs.size,
          synced: false,
          retrying: this.status.retrying,
          errorMessage: this.currentErrorMessage,
          error: this.currentError,
        });
      } else {
        const syncing = this.status.jobMap.size;
        subscribe.next({
          total: this.status.docs.size,
          syncing: syncing,
          retrying: this.status.retrying,
          errorMessage: this.currentErrorMessage,
          error: this.currentError,
          synced: syncing === 0 && this.status.docErrors.size === 0,
        });
      }
    };
    next();
    const dispose = this.statusUpdatedSubject$.subscribe(() => {
      next();
    });
    return () => {
      dispose.unsubscribe();
    };
  }).pipe(
    share({
      connector: () => new ReplaySubject(1),
    })
  );

  docState$(docId: string) {
    return new Observable<PeerDocState>(subscribe => {
      const next = () => {
        const docErrorMessage =
          this.status.docErrors.get(docId)?.message ?? null;
        if (this.status.skipped) {
          subscribe.next({
            syncing: false,
            synced: true,
            retrying: false,
            errorMessage: null,
          });
          return;
        }
        subscribe.next({
          syncing:
            !docErrorMessage &&
            (!this.status.connectedDocs.has(docId) ||
              this.status.jobMap.has(docId)),
          synced:
            !docErrorMessage &&
            this.status.connectedDocs.has(docId) &&
            !this.status.jobMap.has(docId),
          retrying: this.status.retrying,
          errorMessage: docErrorMessage ?? this.status.errorMessage,
        });
      };
      next();
      return this.statusUpdatedSubject$.subscribe(updatedId => {
        if (updatedId === true || updatedId === docId) next();
      });
    });
  }

  private readonly jobs = {
    connect: async (docId: string, signal?: AbortSignal) => {
      if (
        this.workspaceState$.value?.docs.some(
          doc => doc.docId === docId && doc.pendingCreate
        )
      ) {
        const local = await this.local.getDoc(docId);
        if (local) {
          const { timestamp } = await this.pushRemote({
            docId,
            bin: local.bin,
          });
          await this.syncMetadata.setPeerPushedClock(this.metadataPeer, {
            docId,
            timestamp: local.timestamp,
          });
          this.status.remoteClocks.setIfBigger(docId, timestamp);
          this.status.connectedDocs.add(docId);
        }
        return;
      }
      await this.prepareRemoteDoc(docId);
      const pushedClock =
        (await this.syncMetadata.getPeerPushedClock(this.metadataPeer, docId))
          ?.timestamp ?? null;
      const clock = await this.local.getDocTimestamp(docId);
      const remoteClock = this.status.remoteClocks.get(docId);

      throwIfAborted(signal);
      if (
        !this.remote.isReadonly &&
        clock &&
        (pushedClock === null ||
          pushedClock.getTime() < clock.timestamp.getTime())
      ) {
        await this.jobs.pullAndPush(docId, signal);
      } else {
        // no need to push
        const pulled =
          (
            await this.syncMetadata.getPeerPulledRemoteClock(
              this.metadataPeer,
              docId
            )
          )?.timestamp ?? null;
        const hasRemoteClock = remoteClock.getTime() > 0;
        const hasPulled = pulled !== null && pulled.getTime() > 0;
        if (
          hasRemoteClock
            ? !hasPulled ||
              (pulled !== null && pulled.getTime() < remoteClock.getTime())
            : (this.prioritySettings.get(docId) ?? 0) > 0 &&
              (!clock || !hasPulled)
        ) {
          await this.jobs.pull(docId, signal);
        }
      }

      this.status.connectedDocs.add(docId);
      this.statusUpdatedSubject$.next(docId);
    },
    push: async (
      docId: string,
      jobs: (Job & { type: 'push' })[],
      signal?: AbortSignal
    ) => {
      if (this.status.connectedDocs.has(docId) && !this.remote.isReadonly) {
        const maxClock = jobs.reduce(
          (a, b) => (a.getTime() > b.clock.getTime() ? a : b.clock),
          new Date(0)
        );

        if (jobs.some(job => job.update && !isEmptyUpdate(job.update))) {
          const local = await this.local.getDoc(docId);
          if (local) {
            const remoteState = this.status.remoteStateVectors.get(docId);
            const update = remoteState
              ? diffUpdate(local.bin, remoteState)
              : local.bin;
            if (!isEmptyUpdate(update)) {
              const { timestamp } = await this.pushRemote({
                docId,
                bin: update,
              });
              this.schedule({ type: 'save', docId, remoteClock: timestamp });
            }
            this.status.remoteStateVectors.set(
              docId,
              encodeStateVectorFromUpdate(local.bin)
            );
            await this.syncMetadata.setPeerPushedClock(this.metadataPeer, {
              docId,
              timestamp: local.timestamp,
            });
            return;
          }
        }
        throwIfAborted(signal);
        await this.syncMetadata.setPeerPushedClock(this.metadataPeer, {
          docId,
          timestamp: maxClock,
        });
      }
    },
    pullAndPush: async (docId: string, signal?: AbortSignal) => {
      const localDocRecord = await this.local.getDoc(docId);

      const stateVector =
        localDocRecord && !isEmptyUpdate(localDocRecord.bin)
          ? encodeStateVectorFromUpdate(localDocRecord.bin)
          : new Uint8Array();
      const remoteDocRecord = await this.remote.getDocDiff(docId, stateVector);

      if (remoteDocRecord) {
        const {
          missing: newData,
          state: serverStateVector,
          timestamp: remoteClock,
        } = remoteDocRecord;
        this.status.remoteStateVectors.set(docId, serverStateVector);
        throwIfAborted(signal);
        const { timestamp: localClock } = await this.local.pushDocUpdate(
          {
            bin: newData,
            docId,
          },
          this.uniqueId
        );
        await this.acknowledgeRemoteSourceUpdate(docId);
        throwIfAborted(signal);
        await this.syncMetadata.setPeerPulledRemoteClock(this.metadataPeer, {
          docId,
          timestamp: remoteClock,
        });
        const diff =
          localDocRecord && serverStateVector && serverStateVector.length > 0
            ? docDiffUpdate(
                localDocRecord.bin,
                encodeStateVectorFromUpdate(localDocRecord.bin),
                newData,
                serverStateVector
              )
            : localDocRecord?.bin;
        if (diff && !isEmptyUpdate(diff)) {
          throwIfAborted(signal);
          const { timestamp: remoteClock } = await this.pushRemote({
            bin: diff,
            docId,
          });
          this.schedule({
            type: 'save',
            docId,
            remoteClock,
          });
        }
        throwIfAborted(signal);
        this.schedule({ type: 'push', docId, clock: localClock });
      } else {
        if (localDocRecord) {
          await this.acknowledgeRemoteSourceUpdate(docId);
          if (!isEmptyUpdate(localDocRecord.bin)) {
            throwIfAborted(signal);
            const { timestamp: remoteClock } = await this.pushRemote({
              bin: localDocRecord.bin,
              docId,
            });
            this.schedule({
              type: 'save',
              docId,
              remoteClock,
            });
          }
          this.schedule({
            type: 'push',
            docId,
            clock: localDocRecord.timestamp,
          });
          await this.syncMetadata.setPeerPushedClock(this.metadataPeer, {
            docId,
            timestamp: localDocRecord.timestamp,
          });
        }
      }
      this.status.connectedDocs.add(docId);
    },
    pull: async (docId: string, signal?: AbortSignal) => {
      await this.prepareRemoteDoc(docId);
      const docRecord = await this.local.getDoc(docId);

      const stateVector =
        docRecord && !isEmptyUpdate(docRecord.bin)
          ? encodeStateVectorFromUpdate(docRecord.bin)
          : new Uint8Array();
      const serverDoc = await this.remote.getDocDiff(docId, stateVector);
      if (!serverDoc) {
        await this.acknowledgeRemoteSourceUpdate(docId);
        return;
      }
      const { missing: newData, timestamp: remoteClock } = serverDoc;
      this.status.remoteStateVectors.set(docId, serverDoc.state);
      throwIfAborted(signal);
      const { timestamp } = await this.local.pushDocUpdate(
        {
          docId,
          bin: newData,
        },
        this.uniqueId
      );
      await this.acknowledgeRemoteSourceUpdate(docId);
      throwIfAborted(signal);
      await this.syncMetadata.setPeerPulledRemoteClock(this.metadataPeer, {
        docId,
        timestamp: remoteClock,
      });
      this.schedule({ type: 'push', docId, clock: timestamp });
    },
    save: async (
      docId: string,
      jobs: (Job & { type: 'save' })[],
      signal?: AbortSignal
    ) => {
      const remoteClock = jobs.reduce(
        (a, b) => (a.getTime() > b.remoteClock.getTime() ? a : b.remoteClock),
        new Date(0)
      );
      if (this.status.docs.has(docId)) {
        const data = jobs
          .map(j => j.update)
          .filter((update): update is Uint8Array =>
            update ? !isEmptyUpdate(update) : false
          );
        const update =
          data.length > 0 ? await this.mergeUpdates(data) : new Uint8Array();

        throwIfAborted(signal);
        if (!isEmptyUpdate(update)) {
          const { timestamp } = await this.local.pushDocUpdate(
            {
              docId,
              bin: update,
            },
            this.uniqueId
          );
          await this.acknowledgeRemoteSourceUpdate(docId);

          // schedule push job to mark the timestamp as pushed timestamp
          this.schedule({ type: 'push', docId, clock: timestamp });
        }
        throwIfAborted(signal);

        await this.syncMetadata.setPeerPulledRemoteClock(this.metadataPeer, {
          docId,
          timestamp: remoteClock,
        });
      }
    },
  };

  private readonly actions = {
    updateRemoteClock: (docId: string, remoteClock: Date) => {
      if (this.status.docErrors.has(docId)) {
        return;
      }
      this.status.remoteClocks.setIfBigger(docId, remoteClock);
      this.statusUpdatedSubject$.next(docId);
    },
    addDoc: (docId: string) => {
      if (this.eligible(docId) && !this.status.docs.has(docId)) {
        this.status.docs.add(docId);
        this.statusUpdatedSubject$.next(docId);
        this.schedule({ type: 'connect', docId });
      }
    },
  };

  readonly events = {
    localUpdated: ({
      docId,
      update,
      clock,
    }: {
      docId: string;
      update: Uint8Array;
      clock: Date;
    }) => {
      if (this.status.retryOnLocalUpdate.delete(docId)) {
        this.status.docErrors.delete(docId);
        this.schedule({ type: 'connect', docId });
        return;
      }
      if (this.status.docErrors.has(docId)) {
        return;
      }

      if (!this.eligible(docId)) return;
      this.actions.addDoc(docId);

      this.schedule({
        type: 'push',
        docId,
        clock,
        update,
      });
    },
    remoteUpdated: ({
      docId,
      update,
      remoteClock,
      origin,
    }: {
      docId: string;
      update: Uint8Array;
      remoteClock: Date;
      origin?: string;
    }) => {
      if (
        origin === 'disk:source-discovered' &&
        this.status.retryOnLocalUpdate.delete(docId)
      ) {
        this.status.docErrors.delete(docId);
        this.schedule({ type: 'connect', docId });
        return;
      }
      const error = this.status.docErrors.get(docId);
      if (error && isRemotePermissionError(error)) {
        return;
      }

      this.status.remoteClocks.setIfBigger(docId, remoteClock);
      if (!this.eligible(docId)) return;
      this.actions.addDoc(docId);

      if (isEmptyUpdate(update)) {
        this.schedule({ type: 'pull', docId, remoteClock });
      } else {
        this.schedule({
          type: 'save',
          docId,
          remoteClock: remoteClock,
          update,
        });
      }
    },
  };

  async mainLoop(signal?: AbortSignal) {
    this.signal = signal;
    if (this.remote.workspaceStateScope) {
      await Promise.all([
        this.local.connection.waitForConnected(signal),
        this.syncMetadata.connection.waitForConnected(signal),
      ]);
      await this.readWorkspaceState();
    }
    while (true) {
      let shouldRetry = true;
      try {
        await this.retryLoop(signal);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        shouldRetry = !isRemotePermissionError(err);
        if (!shouldRetry && this.remote.workspaceStateScope)
          await this.revokeWorkspaceState(signal);
        console.warn(
          shouldRetry
            ? 'Sync error, retry in 5s'
            : 'Sync stopped due to remote permission error',
          err
        );
        this.status.errorMessage =
          err instanceof Error ? err.message : `${err}`;
        this.status.retrying = shouldRetry;
        this.statusUpdatedSubject$.next(true);
      } finally {
        // reset all status
        this.status = {
          docs: new Set(),
          connectedDocs: new Set(),
          docErrors: new Map(),
          retryOnLocalUpdate: new Set(),
          jobDocQueue: new AsyncPriorityQueue(),
          jobMap: new Map(),
          remoteClocks: new ClockMap(new Map()),
          remoteStateVectors: new Map(),
          syncing: false,
          skipped: false,
          // tell ui to show retrying status
          retrying: shouldRetry,
          // error message from last retry
          errorMessage: this.status.errorMessage,
        };
        this.statusUpdatedSubject$.next(true);
      }
      if (!shouldRetry) {
        return;
      }
      // wait for 5s before next retry
      await Promise.race([
        new Promise<void>(resolve => {
          setTimeout(resolve, 5000);
        }),
        new Promise((_, reject) => {
          // exit if manually stopped
          if (signal?.aborted) {
            reject(signal.reason);
          }
          signal?.addEventListener('abort', () => {
            reject(signal.reason);
          });
        }),
      ]);
    }
  }

  private async retryLoop(signal?: AbortSignal) {
    throwIfAborted(signal);
    if (this.local.isReadonly) {
      // Local is readonly, skip sync
      this.status.skipped = true;
      this.statusUpdatedSubject$.next(true);
      await new Promise((_, reject) => {
        signal?.addEventListener('abort', reason => {
          reject(reason);
        });
      });
      return;
    }
    const abort = new AbortController();

    signal?.addEventListener('abort', reason => {
      abort.abort(reason);
    });

    signal = abort.signal;

    const disposes: (() => void)[] = [];

    try {
      // wait for all storages to connect, timeout after 30s
      await Promise.race([
        Promise.all([
          this.local.connection.waitForConnected(signal),
          this.remote.connection.waitForConnected(signal),
          this.syncMetadata.connection.waitForConnected(signal),
        ]),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Connect to remote timeout'));
          }, 1000 * 30);
        }),
        new Promise((_, reject) => {
          signal?.addEventListener('abort', reason => {
            reject(reason);
          });
        }),
      ]);

      console.info('Remote sync started');
      this.status.syncing = true;
      this.statusUpdatedSubject$.next(true);

      // throw error if failed to connect
      for (const storage of [this.remote, this.local, this.syncMetadata]) {
        // abort if disconnected
        disposes.push(
          storage.connection.onStatusChanged((_status, error) => {
            abort.abort('Storage disconnected:' + error);
          })
        );
      }

      // reset retrying flag after connected with server
      this.status.retrying = false;
      this.status.errorMessage = null;
      this.statusUpdatedSubject$.next(true);

      // subscribe local doc updates
      disposes.push(
        this.local.subscribeDocUpdate((update, origin) => {
          if (
            origin === this.uniqueId ||
            origin?.startsWith(
              `sync:${this.peerId}:`
              // skip if peerId is same
            )
          ) {
            return;
          }
          const changed = () =>
            this.events.localUpdated({
              docId: update.docId,
              clock: update.timestamp,
              update: update.bin,
            });
          if (update.createForPeer === this.metadataPeer) {
            this.readWorkspaceState()
              .then(changed)
              .catch(error => abort.abort(error));
          } else changed();
        })
      );
      // subscribe remote doc updates
      disposes.push(
        this.remote.subscribeDocUpdate(({ bin, docId, timestamp }, origin) => {
          if (origin === this.uniqueId) {
            return;
          }
          this.events.remoteUpdated({
            docId,
            update: bin,
            remoteClock: timestamp,
            origin,
          });
        })
      );

      if (this.remote.workspaceStateScope) {
        await this.readWorkspaceState();
        const dispose = this.remote.subscribeWorkspaceStateInvalidation?.(
          () => {
            this.refreshWorkspaceState().catch(error => abort.abort(error));
          }
        );
        if (dispose) disposes.push(dispose);
        await this.refreshWorkspaceState();
        const localClocks = await this.local.getDocTimestamps();
        for (const docId of this.remote.localReservedDocIds ?? []) {
          if (Object.hasOwn(localClocks, docId)) this.actions.addDoc(docId);
        }
      } else {
        // add all docs from local
        const localDocs = Object.keys(await this.local.getDocTimestamps());
        throwIfAborted(signal);
        for (const docId of localDocs) {
          this.actions.addDoc(docId);
        }

        const cachedClocks = await this.syncMetadata.getPeerRemoteClocks(
          this.peerId
        );
        this.status.remoteClocks.clear();
        throwIfAborted(signal);
        for (const [id, v] of Object.entries(cachedClocks)) {
          this.status.remoteClocks.set(id, v);
        }
        this.statusUpdatedSubject$.next(true);

        const newClocks = await this.remote.getDocTimestamps(
          this.remote.syncMetadataScope === 'connection'
            ? undefined
            : this.status.remoteClocks.max
        );
        for (const [id, v] of Object.entries(newClocks)) {
          this.status.remoteClocks.setIfBigger(id, v);
        }
        this.statusUpdatedSubject$.next(true);

        for (const [id, v] of Object.entries(newClocks)) {
          await this.syncMetadata.setPeerRemoteClock(this.metadataPeer, {
            docId: id,
            timestamp: v,
          });
        }

        // add all docs from remote
        for (const docId of this.status.remoteClocks.keys()) {
          this.actions.addDoc(docId);
        }
        for (const [docId, priority] of this.prioritySettings) {
          if (priority > 0) {
            this.actions.addDoc(docId);
          }
        }
      }

      // begin to process jobs

      while (true) {
        throwIfAborted(signal);

        const docId = await this.status.jobDocQueue.asyncPop(undefined, signal);

        while (true) {
          // batch process jobs for the same doc
          const jobs = this.status.jobMap.get(docId);
          if (!jobs || jobs.length === 0) {
            this.status.jobMap.delete(docId);
            this.statusUpdatedSubject$.next(docId);
            break;
          }

          const save = remove(jobs, j => j.type === 'save');
          if (save && save.length > 0) {
            if (
              !(await this.runRemoteDocJob(docId, () =>
                this.jobs.save(
                  docId,
                  save as (Job & { type: 'save' })[],
                  signal
                )
              ))
            )
              break;
            continue;
          }
          const pull = remove(jobs, j => j.type === 'pull');
          if (pull && pull.length > 0) {
            if (
              !(await this.runRemoteDocJob(docId, () =>
                this.jobs.pull(docId, signal)
              ))
            ) {
              break;
            }
            continue;
          }

          const connect = remove(jobs, j => j.type === 'connect');
          if (connect && connect.length > 0) {
            if (
              !(await this.runRemoteDocJob(docId, () =>
                this.jobs.connect(docId, signal)
              ))
            ) {
              break;
            }
            continue;
          }

          const pullAndPush = remove(jobs, j => j.type === 'pullAndPush');
          if (pullAndPush && pullAndPush.length > 0) {
            if (
              !(await this.runRemoteDocJob(docId, () =>
                this.jobs.pullAndPush(docId, signal)
              ))
            ) {
              break;
            }
            continue;
          }

          const push = remove(jobs, j => j.type === 'push');
          if (push && push.length > 0) {
            if (
              !(await this.runRemoteDocJob(docId, () =>
                this.jobs.push(
                  docId,
                  push as (Job & { type: 'push' })[],
                  signal
                )
              ))
            ) {
              break;
            }
            continue;
          }
        }
      }
    } finally {
      for (const dispose of disposes) {
        dispose();
      }
      this.status.syncing = false;
      console.info('Remote sync ended');
    }
  }

  private async runRemoteDocJob(docId: string, job: () => Promise<void>) {
    try {
      await job();
      return true;
    } catch (error) {
      if (!isDocScopedError(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn('Sync paused for doc', {
        docId,
        error,
      });
      this.status.docErrors.set(
        docId,
        error instanceof Error ? error : new Error(message)
      );
      if (
        error instanceof Error &&
        (error.name === 'DISK_SOURCE_EXPORT_FAILED' ||
          error.name === 'DISK_SOURCE_REVIEW_REQUIRED')
      ) {
        this.status.retryOnLocalUpdate.add(docId);
      }
      const pending = this.status.jobMap.get(docId) ?? [];
      remove(pending, job => job.type !== 'pull' && job.type !== 'save');
      this.status.connectedDocs.delete(docId);
      this.statusUpdatedSubject$.next(docId);
      this.statusUpdatedSubject$.next(true);
      return false;
    }
  }

  private schedule(job: Job) {
    if (!this.eligible(job.docId)) return;
    if (
      this.status.docErrors.has(job.docId) &&
      (job.type === 'connect' ||
        job.type === 'push' ||
        job.type === 'pullAndPush')
    ) {
      return;
    }

    const priority = this.getJobPriority(job.docId);
    this.status.jobDocQueue.push(job.docId, priority);

    const existingJobs = this.status.jobMap.get(job.docId) ?? [];
    existingJobs.push(job);
    this.status.jobMap.set(job.docId, existingJobs);
    this.statusUpdatedSubject$.next(job.docId);
  }

  private getJobPriority(docId: string) {
    return this.prioritySettings.get(docId) ?? 0;
  }

  addPriority(id: string, priority: number) {
    const oldPriority = this.prioritySettings.get(id) ?? 0;
    const newPriority = oldPriority + priority;
    this.prioritySettings.set(id, newPriority);
    this.status.jobDocQueue.setPriority(id, this.getJobPriority(id));
    if (oldPriority <= 0 && newPriority > 0 && this.status.syncing) {
      if (!this.status.docs.has(id)) {
        this.actions.addDoc(id);
      } else {
        this.schedule({ type: 'connect', docId: id });
      }
    }

    return () => {
      const currentPriority = this.prioritySettings.get(id) ?? 0;
      const restoredPriority = currentPriority - priority;
      this.prioritySettings.set(id, restoredPriority);
      this.status.jobDocQueue.setPriority(id, this.getJobPriority(id));
    };
  }

  protected mergeUpdates = (updates: Uint8Array[]) => {
    return mergeUpdates(
      updates.filter(bin => !isEmptyUpdate(bin)),
      this.options?.mergeUpdates
    );
  };
}
