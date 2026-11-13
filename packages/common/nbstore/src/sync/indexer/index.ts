import { isEqual, omit } from 'lodash-es';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  first,
  firstValueFrom,
  lastValueFrom,
  map,
  Observable,
  ReplaySubject,
  share,
  Subject,
  switchMap,
  throttleTime,
} from 'rxjs';
import { applyUpdate, Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

import {
  type AggregateOptions,
  type AggregateResult,
  type DocStorage,
  IndexerDocument,
  type IndexerSchema,
  type IndexerStorage,
  type PeerWorkspaceState,
  type Query,
  type SearchOptions,
  type SearchResult,
} from '../../storage';
import { DummyIndexerStorage } from '../../storage/dummy/indexer';
import type { IndexerSyncStorage } from '../../storage/indexer-sync';
import { AsyncPriorityQueue } from '../../utils/async-priority-queue';
import { fromPromise } from '../../utils/from-promise';
import { takeUntilAbort } from '../../utils/take-until-abort';
import { MANUALLY_STOP, throwIfAborted } from '../../utils/throw-if-aborted';
import type { PeerStorageOptions } from '../types';
import { crawlingDocData } from './crawler';

export type IndexerPreferOptions = 'local' | 'remote';

export interface IndexerSyncState {
  paused: boolean;
  batterySaveMode: boolean;
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
  readonly docTitles$: Observable<Record<string, string>>;
  state$: Observable<IndexerSyncState>;
  docState$(docId: string): Observable<IndexerDocSyncState>;
  addPriority(docId: string, priority: number): () => void;
  waitForCompleted(signal?: AbortSignal): Promise<void>;
  waitForDocCompleted(docId: string, signal?: AbortSignal): Promise<void>;

  search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ): Promise<SearchResult<T, O>>;

  aggregate<T extends keyof IndexerSchema, const O extends AggregateOptions<T>>(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ): Promise<AggregateResult<T, O>>;

  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ): Observable<SearchResult<T, O>>;

  aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ): Observable<AggregateResult<T, O>>;
}

export class IndexerSyncImpl implements IndexerSync {
  private abort: AbortController | null = null;
  private running: Promise<void> = Promise.resolve();
  private readonly rootDocId = this.doc.spaceId;
  private readonly status = new IndexerSyncStatus(this.rootDocId);
  private readonly inventory$ = new BehaviorSubject<PeerWorkspaceState | null>(
    null
  );
  private get inventory() {
    return this.inventory$.value;
  }

  private readonly indexer: IndexerStorage;
  private readonly remote$ = new BehaviorSubject<IndexerStorage | undefined>(
    undefined
  );
  setRemotes(remotes: Record<string, IndexerStorage>) {
    this.peers.remotes = remotes;
    this.remote$.next(
      Object.values(remotes).find(
        remote => !(remote instanceof DummyIndexerStorage)
      )
    );
  }
  private readonly pendingIndexedClocks = new Map<
    string,
    { docId: string; timestamp: Date; indexerVersion: number }
  >();

