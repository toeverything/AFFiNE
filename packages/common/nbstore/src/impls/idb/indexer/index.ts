import { merge, Observable, of, Subject, throttleTime } from 'rxjs';

import { share } from '../../../connection';
import type {
  AggregateOptions,
  AggregateResult,
  IndexerDocument,
  IndexerSchema,
  Query,
  SearchOptions,
  SearchResult,
} from '../../../storage';
import { IndexerStorageBase } from '../../../storage';
import { fromPromise } from '../../../utils/from-promise';
import { IDBConnection, type IDBConnectionOptions } from '../db';
import { DataStruct } from './data-struct';
import { backoffRetry, exhaustMapWithTrailing } from './utils';

export class IndexedDBIndexerStorage extends IndexerStorageBase {
  static readonly identifier = 'IndexedDBIndexerStorage';
  override recommendRefreshInterval: number = 0; // force refresh on each indexer operation
  readonly connection = share(new IDBConnection(this.options));
  override isReadonly = false;
  private readonly data = new DataStruct();
  private readonly tableUpdate$ = new Subject<string>();

  /**
   * The write operations of IndexedDBIndexerStorage are first cached in pendingUpdates,
   * and then committed to IndexedDB in a batch through the refresh method.
   */
  private readonly pendingUpdates: Record<
    keyof IndexerSchema,
    {
      deleteByQueries: Query<any>[];
      deletes: string[];
      inserts: IndexerDocument[];
      updates: IndexerDocument[];
    }
  > = {
    doc: { deleteByQueries: [], deletes: [], inserts: [], updates: [] },
    block: { deleteByQueries: [], deletes: [], inserts: [], updates: [] },
  };

  get channel() {
    return this.connection.inner.channel;
  }

  get database() {
    return this.connection.inner.db;
  }

  constructor(private readonly options: IDBConnectionOptions) {
    super();
  }

  override async search<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(table: T, query: Query<T>, options?: O): Promise<SearchResult<T, O>> {
    const trx = await this.data.readonly(this.database);
    return this.data.search(trx, table, query, options);
  }
  override async aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Promise<AggregateResult<T, O>> {
    const trx = await this.data.readonly(this.database);
    return this.data.aggregate(trx, table, query, field as string, options);
  }
  override search$<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(table: T, query: Query<T>, options?: O): Observable<SearchResult<T, O>> {
    return merge(of(1), this.watchTableUpdated(table)).pipe(
      throttleTime(3000, undefined, { leading: true, trailing: true }),
      exhaustMapWithTrailing(() => {
        return fromPromise(async () => {
          try {
            const trx = await this.data.readonly(this.database);
            return await this.data.search(trx, table, query, options);
          } catch (error) {
            console.error('search error', error);
            throw error;
          }
        }).pipe(backoffRetry());
      })
    );
  }
  override aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Observable<AggregateResult<T, O>> {
    return merge(of(1), this.watchTableUpdated(table)).pipe(
      throttleTime(3000, undefined, { leading: true, trailing: true }),
      exhaustMapWithTrailing(() => {
        return fromPromise(async () => {
          try {
            const trx = await this.data.readonly(this.database);
            return await this.data.aggregate(
              trx,
              table,
              query,
              field as string,
              options
            );
          } catch (error) {
            console.error('aggregate error', error);
            throw error;
          }
        }).pipe(backoffRetry());
      })
    );
  }

  override async deleteByQuery<T extends keyof IndexerSchema>(
    table: T,
    query: Query<T>
  ): Promise<void> {
    this.pendingUpdates[table].deleteByQueries.push(query);
  }

  override insert<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument
  ): Promise<void> {
    this.pendingUpdates[table].inserts.push(document);
    return Promise.resolve();
  }

  override delete<T extends keyof IndexerSchema>(
    table: T,
    id: string
  ): Promise<void> {
    this.pendingUpdates[table].deletes.push(id);
    return Promise.resolve();
  }

  override update<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument
  ): Promise<void> {
    this.pendingUpdates[table].updates.push(document);
    return Promise.resolve();
  }

  override async refresh<T extends keyof IndexerSchema>(
    table: T
  ): Promise<void> {
    const trx = await this.data.readwrite(this.database);
    const tables = table ? [table] : (['doc', 'block'] as const);
    for (const table of tables) {
      await this.data.batchWrite(
        trx,
        table,
        this.pendingUpdates[table].deleteByQueries,
        this.pendingUpdates[table].deletes,
        this.pendingUpdates[table].inserts,
        this.pendingUpdates[table].updates
      );
      this.pendingUpdates[table] = {
        deleteByQueries: [],
        deletes: [],
        inserts: [],
        updates: [],
      };
    }
    this.emitTableUpdated(table);
  }

  override async refreshIfNeed(): Promise<void> {
    const needRefreshTable = Object.entries(this.pendingUpdates)
      .filter(
        ([, updates]) =>
          updates.deleteByQueries.length > 0 ||
          updates.deletes.length > 0 ||
          updates.inserts.length > 0 ||
          updates.updates.length > 0
      )
      .map(([table]) => table as keyof IndexerSchema);
    for (const table of needRefreshTable) {
      await this.refresh(table);
    }
  }

  private watchTableUpdated(table: keyof IndexerSchema) {
    return new Observable(subscriber => {
      const listener = (ev: MessageEvent) => {
        if (ev.data.type === 'indexer-updated' && ev.data.table === table) {
          subscriber.next(1);
        }
      };

      const subscription = this.tableUpdate$.subscribe(updatedTable => {
        if (updatedTable === table) {
          subscriber.next(1);
        }
      });

      this.channel.addEventListener('message', listener);
      return () => {
        this.channel.removeEventListener('message', listener);
        subscription.unsubscribe();
      };
    });
  }

  emitTableUpdated(table: keyof IndexerSchema) {
    this.tableUpdate$.next(table);
    this.channel.postMessage({ type: 'indexer-updated', table });
  }

  // Get the current indexer version
  // increase this number to re-index all docs
  async indexVersion(): Promise<number> {
    return Promise.resolve(1);
  }
}
