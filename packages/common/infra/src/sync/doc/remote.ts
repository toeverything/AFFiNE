import { DebugLogger } from '@affine/debug';
import { remove } from 'lodash-es';
import { Observable, Subject } from 'rxjs';
import { diffUpdate, encodeStateVectorFromUpdate, mergeUpdates } from 'yjs';

import { LiveData } from '../../livedata';
import { throwIfAborted } from '../../utils';
import { AsyncPriorityQueue } from './async-priority-queue';
import { ClockMap } from './clock';
import type { DocEvent } from './event';
import type { DocServer } from './server';
import type { DocStorageInner } from './storage';
import { isEmptyUpdate } from './utils';

const logger = new DebugLogger('doc-engine:remote');

type Job =
  | {
      type: 'connect';
      docId: string;
    }
  | {
      type: 'push';
      docId: string;
      update: Uint8Array;
      seqNum: number;
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
      serverClock: number;
    };

export interface Status {
  docs: Set<string>;
  connectedDocs: Set<string>;
  jobDocQueue: AsyncPriorityQueue;
  jobMap: Map<string, Job[]>;
  serverClocks: ClockMap;
  syncing: boolean;
  retrying: boolean;
  errorMessage: string | null;
}

export interface RemoteEngineState {
  total: number;
  syncing: number;
  retrying: boolean;
  errorMessage: string | null;
}

export interface RemoteDocState {
  syncing: boolean;
  retrying: boolean;
  serverClock: number | null;
  errorMessage: string | null;
}

export class DocEngineRemotePart {
  private readonly prioritySettings = new Map<string, number>();

  constructor(
    private readonly clientId: string,
    private readonly storage: DocStorageInner,
    private readonly server: DocServer
  ) {}

  private status: Status = {
    docs: new Set<string>(),
    connectedDocs: new Set<string>(),
    jobDocQueue: new AsyncPriorityQueue(),
    jobMap: new Map(),
    serverClocks: new ClockMap(new Map()),
    syncing: false,
    retrying: false,
    errorMessage: null,
  };
  private readonly statusUpdatedSubject$ = new Subject<string | true>();

  engineState$ = LiveData.from<RemoteEngineState>(
    new Observable(subscribe => {
      const next = () => {
        if (!this.status.syncing) {
          // if syncing = false, jobMap is empty
          subscribe.next({
            total: this.status.docs.size,
            syncing: this.status.docs.size,
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
          });
        }
      };
      next();
      return this.statusUpdatedSubject$.subscribe(() => {
        next();
      });
    }),
    {
      syncing: 0,
      total: 0,
      retrying: false,
      errorMessage: null,
    }
  );

  docState$(docId: string) {
    return LiveData.from<RemoteDocState>(
      new Observable(subscribe => {
        const next = () => {
          subscribe.next({
            syncing:
              !this.status.connectedDocs.has(docId) ||
              this.status.jobMap.has(docId),
            serverClock: this.status.serverClocks.get(docId),
            retrying: this.status.retrying,
            errorMessage: this.status.errorMessage,
          });
        };
        next();
        return this.statusUpdatedSubject$.subscribe(updatedId => {
          if (updatedId === true || updatedId === docId) next();
        });
      }),
      { syncing: false, retrying: false, errorMessage: null, serverClock: null }
    );
  }