  private lastRefreshed = Date.now();

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
    readonly peers: PeerStorageOptions<IndexerStorage>,
    readonly indexerSync: IndexerSyncStorage,
    workspaceState$?: Observable<PeerWorkspaceState | null>
  ) {
    // sync feature only works on local indexer
    this.indexer = this.peers.local;
    this.setRemotes(this.peers.remotes);
    workspaceState$?.subscribe(state => {
      this.inventory$.next(state);
      this.status.scheduleJob(this.rootDocId);
    });
  }

  enableBatterySaveMode() {
    this.status.enableBatterySaveMode();
  }

  disableBatterySaveMode() {
    this.status.disableBatterySaveMode();
  }

  pauseSync() {
    this.status.pauseSync();
  }

  resumeSync() {
    this.status.resumeSync();
  }

  start() {
    if (this.abort) {
      this.abort.abort(MANUALLY_STOP);
    }

    const abort = new AbortController();
    this.abort = abort;

    this.running = this.running
      .then(() => {
        if (!abort.signal.aborted) return this.mainLoop(abort.signal);
        return;
      })
      .catch(error => {
        if (error === MANUALLY_STOP) {
          return;
        }
        console.error('index error', error);
      });
  }

  stop() {
    this.abort?.abort(MANUALLY_STOP);
    this.abort = null;
    return this.running;
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

    const indexVersion = await this.indexer.indexVersion();
    console.log('indexer sync start, version: ', indexVersion);

    const unsubscribe = this.doc.subscribeDocUpdate(update => {
      if (
        update.docId === this.rootDocId ||
        this.status.docsInWorkspace.has(update.docId)
      ) {
        this.status.docErrors.delete(update.docId);
        this.status.scheduleJob(update.docId);
      }
    });

    try {
      this.status.docsInIndexer = await this.getAllDocsFromIndexer();
      this.status.docsInWorkspace = this.inventory
        ? new Map()
        : new Map(this.status.docsInIndexer);
      this.status.scheduleJob(this.rootDocId);
      for (const docId of this.status.docsInWorkspace.keys()) {
        this.status.scheduleJob(docId);
      }

      while (true) {
        throwIfAborted(signal);

        const docId = await this.status.acceptJob(signal);

        try {
          if (docId === this.rootDocId) {
            if (this.inventory && !this.inventory.ready) {
              this.status.docsInWorkspace.clear();
              this.status.directoryReady = false;
              continue;
            }
            const root = await this.readDoc(this.rootDocId);
            if (!root && !this.inventory) {
              continue;
            }
            const rootDoc = new YDoc({ guid: this.rootDocId });
            try {
              if (root) applyUpdate(rootDoc, root.bin);
              const { docs: visibleDocs, complete } = projectRootMetadata(
                rootDoc,
                !!this.inventory
              );
              const previousDocs = this.status.docsInWorkspace;
              this.status.docsInWorkspace = this.inventory
                ? new Map(
                    this.inventory.docs.map(doc => [
                      doc.docId,
                      visibleDocs.get(doc.docId) ?? { title: undefined },
                    ])
                  )
                : complete
                  ? visibleDocs
                  : new Map([...this.status.docsInWorkspace, ...visibleDocs]);
              this.status.rootDoc.destroy();
              this.status.rootDoc = rootDoc;
              this.status.directoryReady = this.inventory?.ready ?? true;
              for (const visibleDocId of this.status.docsInWorkspace.keys()) {
                if (
                  !previousDocs.has(visibleDocId) &&
                  !this.status.docErrors.has(visibleDocId)
                ) {
                  this.status.scheduleJob(visibleDocId);
                }
              }
            } catch (error) {
              rootDoc.destroy();
              this.status.docErrors.set(docId, String(error));
              if (!this.inventory) continue;
              this.status.docsInWorkspace = new Map(
                this.inventory.docs.map(doc => [
                  doc.docId,
                  { title: undefined },
                ])
              );
              this.status.directoryReady = this.inventory.ready;
              for (const id of this.status.docsInWorkspace.keys())
                this.status.scheduleJob(id);
            }
            // #region crawl root doc
            for (const [docId, metadata] of this.status.docsInWorkspace) {
              const existingDoc = this.status.docsInIndexer.get(docId);
              const title = this.inventory
                ? existingDoc?.title
                : metadata.title;
              if (existingDoc) {
                if (existingDoc.title !== title) {
                  // need update
                  await this.indexer.update(
                    'doc',
                    IndexerDocument.from(docId, {
                      docId,
                      title,
                      summary: existingDoc.summary,
                    })
                  );
                  this.status.docsInIndexer.set(docId, {
                    title,
                    summary: existingDoc.summary,
                  });
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
              if (!this.status.docsInWorkspace.has(docId)) {
                await this.indexer.delete('doc', docId);
                await this.indexer.deleteByQuery('block', {
                  type: 'match',
                  field: 'docId',
                  match: docId,
                });
                this.pendingIndexedClocks.delete(docId);
                this.status.docErrors.delete(docId);
                await this.indexerSync.clearDocIndexedClock(docId);
                this.status.docsInIndexer.delete(docId);
                this.status.statusUpdatedSubject$.next(docId);
              }
            }
            // #endregion
          } else {
            // #region crawl doc
            const existingDoc = this.status.docsInIndexer.get(docId);
            if (!existingDoc || !this.status.docsInWorkspace.has(docId)) {
              // doc is deleted, just skip
              continue;
            }

            let docClock = await this.doc.getDocTimestamp(docId);
            if (!docClock) {
              // doc is deleted, just skip
              continue;
            }

            const docIndexedClock =
              this.pendingIndexedClocks.get(docId) ??
              (await this.indexerSync.getDocIndexedClock(docId));
            if (
              docIndexedClock &&
              docIndexedClock.timestamp.getTime() ===
                docClock.timestamp.getTime() &&
              docIndexedClock.indexerVersion === indexVersion
            ) {
              // doc is already indexed, just skip
              this.status.docErrors.delete(docId);
              continue;
            }

            console.log('[indexer] start indexing doc', docId);

            let blocks: IndexerDocument<'block'>[];
            let preview: string | undefined;
            let bodyTitle: string | undefined;
            const nativeResult = await this.tryNativeCrawlDocData(docId);
            if (nativeResult) {
              blocks = nativeResult.block;
              preview = nativeResult.summary;
              bodyTitle = nativeResult.title;
            } else {
              const doc = await this.readDoc(docId);
              if (!doc) {
                continue;
              }
              const docYDoc = new YDoc({ guid: docId });
              try {
                applyUpdate(docYDoc, doc.bin);
                if (docYDoc.store.pendingStructs || docYDoc.store.pendingDs) {
                  throw new Error('Document source is incomplete');
                }
                const result = await crawlingDocData({
                  ydoc: docYDoc,
                  rootYDoc: this.status.rootDoc,
                  spaceId: this.status.rootDocId,
                  docId,
                });
                if (!result) {
                  throw new Error('Document has no readable root block');
                }
                blocks = result.blocks;
                preview = result.preview;
                bodyTitle = result.title;
                docClock = doc;
              } catch (error) {
                this.status.docErrors.set(docId, String(error));
                continue;
              } finally {
                docYDoc.destroy();
              }
            }

            await this.indexer.deleteByQuery('block', {
              type: 'match',
              field: 'docId',
              match: docId,
            });

            for (const block of blocks) {
              await this.indexer.insert('block', block);
            }

            if (preview !== undefined || bodyTitle !== undefined) {
              const title = this.inventory
                ? (bodyTitle ?? existingDoc.title)
                : existingDoc.title;
              await this.indexer.update(
                'doc',
                IndexerDocument.from(docId, {
                  docId,
                  title,
                  summary: preview ?? existingDoc.summary,
                })
              );
              this.status.docsInIndexer.set(docId, {
                title,
                summary: preview ?? existingDoc.summary,
              });
            }

            this.pendingIndexedClocks.set(docId, {
              docId,
              timestamp: docClock.timestamp,
              indexerVersion: indexVersion,
            });
            // #endregion
          }

          console.log('[indexer] complete job', docId);
          await this.refreshIfNeed(docId === this.rootDocId);
          this.status.docErrors.delete(docId);
        } finally {
          this.status.completeJob();
        }
      }
    } finally {
      await this.refreshIfNeed(true);
      unsubscribe();
    }
  }

  // ensure the indexer is refreshed according to recommendRefreshInterval
  // recommendRefreshInterval <= 0 means force refresh on each operation
  // recommendRefreshInterval > 0 means refresh if the last refresh is older than recommendRefreshInterval
  private async refreshIfNeed(force = false): Promise<void> {
    const recommendRefreshInterval = this.indexer.recommendRefreshInterval ?? 0;
    const needRefresh =
      recommendRefreshInterval > 0 &&
      this.lastRefreshed + recommendRefreshInterval < Date.now();
    const forceRefresh = recommendRefreshInterval <= 0;
    if (force || needRefresh || forceRefresh) {
      if (this.indexerSync.commitsIndexAtomically) {
        await this.flushPendingIndexedClocks();
      } else {
        await this.indexer.refreshIfNeed();
        await this.flushPendingIndexedClocks();
      }
      this.lastRefreshed = Date.now();
    }
  }

  private async flushPendingIndexedClocks() {
    if (this.pendingIndexedClocks.size === 0) return;
    const clocks = [...this.pendingIndexedClocks.values()];
    await this.indexerSync.setDocIndexedClocks(clocks);
    for (const clock of clocks) this.pendingIndexedClocks.delete(clock.docId);
  }

  private async readDoc(docId: string) {
    try {
      return await this.doc.getDoc(docId);
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_binary') {
        this.status.docErrors.set(docId, error.message);
        return null;
      }
      throw error;
    }
  }

  private async tryNativeCrawlDocData(docId: string) {
    try {
      const result = await this.doc.crawlDocData?.(docId);
      if (result) {
        return {
          title: result.title,
          block: result.blocks.map(block =>
            IndexerDocument.from<'block'>(`${docId}:${block.blockId}`, {
              docId,
              blockId: block.blockId,
              content: block.content,
              flavour: block.flavour,
              blob: block.blob,
              refDocId: block.refDocId,
              ref: block.refInfo,
              parentFlavour: block.parentFlavour,
              parentBlockId: block.parentBlockId,
              additional: block.additional,
            })
          ),
          summary: result.summary,
        };
      }
      return null;
    } catch (error) {
      console.warn('[indexer] native crawlDocData failed', docId, error);
      return null;
    }
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
        fields: ['docId', 'title', 'summary'],
      }
    );

    return new Map(
      docs.nodes.map(node => {
        const title = node.fields.title;
        const summary = node.fields.summary;
        return [
          node.id,
          {
            title: typeof title === 'string' ? title : undefined,
            summary: typeof summary === 'string' ? summary : undefined,
          },
        ];
      })
    );
  }

  private visibleQuery<T extends keyof IndexerSchema>(
    query: Query<T>,
    state: PeerWorkspaceState | null,
    includeTrashed = false
  ): Query<T> {
    if (!state) return query;
    const ids = state.ready
      ? state.docs
          .filter(doc => includeTrashed || doc.lifecycle !== 'trashed')
          .map(doc => doc.docId)
      : [];
    const allowed: Query<T> =
      ids.length === 0
        ? { type: 'boolean', occur: 'must_not', queries: [{ type: 'all' }] }
        : {
            type: 'boolean',
            occur: 'should',
            queries: ids.map(id => ({
              type: 'match',
              field: 'docId',
              match: id,
            })),
          };
    return {
      type: 'boolean',
      occur: 'must',
      queries: [query, { type: 'boost', boost: 0, query: allowed }],
    };
  }

  readonly docTitles$ = this.inventory$.pipe(
    switchMap(inventory =>
      fromPromise(signal =>
        this.indexer.connection.waitForConnected(signal)
      ).pipe(
        switchMap(() =>
          this.indexer.search$(
            'doc',
            this.visibleQuery({ type: 'all' }, inventory, true),
            {
              fields: ['docId', 'title'],
              pagination: { limit: Infinity },
            }
          )
        )
      )
    ),
    map(result =>
      Object.fromEntries(
        result.nodes.map(node => [
          node.id,
          typeof node.fields.title === 'string'
            ? node.fields.title
            : (node.fields.title?.join('') ?? ''),
        ])
      )
    ),
    distinctUntilChanged(isEqual),
    share({
      connector: () => new ReplaySubject<Record<string, string>>(1),
      resetOnRefCountZero: true,
    })
  );

  async search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ): Promise<SearchResult<T, O>> {
    return firstValueFrom(this.search$<T, O>(table, query, options));
  }

  async aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ): Promise<AggregateResult<T, O>> {
    return firstValueFrom(this.aggregate$<T, O>(table, query, field, options));
  }

  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ): Observable<SearchResult<T, O>> {
    return combineLatest([this.remote$, this.inventory$]).pipe(
      switchMap(([remote, inventory]) => {
        const storage =
          options?.prefer === 'remote' && remote ? remote : this.indexer;
        const scopedQuery =
          storage === this.indexer
            ? this.visibleQuery(query, inventory)
            : query;
        return fromPromise(signal =>
          storage.connection.waitForConnected(signal)
        ).pipe(
          switchMap(() =>
            storage.search$(table, scopedQuery, omit(options, 'prefer'))
          )
        );
      })
    );
  }

  aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ): Observable<AggregateResult<T, O>> {
    return combineLatest([this.remote$, this.inventory$]).pipe(
      switchMap(([remote, inventory]) => {
        const storage =
          options?.prefer === 'remote' && remote ? remote : this.indexer;
        const scopedQuery =
          storage === this.indexer
            ? this.visibleQuery(query, inventory)
            : query;
        return fromPromise(signal =>
          storage.connection.waitForConnected(signal)
        ).pipe(
          switchMap(() =>
            storage.aggregate$(
              table,
              scopedQuery,
              field,
              omit(options, 'prefer')
            )
          )
        );
      })
    );
  }
}

