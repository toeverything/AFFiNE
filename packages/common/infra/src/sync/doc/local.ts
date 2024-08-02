import { DebugLogger } from '@affine/debug';
import { Unreachable } from '@affine/env/constant';
import { groupBy } from 'lodash-es';
import { Observable, Subject } from 'rxjs';
import type { Doc as YDoc } from 'yjs';
import { applyUpdate, encodeStateAsUpdate, mergeUpdates } from 'yjs';

import { LiveData } from '../../livedata';
import { throwIfAborted } from '../../utils';
import { AsyncPriorityQueue } from './async-priority-queue';
import type { DocEvent } from './event';
import type { DocStorageInner } from './storage';
import { isEmptyUpdate } from './utils';

type Job =
  | {
      type: 'load';
      docId: string;
    }
  | {
      type: 'save';
      docId: string;
      update: Uint8Array;
    }
  | {
      type: 'apply';
      docId: string;
      update: Uint8Array;
      isInitialize: boolean;
    };

const DOC_ENGINE_ORIGIN = 'doc-engine';

const logger = new DebugLogger('doc-engine:local');

export interface LocalEngineState {
  total: number;
  syncing: number;
}

export interface LocalDocState {
  ready: boolean;
  loading: boolean;
  syncing: boolean;
}

/**
 * never fail
 */
export class DocEngineLocalPart {
  private readonly prioritySettings = new Map<string, number>();
  private readonly statusUpdatedSubject$ = new Subject<string>();

  private readonly status = {
    docs: new Map<string, YDoc>(),
    connectedDocs: new Set<string>(),
    readyDocs: new Set<string>(),
    jobDocQueue: new AsyncPriorityQueue(),
    jobMap: new Map<string, Job[]>(),
    currentJob: null as { docId: string; jobs: Job[] } | null,
  };

  engineState$ = LiveData.from<LocalEngineState>(
    new Observable(subscribe => {
      const next = () => {
        subscribe.next({
          total: this.status.docs.size,
          syncing: this.status.jobMap.size + (this.status.currentJob ? 1 : 0),
        });
      };
      next();
      return this.statusUpdatedSubject$.subscribe(() => {
        next();
      });
    }),
    { syncing: 0, total: 0 }
  );

  docState$(docId: string) {
    return LiveData.from<LocalDocState>(
      new Observable(subscribe => {
        const next = () => {
          subscribe.next({
            ready: this.status.readyDocs.has(docId) ?? false,
            loading: this.status.connectedDocs.has(docId),
            syncing:
              (this.status.jobMap.get(docId)?.length ?? 0) > 0 ||
              this.status.currentJob?.docId === docId,
          });
        };
        next();
        return this.statusUpdatedSubject$.subscribe(updatedId => {
          if (updatedId === docId) next();
        });
      }),
      { ready: false, loading: false, syncing: false }
    );
  }

  constructor(
    private readonly clientId: string,
    private readonly storage: DocStorageInner
  ) {}

