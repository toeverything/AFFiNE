import { remove } from 'lodash-es';
import { nanoid } from 'nanoid';
import { Observable, ReplaySubject, share, Subject } from 'rxjs';
import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';

import type { DocStorage, DocSyncStorage } from '../../storage';
import { AsyncPriorityQueue } from '../../utils/async-priority-queue';
import { ClockMap } from '../../utils/clock';
import { isEmptyUpdate } from '../../utils/is-empty-update';
import { throwIfAborted } from '../../utils/throw-if-aborted';

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
  jobDocQueue: AsyncPriorityQueue;
  jobMap: Map<string, Job[]>;
  remoteClocks: ClockMap;
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

function createJobErrorCatcher<
  Jobs extends Record<string, (docId: string, ...args: any[]) => Promise<void>>,
>(jobs: Jobs): Jobs {
  return Object.fromEntries(
    Object.entries(jobs).map(([k, fn]) => {
      return [
        k,
        async (docId, ...args) => {
          try {
            await fn(docId, ...args);
          } catch (err) {
            if (err instanceof Error) {
              throw new Error(
                `Error in job "${k}": ${err.stack || err.message}`
              );
            } else {
              throw err;
            }
          }
        },
      ];
    })
  ) as Jobs;
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

  constructor(
    readonly peerId: string,
    readonly local: DocStorage,
    readonly syncMetadata: DocSyncStorage,
    readonly remote: DocStorage,
    readonly options: DocSyncPeerOptions = {}
  ) {}

  private status: Status = {
    docs: new Set<string>(),
    connectedDocs: new Set<string>(),
    jobDocQueue: new AsyncPriorityQueue(),
    jobMap: new Map(),
    remoteClocks: new ClockMap(new Map()),
    syncing: false,
    retrying: false,
    skipped: false,
    errorMessage: null,
  };
  private readonly statusUpdatedSubject$ = new Subject<string | true>();

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
          errorMessage: this.status.errorMessage,
        });
      } else {
        const syncing = this.status.jobMap.size;
        subscribe.next({
          total: this.status.docs.size,
          syncing: syncing,
          retrying: this.status.retrying,
          errorMessage: this.status.errorMessage,
          synced: syncing === 0,
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
        if (this.status.skipped) {
          subscribe.next({
            syncing: false,
            synced: true,
            retrying: false,
            errorMessage: null,
          });
        }
        subscribe.next({
          syncing:
            !this.status.connectedDocs.has(docId) ||
            this.status.jobMap.has(docId),
          synced: !this.status.jobMap.has(docId),
          retrying: this.status.retrying,
          errorMessage: this.status.errorMessage,
        });
      };
      next();
      return this.statusUpdatedSubject$.subscribe(updatedId => {
        if (updatedId === true || updatedId === docId) next();
      });
    });
  }

  private readonly jobs = createJobErrorCatcher({
    connect: async (docId: string, signal?: AbortSignal) => {
      const pushedClock =
        (await this.syncMetadata.getPeerPushedClock(this.peerId, docId))
          ?.timestamp ?? null;
      const clock = await this.local.getDocTimestamp(docId);

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
          (await this.syncMetadata.getPeerPulledRemoteClock(this.peerId, docId))
            ?.timestamp ?? null;
        const remoteClock = this.status.remoteClocks.get(docId);
        if (
          remoteClock &&
          (pulled === null || pulled.getTime() < remoteClock.getTime())
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

        const merged = await this.mergeUpdates(
          jobs
            .map(j => j.update ?? new Uint8Array())
            .filter(update => !isEmptyUpdate(update))
        );
        if (!isEmptyUpdate(merged)) {
          const { timestamp } = await this.remote.pushDocUpdate(
            {
              docId,
              bin: merged,
            },
            this.uniqueId
          );
          this.schedule({
            type: 'save',
            docId,
            remoteClock: timestamp,
          });
        }
        throwIfAborted(signal);
        await this.syncMetadata.setPeerPushedClock(this.peerId, {
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
        throwIfAborted(signal);
        const { timestamp: localClock } = await this.local.pushDocUpdate(
          {
            bin: newData,
            docId,
          },
          this.uniqueId
        );
        throwIfAborted(signal);
        await this.syncMetadata.setPeerPulledRemoteClock(this.peerId, {
          docId,
          timestamp: remoteClock,
        });
        const diff =
          localDocRecord && serverStateVector && serverStateVector.length > 0
            ? docDiffUpdate(
                localDocRecord.bin,
                stateVector,
                newData,
                serverStateVector
              )
            : localDocRecord?.bin;
        if (diff && !isEmptyUpdate(diff)) {
          throwIfAborted(signal);
          const { timestamp: remoteClock } = await this.remote.pushDocUpdate(
            {
              bin: diff,
              docId,
            },
            this.uniqueId
          );
          this.schedule({
            type: 'save',
            docId,
            remoteClock,
          });
        }
        throwIfAborted(signal);
        this.schedule({
          type: 'push',
          docId,
          clock: localClock,
        });
      } else {
        if (localDocRecord) {
          if (!isEmptyUpdate(localDocRecord.bin)) {
            throwIfAborted(signal);
            const { timestamp: remoteClock } = await this.remote.pushDocUpdate(
              {
                bin: localDocRecord.bin,
                docId,
              },
              this.uniqueId
            );
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
          await this.syncMetadata.setPeerPushedClock(this.peerId, {
            docId,
            timestamp: localDocRecord.timestamp,
          });
        }
      }
    },
    pull: async (docId: string, signal?: AbortSignal) => {
      const docRecord = await this.local.getDoc(docId);

      const stateVector =
        docRecord && !isEmptyUpdate(docRecord.bin)
          ? encodeStateVectorFromUpdate(docRecord.bin)
          : new Uint8Array();
      const serverDoc = await this.remote.getDocDiff(docId, stateVector);
      if (!serverDoc) {
        return;
      }
      const { missing: newData, timestamp: remoteClock } = serverDoc;
      throwIfAborted(signal);
      const { timestamp } = await this.local.pushDocUpdate(
        {
          docId,
          bin: newData,
        },
        this.uniqueId
      );
      throwIfAborted(signal);
      await this.syncMetadata.setPeerPulledRemoteClock(this.peerId, {
        docId,
        timestamp: remoteClock,
      });
      this.schedule({
        type: 'push',
        docId,
        clock: timestamp,
      });
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
      if (this.status.connectedDocs.has(docId)) {
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

          // schedule push job to mark the timestamp as pushed timestamp
          this.schedule({
            type: 'push',
            docId,
            clock: timestamp,
          });
        }
        throwIfAborted(signal);

        await this.syncMetadata.setPeerPulledRemoteClock(this.peerId, {
          docId,
          timestamp: remoteClock,
        });
      }
    },
  });

  private readonly actions = {
    updateRemoteClock: (docId: string, remoteClock: Date) => {
      this.status.remoteClocks.setIfBigger(docId, remoteClock);
      this.statusUpdatedSubject$.next(docId);
    },
    addDoc: (docId: string) => {
      if (!this.status.docs.has(docId)) {
        this.status.docs.add(docId);
        this.statusUpdatedSubject$.next(docId);
        this.schedule({
          type: 'connect',
          docId,
        });
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
      // try add doc for new doc
      this.actions.addDoc(docId);

      // schedule push job
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
    }: {
      docId: string;
      update: Uint8Array;
      remoteClock: Date;
    }) => {
      // try add doc for new doc
      this.actions.addDoc(docId);
      this.actions.updateRemoteClock(docId, remoteClock);

      // schedule push job
      this.schedule({
        type: 'save',
        docId,
        remoteClock: remoteClock,
        update,
      });
    },
  };

  async mainLoop(signal?: AbortSignal) {
    while (true) {
      try {
        await this.retryLoop(signal);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        console.warn('Sync error, retry in 5s', err);
        this.status.errorMessage =
          err instanceof Error ? err.message : `${err}`;
        this.statusUpdatedSubject$.next(true);
      } finally {
        // reset all status
        this.status = {
          docs: new Set(),
          connectedDocs: new Set(),
          jobDocQueue: new AsyncPriorityQueue(),
          jobMap: new Map(),
          remoteClocks: new ClockMap(new Map()),
          syncing: false,
          skipped: false,
          // tell ui to show retrying status
          retrying: true,
          // error message from last retry
          errorMessage: this.status.errorMessage,
        };
        this.statusUpdatedSubject$.next(true);
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
          this.events.localUpdated({
            docId: update.docId,
            clock: update.timestamp,
            update: update.bin,
          });
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
          });
        })
      );

      // add all docs from local
      const localDocs = Object.keys(await this.local.getDocTimestamps());
      throwIfAborted(signal);
      for (const docId of localDocs) {
        this.actions.addDoc(docId);
      }

      // get cached clocks from metadata
      const cachedClocks = await this.syncMetadata.getPeerRemoteClocks(
        this.peerId
      );
      this.status.remoteClocks.clear();
      throwIfAborted(signal);
      for (const [id, v] of Object.entries(cachedClocks)) {
        this.status.remoteClocks.set(id, v);
      }
      this.statusUpdatedSubject$.next(true);

      // get new clocks from server
      const maxClockValue = this.status.remoteClocks.max;
      const newClocks = await this.remote.getDocTimestamps(maxClockValue);
      for (const [id, v] of Object.entries(newClocks)) {
        this.status.remoteClocks.set(id, v);
      }
      this.statusUpdatedSubject$.next(true);

      for (const [id, v] of Object.entries(newClocks)) {
        await this.syncMetadata.setPeerRemoteClock(this.peerId, {
          docId: id,
          timestamp: v,
        });
      }

      // add all docs from remote
      for (const docId of this.status.remoteClocks.keys()) {
        this.actions.addDoc(docId);
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

          const connect = remove(jobs, j => j.type === 'connect');
          if (connect && connect.length > 0) {
            await this.jobs.connect(docId, signal);
            continue;
          }

          const pullAndPush = remove(jobs, j => j.type === 'pullAndPush');
          if (pullAndPush && pullAndPush.length > 0) {
            await this.jobs.pullAndPush(docId, signal);
            continue;
          }

          const pull = remove(jobs, j => j.type === 'pull');
          if (pull && pull.length > 0) {
            await this.jobs.pull(docId, signal);
            continue;
          }

          const push = remove(jobs, j => j.type === 'push');
          if (push && push.length > 0) {
            await this.jobs.push(
              docId,
              push as (Job & { type: 'push' })[],
              signal
            );
            continue;
          }

          const save = remove(jobs, j => j.type === 'save');
          if (save && save.length > 0) {
            await this.jobs.save(
              docId,
              save as (Job & { type: 'save' })[],
              signal
            );
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

  private schedule(job: Job) {
    const priority = this.prioritySettings.get(job.docId) ?? 0;
    this.status.jobDocQueue.push(job.docId, priority);

    const existingJobs = this.status.jobMap.get(job.docId) ?? [];
    existingJobs.push(job);
    this.status.jobMap.set(job.docId, existingJobs);
    this.statusUpdatedSubject$.next(job.docId);
  }

  addPriority(id: string, priority: number) {
    const oldPriority = this.prioritySettings.get(id) ?? 0;
    this.prioritySettings.set(id, priority);
    this.status.jobDocQueue.setPriority(id, oldPriority + priority);

    return () => {
      const currentPriority = this.prioritySettings.get(id) ?? 0;
      this.prioritySettings.set(id, currentPriority - priority);
      this.status.jobDocQueue.setPriority(id, currentPriority - priority);
    };
  }

  protected mergeUpdates = (updates: Uint8Array[]) => {
    const merge = this.options?.mergeUpdates ?? mergeUpdates;

    return merge(updates.filter(bin => !isEmptyUpdate(bin)));
  };
}