class IndexerSyncStatus {
  isReadonly = false;
  prioritySettings = new Map<string, number>();
  jobs = new AsyncPriorityQueue();
  rootDoc = new YDoc({ guid: this.rootDocId });
  directoryReady = false;
  docsInIndexer = new Map<
    string,
    { title: string | undefined; summary?: string }
  >();
  docsInWorkspace = new Map<string, { title: string | undefined }>();
  currentJob: string | null = null;
  errorMessage: string | null = null;
  docErrors = new Map<string, string>();
  statusUpdatedSubject$ = new Subject<string | true>();
  paused: {
    promise: Promise<void>;
    resolve: () => void;
  } | null = null;
  batterySaveMode: boolean = false;

  state$ = new Observable<IndexerSyncState>(subscribe => {
    const next = () => {
      if (this.isReadonly) {
        subscribe.next({
          indexing: 0,
          total: 0,
          errorMessage:
            this.errorMessage ?? this.docErrors.values().next().value ?? null,
          completed: true,
          batterySaveMode: this.batterySaveMode,
          paused: this.paused !== null,
        });
      } else {
        subscribe.next({
          indexing: this.jobs.length() + (this.currentJob ? 1 : 0),
          total: this.docsInWorkspace.size + 1,
          errorMessage:
            this.errorMessage ?? this.docErrors.values().next().value ?? null,
          completed:
            this.directoryReady &&
            this.docErrors.size === 0 &&
            this.jobs.length() === 0 &&
            this.currentJob === null,
          batterySaveMode: this.batterySaveMode,
          paused: this.paused !== null,
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
          const indexing = this.jobs.has(docId) || this.currentJob === docId;
          subscribe.next({
            indexing,
            completed:
              this.docsInIndexer.has(docId) &&
              !this.docErrors.has(docId) &&
              !indexing,
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
    if (this.paused) {
      await this.paused.promise;
    }
    const job = await this.jobs.asyncPop(
      // if battery save mode is enabled, only accept jobs with priority > 1; otherwise accept all jobs
      this.batterySaveMode ? 1 : undefined,
      abort
    );
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
    const newPriority = oldPriority + priority;
    this.prioritySettings.set(id, newPriority);
    this.jobs.setPriority(id, newPriority);

    return () => {
      const currentPriority = this.prioritySettings.get(id) ?? 0;
      const restoredPriority = currentPriority - priority;
      this.prioritySettings.set(id, restoredPriority);
      this.jobs.setPriority(id, restoredPriority);
    };
  }

  enableBatterySaveMode() {
    if (this.batterySaveMode) {
      return;
    }
    this.batterySaveMode = true;
    this.statusUpdatedSubject$.next(true);
  }

  disableBatterySaveMode() {
    if (!this.batterySaveMode) {
      return;
    }
    this.batterySaveMode = false;
    this.statusUpdatedSubject$.next(true);
  }

  pauseSync() {
    if (this.paused) {
      return;
    }
    this.paused = Promise.withResolvers();
    this.statusUpdatedSubject$.next(true);
  }

  resumeSync() {
    if (!this.paused) {
      return;
    }
    this.paused.resolve();
    this.paused = null;
    this.statusUpdatedSubject$.next(true);
  }

  reset() {
    // reset all state, except prioritySettings
    this.isReadonly = false;
    this.jobs.clear();
    this.docErrors.clear();
    this.docsInWorkspace.clear();
    this.docsInIndexer.clear();
    this.rootDoc.destroy();
    this.rootDoc = new YDoc();
    this.directoryReady = false;
    this.currentJob = null;
    this.batterySaveMode = false;
    this.paused = null;
    this.statusUpdatedSubject$.next(true);
  }
}

function projectRootMetadata(rootDoc: YDoc, includeTrashed = false) {
  const meta = rootDoc.getMap('meta');
  const pages: unknown = meta.get('pages');
  const docs = new Map<string, { title: string | undefined }>();
  let complete =
    meta._length === 0 &&
    !rootDoc.store.pendingStructs &&
    !rootDoc.store.pendingDs;
  if (pages === undefined) return { docs, complete };
  if (!(pages instanceof YArray) && !Array.isArray(pages)) {
    return { docs, complete: false };
  }
  const ids = new Set<string>();
  for (const page of pages) {
    if (
      !(page instanceof YMap) &&
      (!page || typeof page !== 'object' || Array.isArray(page))
    ) {
      complete = false;
      continue;
    }
    const metadata: YMap<unknown> | Record<string, unknown> = page;
    const id = metadata instanceof YMap ? metadata.get('id') : metadata.id;
    if (typeof id !== 'string' || !id || ids.has(id)) {
      complete = false;
      continue;
    }
    ids.add(id);
    const trash =
      metadata instanceof YMap ? metadata.get('trash') : metadata.trash;
    const title =
      metadata instanceof YMap ? metadata.get('title') : metadata.title;
    if (includeTrashed || !trash)
      docs.set(id, { title: typeof title === 'string' ? title : undefined });
  }
  return { docs, complete };
}