  async mainLoop(signal?: AbortSignal) {
    const dispose = this.storage.eventBus.on(event => {
      const handler = this.events[event.type];
      if (handler) {
        handler(event as any);
      }
    });
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        throwIfAborted(signal);
        const docId = await this.status.jobDocQueue.asyncPop(signal);
        const jobs = this.status.jobMap.get(docId);
        this.status.jobMap.delete(docId);

        if (!jobs) {
          continue;
        }

        this.status.currentJob = { docId, jobs };
        this.statusUpdatedSubject$.next(docId);

        const { apply, load, save } = groupBy(jobs, job => job.type) as {
          [key in Job['type']]?: Job[];
        };

        if (load?.length) {
          await this.jobs.load(load[0] as any, signal);
        }

        for (const applyJob of apply ?? []) {
          await this.jobs.apply(applyJob as any, signal);
        }

        if (save?.length) {
          await this.jobs.save(docId, save as any, signal);
        }

        this.status.currentJob = null;
        this.statusUpdatedSubject$.next(docId);
      }
    } finally {
      dispose();

      for (const docs of this.status.connectedDocs) {
        const doc = this.status.docs.get(docs);
        if (doc) {
          doc.off('update', this.handleDocUpdate);
        }
      }
    }
  }

  readonly actions = {
    addDoc: (doc: YDoc) => {
      this.schedule({
        type: 'load',
        docId: doc.guid,
      });

      this.status.docs.set(doc.guid, doc);
      this.statusUpdatedSubject$.next(doc.guid);
    },
    markAsReady: (docId: string) => {
      this.status.readyDocs.add(docId);
      this.statusUpdatedSubject$.next(docId);
    },
  };

  readonly jobs = {
    load: async (job: Job & { type: 'load' }, signal?: AbortSignal) => {
      const doc = this.status.docs.get(job.docId);
      if (!doc) {
        throw new Unreachable('doc not found');
      }
      const existingData = encodeStateAsUpdate(doc);

      if (!isEmptyUpdate(existingData)) {
        this.schedule({
          type: 'save',
          docId: doc.guid,
          update: existingData,
        });
      }

      // mark doc as loaded
      doc.emit('sync', [true, doc]);
      doc.on('update', this.handleDocUpdate);

      this.status.connectedDocs.add(job.docId);
      this.statusUpdatedSubject$.next(job.docId);

      const docData = await this.storage.loadDocFromLocal(job.docId, signal);

      if (!docData || isEmptyUpdate(docData)) {
        return;
      }

      this.applyUpdate(job.docId, docData);
      this.status.readyDocs.add(job.docId);
      this.statusUpdatedSubject$.next(job.docId);
    },
    save: async (
      docId: string,
      jobs: (Job & { type: 'save' })[],
      signal?: AbortSignal
    ) => {
      if (this.status.connectedDocs.has(docId)) {
        const merged = mergeUpdates(
          jobs.map(j => j.update).filter(update => !isEmptyUpdate(update))
        );
        const newSeqNum = await this.storage.commitDocAsClientUpdate(
          docId,
          merged,
          signal
        );
        this.storage.eventBus.emit({
          type: 'ClientUpdateCommitted',
          seqNum: newSeqNum,
          docId: docId,
          clientId: this.clientId,
          update: merged,
        });
      }
    },
    apply: async (job: Job & { type: 'apply' }, signal?: AbortSignal) => {
      throwIfAborted(signal);
      if (this.status.connectedDocs.has(job.docId)) {
        this.applyUpdate(job.docId, job.update);
      }
      if (job.isInitialize && !isEmptyUpdate(job.update)) {
        this.status.readyDocs.add(job.docId);
        this.statusUpdatedSubject$.next(job.docId);
      }
    },
  };

  readonly events: {
    [key in DocEvent['type']]?: (event: DocEvent & { type: key }) => void;
  } = {
    ServerUpdateCommitted: ({ docId, update, clientId }) => {
      this.schedule({
        type: 'apply',
        docId,
        update,
        isInitialize: clientId === this.clientId,
      });
    },
    ClientUpdateCommitted: ({ docId, update, clientId }) => {
      if (clientId !== this.clientId) {
        this.schedule({
          type: 'apply',
          docId,
          update,
          isInitialize: false,
        });
      }
    },
  };

  handleDocUpdate = (update: Uint8Array, origin: any, doc: YDoc) => {
    if (origin === DOC_ENGINE_ORIGIN) {
      return;
    }

    this.schedule({
      type: 'save',
      docId: doc.guid,
      update,
    });
  };

  applyUpdate(docId: string, update: Uint8Array) {
    const doc = this.status.docs.get(docId);
    if (doc && !isEmptyUpdate(update)) {
      try {
        applyUpdate(doc, update, DOC_ENGINE_ORIGIN);
      } catch (err) {
        logger.error('failed to apply update yjs doc', err);
      }
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
