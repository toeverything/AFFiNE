import { readAllDocsFromRootDoc } from '@affine/reader';
import {
  filter,
  first,
  lastValueFrom,
  Observable,
  ReplaySubject,
  share,
  Subject,
  throttleTime,
} from 'rxjs';
import { applyUpdate, Doc as YDoc } from 'yjs';

import {
  type DocStorage,
  IndexerDocument,
  type IndexerStorage,
} from '../../storage';
import type { IndexerSyncStorage } from '../../storage/indexer-sync';
import { AsyncPriorityQueue } from '../../utils/async-priority-queue';
import { takeUntilAbort } from '../../utils/take-until-abort';
import { MANUALLY_STOP, throwIfAborted } from '../../utils/throw-if-aborted';
import { crawlingDocData } from './crawler';

export interface IndexerSyncState {
  /**
   * Number of documents currently in the indexing queue
   */
  indexing: number;
  /**
   * Indicates whether all documents have been successfully indexed
   *
   * This is only for UI display purposes. For logical operations, please use `waitForCompleted()`
   */
  completed: boolean;
  /**
   * Total number of documents in the workspace
   */
  total: number;
  errorMessage: string | null;
}

export interface IndexerDocSyncState {
  /**
   * Indicates whether this document is currently in the indexing queue
   */
  indexing: boolean;
  /**
   * Indicates whether this document has been successfully indexed
   *
   * This is only for UI display purposes. For logical operations, please use `waitForDocCompleted()`
   */
  completed: boolean;
}

export interface IndexerSync {
  state$: Observable<IndexerSyncState>;
  docState$(docId: string): Observable<IndexerDocSyncState>;
  addPriority(docId: string, priority: number): () => void;
  waitForCompleted(signal?: AbortSignal): Promise<void>;
  waitForDocCompleted(docId: string, signal?: AbortSignal): Promise<void>;
}

export class IndexerSyncImpl implements IndexerSync {
  /**
   * increase this number to re-index all docs
   */
  readonly INDEXER_VERSION = 1;
  private abort: AbortController | null = null;
  private readonly rootDocId = this.doc.spaceId;
  private readonly status = new IndexerSyncStatus(this.rootDocId);

  state$ = this.status.state$.pipe(
    // throttle the state to 1 second to avoid spamming the UI
    throttleTime(1000, undefined, {
      leading: true,
      trailing: true,
    })
  );
  docState$(docId: string) {
    return this.status.docState$(docId).pipe(
      // throttle the state to 1 second to avoid spamming the UI
      throttleTime(1000, undefined, { leading: true, trailing: true })
    );
  }

  async waitForCompleted(signal?: AbortSignal) {
    await lastValueFrom(
      this.status.state$.pipe(
        filter(state => state.completed),
        takeUntilAbort(signal),
        first()
      )
    );
  }

  async waitForDocCompleted(docId: string, signal?: AbortSignal) {
    await lastValueFrom(
      this.status.docState$(docId).pipe(
        filter(state => state.completed),
        takeUntilAbort(signal),
        first()
      )
    );
  }

  constructor(
    readonly doc: DocStorage,
    readonly indexer: IndexerStorage,
    readonly indexerSync: IndexerSyncStorage
  ) {}

  start() {
    if (this.abort) {
      this.abort.abort(MANUALLY_STOP);
    }

    const abort = new AbortController();
    this.abort = abort;

    this.mainLoop(abort.signal).catch(error => {
      if (error === MANUALLY_STOP) {
        return;
      }
      console.error('index error', error);
    });
  }

  stop() {
    this.abort?.abort(MANUALLY_STOP);
    this.abort = null;
  }

  addPriority(id: string, priority: number) {
    return this.status.addPriority(id, priority);
  }