  readonly jobs = {
    connect: async (docId: string, signal?: AbortSignal) => {
      const pushedSeqNum = await this.storage.loadDocSeqNumPushed(
        docId,
        signal
      );
      const seqNum = await this.storage.loadDocSeqNum(docId, signal);

      if (pushedSeqNum === null || pushedSeqNum !== seqNum) {
        await this.jobs.pullAndPush(docId, signal);
      } else {
        const pulled = await this.storage.loadDocServerClockPulled(docId);
        if (
          pulled === null ||
          pulled !== this.status.serverClocks.get(normalizeServerDocId(docId))
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
      if (this.status.connectedDocs.has(docId)) {
        const maxSeqNum = Math.max(...jobs.map(j => j.seqNum));
        const pushedSeqNum =
          (await this.storage.loadDocSeqNumPushed(docId, signal)) ?? 0;

        if (maxSeqNum - pushedSeqNum === jobs.length) {
          const merged = mergeUpdates(
            jobs.map(j => j.update).filter(update => !isEmptyUpdate(update))
          );
          if (!isEmptyUpdate(merged)) {
            const { serverClock } = await this.server.pushDoc(docId, merged);
            this.schedule({
              type: 'save',
              docId,
              serverClock,
            });
          }
          await this.storage.saveDocPushedSeqNum(
            docId,
            { add: jobs.length },
            signal
          );
        } else {
          // maybe other tab is modifying the doc, do full pull and push for safety
          await this.jobs.pullAndPush(docId, signal);
        }
      }
    },
    pullAndPush: async (docId: string, signal?: AbortSignal) => {
      const seqNum = await this.storage.loadDocSeqNum(docId, signal);
      const data = await this.storage.loadDocFromLocal(docId, signal);

      const stateVector =
        data && !isEmptyUpdate(data)
          ? encodeStateVectorFromUpdate(data)
          : new Uint8Array();
      const serverData = await this.server.pullDoc(docId, stateVector);

      if (serverData) {
        const {
          data: newData,
          stateVector: serverStateVector,
          serverClock,
        } = serverData;
        await this.storage.saveServerClock(
          new Map([[normalizeServerDocId(docId), serverClock]]),
          signal
        );
        this.actions.updateServerClock(
          normalizeServerDocId(docId),
          serverClock
        );
        await this.storage.commitDocAsServerUpdate(
          docId,
          newData,
          serverClock,
          signal
        );
        this.storage.eventBus.emit({
          type: 'ServerUpdateCommitted',
          docId,
          clientId: this.clientId,
          update: newData,
        });
        const diff =
          data && serverStateVector && serverStateVector.length > 0
            ? diffUpdate(data, serverStateVector)
            : data;
        if (diff && !isEmptyUpdate(diff)) {
          const { serverClock } = await this.server.pushDoc(docId, diff);
          this.schedule({
            type: 'save',
            docId,
            serverClock,
          });
        }
        await this.storage.saveDocPushedSeqNum(docId, seqNum, signal);
      } else {
        if (data && !isEmptyUpdate(data)) {
          const { serverClock } = await this.server.pushDoc(docId, data);
          await this.storage.saveDocServerClockPulled(
            docId,
            serverClock,
            signal
          );
          await this.storage.saveServerClock(
            new Map([[normalizeServerDocId(docId), serverClock]]),
            signal
          );
          this.actions.updateServerClock(
            normalizeServerDocId(docId),
            serverClock
          );
        }
        await this.storage.saveDocPushedSeqNum(docId, seqNum, signal);
      }
    },
    pull: async (docId: string, signal?: AbortSignal) => {
      const data = await this.storage.loadDocFromLocal(docId, signal);

      const stateVector =
        data && !isEmptyUpdate(data)
          ? encodeStateVectorFromUpdate(data)
          : new Uint8Array();
      const serverDoc = await this.server.pullDoc(docId, stateVector);
      if (!serverDoc) {
        return;
      }
      const { data: newData, serverClock } = serverDoc;
      await this.storage.commitDocAsServerUpdate(
        docId,
        newData,
        serverClock,
        signal
      );
      this.storage.eventBus.emit({
        type: 'ServerUpdateCommitted',
        docId,
        clientId: this.clientId,
        update: newData,
      });
      await this.storage.saveServerClock(
        new Map([[normalizeServerDocId(docId), serverClock]]),
        signal
      );
      this.actions.updateServerClock(normalizeServerDocId(docId), serverClock);
    },
    save: async (
      docId: string,
      jobs: (Job & { type: 'save' })[],
      signal?: AbortSignal
    ) => {
      const serverClock = jobs.reduce((a, b) => Math.max(a, b.serverClock), 0);
      await this.storage.saveServerClock(
        new Map([[normalizeServerDocId(docId), serverClock]]),
        signal
      );
      this.actions.updateServerClock(normalizeServerDocId(docId), serverClock);
      if (this.status.connectedDocs.has(docId)) {
        const data = jobs
          .map(j => j.update)
          .filter((update): update is Uint8Array =>
            update ? !isEmptyUpdate(update) : false
          );
        const update = data.length > 0 ? mergeUpdates(data) : new Uint8Array();
        await this.storage.commitDocAsServerUpdate(
          docId,
          update,
          serverClock,
          signal
        );
        this.storage.eventBus.emit({
          type: 'ServerUpdateCommitted',
          docId,
          clientId: this.clientId,
          update,
        });
      }
    },
  };

  readonly actions = {
    updateServerClock: (docId: string, serverClock: number) => {
      this.status.serverClocks.setIfBigger(docId, serverClock);
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

  readonly events: {
    [key in DocEvent['type']]?: (event: DocEvent & { type: key }) => void;
  } = {
    ClientUpdateCommitted: ({ clientId, docId, seqNum, update }) => {
      if (clientId !== this.clientId) {
        return;
      }
      this.schedule({
        type: 'push',
        docId,
        update,
        seqNum,
      });
    },
  };

  async mainLoop(signal?: AbortSignal) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.retryLoop(signal);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        logger.error('Remote sync error, retry in 5s', err);
        this.status.errorMessage =
          err instanceof Error ? err.message : `${err}`;
        this.statusUpdatedSubject$.next(true);
      } finally {
        this.status = {
          docs: this.status.docs,
          connectedDocs: new Set<string>(),
          jobDocQueue: new AsyncPriorityQueue(),
          jobMap: new Map(),
          serverClocks: new ClockMap(new Map()),
          syncing: false,
          retrying: true,
          errorMessage: this.status.errorMessage,
        };
        this.statusUpdatedSubject$.next(true);
      }
      await Promise.race([
        new Promise<void>(resolve => {
          setTimeout(resolve, 5 * 1000);
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

  async retryLoop(signal?: AbortSignal) {
    throwIfAborted(signal);
    const abort = new AbortController();

    signal?.addEventListener('abort', reason => {
      abort.abort(reason);
    });

    signal = abort.signal;

    const disposes: (() => void)[] = [];

    try {
      disposes.push(
        this.storage.eventBus.on(event => {
          const handler = this.events[event.type];
          handler?.(event as any);
        })
      );
      throwIfAborted(signal);

      for (const doc of this.status.docs) {
        this.schedule({
          type: 'connect',
          docId: doc,
        });
      }

      logger.info('Remote sync started');
      this.status.syncing = true;
      this.statusUpdatedSubject$.next(true);

      this.server.onInterrupted(reason => {
        abort.abort(reason);
      });
      await Promise.race([
        this.server.waitForConnectingServer(signal),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Connect to server timeout'));
          }, 1000 * 30);
        }),
        new Promise((_, reject) => {
          signal?.addEventListener('abort', reason => {
            reject(reason);
          });
        }),
      ]);

      // reset retrying flag after connected with server
      this.status.retrying = false;
      this.statusUpdatedSubject$.next(true);

      throwIfAborted(signal);
      disposes.push(
        await this.server.subscribeAllDocs(({ docId, data, serverClock }) => {
          this.schedule({
            type: 'save',
            docId: docId,
            serverClock,
            update: data,
          });
        })
      );
      const cachedClocks = await this.storage.loadServerClock(signal);
      for (const [id, v] of cachedClocks) {
        this.actions.updateServerClock(id, v);
      }
      const maxClockValue = this.status.serverClocks.max;
      const newClocks = await this.server.loadServerClock(maxClockValue);
      for (const [id, v] of newClocks) {
        this.actions.updateServerClock(id, v);
      }
      await this.storage.saveServerClock(newClocks, signal);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        throwIfAborted(signal);

        const docId = await this.status.jobDocQueue.asyncPop(signal);
        // eslint-disable-next-line no-constant-condition
        while (true) {
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
      try {
        this.server.disconnectServer();
      } catch (err) {
        logger.error('Error on disconnect server', err);
      }
      this.status.syncing = false;
      logger.info('Remote sync ended');
    }
  }

  schedule(job: Job) {
    const priority = this.prioritySettings.get(job.docId) ?? 0;
    this.status.jobDocQueue.push(job.docId, priority);

    const existingJobs = this.status.jobMap.get(job.docId) ?? [];
    existingJobs.push(job);
    this.status.jobMap.set(job.docId, existingJobs);
    this.statusUpdatedSubject$.next(job.docId);
  }

  setPriority(docId: string, priority: number) {
    this.prioritySettings.set(docId, priority);
    this.status.jobDocQueue.updatePriority(docId, priority);
  }
}

// use normalized id in server clock
function normalizeServerDocId(raw: string) {
  enum DocVariant {
    Workspace = 'workspace',
    Page = 'page',
    Space = 'space',
    Settings = 'settings',
    Unknown = 'unknown',
  }

  try {
    if (!raw.length) {
      throw new Error('Invalid Empty Doc ID');
    }

    let parts = raw.split(':');

    if (parts.length > 3) {
      // special adapt case `wsId:space:page:pageId`
      if (parts[1] === DocVariant.Space && parts[2] === DocVariant.Page) {
        parts = [parts[0], DocVariant.Space, parts[3]];
      } else {
        throw new Error(`Invalid format of Doc ID: ${raw}`);
      }
    } else if (parts.length === 2) {
      // `${variant}:${guid}`
      throw new Error('not supported');
    } else if (parts.length === 1) {
      // ${ws} or ${pageId}
      parts = ['', DocVariant.Unknown, parts[0]];
    }

    const docId = parts.at(2);

    if (!docId) {
      throw new Error('ID is required');
    }

    return docId;
  } catch (err) {
    logger.error('Error on normalize docId ' + raw, err);
    return raw;
  }
}