  private async mainLoop(signal?: AbortSignal) {
    if (this.indexer.isReadonly) {
      this.status.isReadonly = true;
      this.status.statusUpdatedSubject$.next(true);
      return;
    }

    while (true) {
      try {
        await this.retryLoop(signal);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        console.error('index error, retry in 5s', error);
        this.status.errorMessage =
          error instanceof Error ? error.message : `${error}`;
        this.status.statusUpdatedSubject$.next(true);
      } finally {
        // reset all status
        this.status.reset();
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
  }

  private async retryLoop(signal?: AbortSignal) {
    await Promise.race([
      Promise.all([
        this.doc.connection.waitForConnected(signal),
        this.indexer.connection.waitForConnected(signal),
        this.indexerSync.connection.waitForConnected(signal),
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

    this.status.errorMessage = null;
    this.status.statusUpdatedSubject$.next(true);

    console.log('indexer sync start');

    const unsubscribe = this.doc.subscribeDocUpdate(update => {
      if (!this.status.rootDocReady) {
        return;
      }
      if (update.docId === this.rootDocId) {
        applyUpdate(this.status.rootDoc, update.bin);

        const allDocs = this.getAllDocsFromRootDoc();

        for (const [docId, { title }] of allDocs) {
          const existingDoc = this.status.docsInRootDoc.get(docId);
          if (!existingDoc) {
            this.status.scheduleJob(docId);
            this.status.docsInRootDoc.set(docId, { title });
            this.status.statusUpdatedSubject$.next(docId);
          } else {
            if (existingDoc.title !== title) {
              this.status.docsInRootDoc.set(docId, { title });
              this.status.statusUpdatedSubject$.next(docId);
            }
          }
        }

        for (const docId of this.status.docsInRootDoc.keys()) {
          if (!allDocs.has(docId)) {
            this.status.docsInRootDoc.delete(docId);
            this.status.statusUpdatedSubject$.next(docId);
          }
        }
        this.status.scheduleJob(this.rootDocId);
      } else {
        const docId = update.docId;
        const existingDoc = this.status.docsInRootDoc.get(docId);
        if (existingDoc) {
          this.status.scheduleJob(docId);
        }
      }
    });

    try {
      const rootDocBin = (await this.doc.getDoc(this.rootDocId))?.bin;
      if (rootDocBin) {
        applyUpdate(this.status.rootDoc, rootDocBin);
      }

      this.status.scheduleJob(this.rootDocId);

      const allDocs = this.getAllDocsFromRootDoc();
      this.status.docsInRootDoc = allDocs;
      this.status.statusUpdatedSubject$.next(true);

      for (const docId of allDocs.keys()) {
        this.status.scheduleJob(docId);
      }

      this.status.rootDocReady = true;
      this.status.statusUpdatedSubject$.next(true);

      const allIndexedDocs = await this.getAllDocsFromIndexer();
      this.status.docsInIndexer = allIndexedDocs;
      this.status.statusUpdatedSubject$.next(true);

      while (true) {
        throwIfAborted(signal);

        const docId = await this.status.acceptJob(signal);

        if (docId === this.rootDocId) {
          // #region crawl root doc
          for (const [docId, { title }] of this.status.docsInRootDoc) {
            const existingDoc = this.status.docsInIndexer.get(docId);
            if (existingDoc) {
              if (existingDoc.title !== title) {
                // need update
                await this.indexer.update(
                  'doc',
                  IndexerDocument.from(docId, {
                    docId,
                    title,
                  })
                );
                this.status.docsInIndexer.set(docId, { title });
                this.status.statusUpdatedSubject$.next(docId);
              }
            } else {
              // need add
              await this.indexer.insert(
                'doc',
                IndexerDocument.from(docId, {
                  docId,
                  title,
                })
              );
              this.status.docsInIndexer.set(docId, { title });
              this.status.statusUpdatedSubject$.next(docId);
            }
          }

          for (const docId of this.status.docsInIndexer.keys()) {
            if (!this.status.docsInRootDoc.has(docId)) {
              await this.indexer.delete('doc', docId);
              await this.indexer.deleteByQuery('block', {
                type: 'match',
                field: 'docId',
                match: docId,
              });
              await this.indexerSync.clearDocIndexedClock(docId);
              this.status.docsInIndexer.delete(docId);
              this.status.statusUpdatedSubject$.next(docId);
            }
          }
          await this.indexer.refresh('block');
          await this.indexer.refresh('doc');
          // #endregion
        } else {
          // #region crawl doc
          const existingDoc = this.status.docsInIndexer.get(docId);
          if (!existingDoc) {
            // doc is deleted, just skip
            continue;
          }

          const docClock = await this.doc.getDocTimestamp(docId);
          if (!docClock) {
            // doc is deleted, just skip
            continue;
          }

          const docIndexedClock =
            await this.indexerSync.getDocIndexedClock(docId);
          if (
            docIndexedClock &&
            docIndexedClock.timestamp.getTime() ===
              docClock.timestamp.getTime() &&
            docIndexedClock.indexerVersion === this.INDEXER_VERSION
          ) {
            // doc is already indexed, just skip
            continue;
          }

          const docBin = await this.doc.getDoc(docId);
          if (!docBin) {
            // doc is deleted, just skip
            continue;
          }
          const docYDoc = new YDoc({ guid: docId });
          applyUpdate(docYDoc, docBin.bin);

          let blocks: IndexerDocument<'block'>[] = [];
          let preview: string | undefined;

          try {
            const result = await crawlingDocData({
              ydoc: docYDoc,
              rootYDoc: this.status.rootDoc,
              spaceId: this.status.rootDocId,
              docId,
            });
            if (!result) {
              // doc is empty without root block, just skip
              continue;
            }
            blocks = result.blocks;
            preview = result.preview;
          } catch (error) {
            console.error('error crawling doc', error);
          }

          await this.indexer.deleteByQuery('block', {
            type: 'match',
            field: 'docId',
            match: docId,
          });

          for (const block of blocks) {
            await this.indexer.insert('block', block);
          }

          await this.indexer.refresh('block');

          if (preview) {
            await this.indexer.update(
              'doc',
              IndexerDocument.from(docId, {
                summary: preview,
              })
            );
            await this.indexer.refresh('doc');
          }

          await this.indexerSync.setDocIndexedClock({
            docId,
            timestamp: docClock.timestamp,
            indexerVersion: this.INDEXER_VERSION,
          });
          // #endregion
        }

        this.status.completeJob();
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Get all docs from the root doc, without deleted docs
   */
  private getAllDocsFromRootDoc() {
    return readAllDocsFromRootDoc(this.status.rootDoc, {
      includeTrash: false,
    });
  }

  private async getAllDocsFromIndexer() {
    const docs = await this.indexer.search(
      'doc',
      {
        type: 'all',
      },
      {
        pagination: {
          limit: Infinity,
        },
        fields: ['docId', 'title'],
      }
    );

    return new Map(
      docs.nodes.map(node => {
        const title = node.fields.title;
        return [
          node.id,
          {
            title: typeof title === 'string' ? title : title.at(0),
          },
        ];
      })
    );
  }
}

class IndexerSyncStatus {
  isReadonly = false;
  prioritySettings = new Map<string, number>();
  jobs = new AsyncPriorityQueue();
  rootDoc = new YDoc({ guid: this.rootDocId });
  rootDocReady = false;
  docsInIndexer = new Map<string, { title: string | undefined }>();
  docsInRootDoc = new Map<string, { title: string | undefined }>();
  currentJob: string | null = null;
  errorMessage: string | null = null;
  statusUpdatedSubject$ = new Subject<string | true>();

  state$ = new Observable<IndexerSyncState>(subscribe => {
    const next = () => {
      if (this.isReadonly) {
        subscribe.next({
          indexing: 0,
          total: 0,
          errorMessage: this.errorMessage,
          completed: true,
        });
      } else {
        subscribe.next({
          indexing: this.jobs.length() + (this.currentJob ? 1 : 0),
          total: this.docsInRootDoc.size + 1,
          errorMessage: this.errorMessage,
          completed: this.rootDocReady && this.jobs.length() === 0,
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
    return new Observable<IndexerDocSyncState>(subscribe => {
      const next = () => {
        if (this.isReadonly) {
          subscribe.next({
            indexing: false,
            completed: true,
          });
        } else {
          subscribe.next({
            indexing: this.jobs.has(docId),
            completed: this.docsInIndexer.has(docId) && !this.jobs.has(docId),
          });
        }
      };
      next();
      const dispose = this.statusUpdatedSubject$.subscribe(updatedDocId => {
        if (updatedDocId === docId || updatedDocId === true) {
          next();
        }
      });
      return () => {
        dispose.unsubscribe();
      };
    }).pipe(
      share({
        connector: () => new ReplaySubject(1),
      })
    );
  }

  constructor(readonly rootDocId: string) {
    this.prioritySettings.set(this.rootDocId, Infinity);
  }

  scheduleJob(docId: string) {
    const priority = this.prioritySettings.get(docId) ?? 0;
    this.jobs.push(docId, priority);
    this.statusUpdatedSubject$.next(docId);
  }

  async acceptJob(abort?: AbortSignal) {
    const job = await this.jobs.asyncPop(abort);
    this.currentJob = job;
    this.statusUpdatedSubject$.next(job);
    return job;
  }

  completeJob() {
    const job = this.currentJob;
    this.currentJob = null;
    this.statusUpdatedSubject$.next(job ?? true);
  }

  addPriority(id: string, priority: number) {
    const oldPriority = this.prioritySettings.get(id) ?? 0;
    this.prioritySettings.set(id, priority);
    this.jobs.setPriority(id, oldPriority + priority);

    return () => {
      const currentPriority = this.prioritySettings.get(id) ?? 0;
      this.prioritySettings.set(id, currentPriority - priority);
      this.jobs.setPriority(id, currentPriority - priority);
    };
  }

  reset() {
    // reset all state, except prioritySettings
    this.isReadonly = false;
    this.jobs.clear();
    this.docsInRootDoc.clear();
    this.docsInIndexer.clear();
    this.rootDoc = new YDoc();
    this.rootDocReady = false;
    this.currentJob = null;
    this.statusUpdatedSubject$.next(true);
  }
}
