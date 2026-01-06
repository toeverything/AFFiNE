import { merge, Observable, of, Subject } from 'rxjs';
import { filter, throttleTime } from 'rxjs/operators';

import { share } from '../../../connection';
import type {
  AggregateOptions,
  AggregateResult,
  IndexerDocument,
  Query,
  SearchOptions,
  SearchResult,
} from '../../../storage';
import { IndexerStorageBase } from '../../../storage';
import { IndexerSchema } from '../../../storage/indexer/schema';
import { fromPromise } from '../../../utils/from-promise';
import { backoffRetry, exhaustMapWithTrailing } from '../../idb/indexer/utils';
import { NativeDBConnection, type SqliteNativeDBOptions } from '../db';
import { createNode } from './node-builder';
import { queryRaw } from './query';
import { getText, tryParseArrayField } from './utils';

export class SqliteIndexerStorage extends IndexerStorageBase {
  static readonly identifier = 'SqliteIndexerStorage';
  override readonly recommendRefreshInterval = 30 * 1000; // 5 seconds
  readonly connection: NativeDBConnection;
  readonly isReadonly = false;
  private readonly tableUpdate$ = new Subject<string>();

  constructor(options: SqliteNativeDBOptions) {
    super();
    this.connection = share(new NativeDBConnection(options));
  }

  private watchTableUpdated(table: string) {
    return this.tableUpdate$.asObservable().pipe(filter(t => t === table));
  }

  async search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O
  ): Promise<SearchResult<T, O>> {
    const match = await queryRaw(this.connection, table, query);

    // Pagination
    const limit = options?.pagination?.limit ?? 10;
    const skip = options?.pagination?.skip ?? 0;
    const ids = match.toArray();
    const pagedIds = ids.slice(skip, skip + limit);

    const nodes = [];
    for (const id of pagedIds) {
      const node = await createNode(
        this.connection,
        table,
        id,
        match.getScore(id),
        options ?? {},
        query
      );
      nodes.push(node);
    }

    return {
      pagination: {
        count: ids.length,
        limit,
        skip,
        hasMore: ids.length > skip + limit,
      },
      nodes,
    };
  }

  async aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Promise<AggregateResult<T, O>> {
    const match = await queryRaw(this.connection, table, query);
    const ids = match.toArray();

    const buckets: any[] = [];

    for (const id of ids) {
      const text = await this.connection.apis.ftsGetDocument(
        `${table}:${field as string}`,
        id
      );
      if (text) {
        let values: string[] = [text];
        const parsed = tryParseArrayField(text);
        if (parsed) {
          values = parsed;
        }

        for (const val of values) {
          let bucket = buckets.find(b => b.key === val);
          if (!bucket) {
            bucket = { key: val, count: 0, score: 0 };
            if (options?.hits) {
              bucket.hits = {
                pagination: { count: 0, limit: 0, skip: 0, hasMore: false },
                nodes: [],
              };
            }
            buckets.push(bucket);
          }
          bucket.count++;

          if (options?.hits) {
            const hitLimit = options.hits.pagination?.limit ?? 3;
            if (bucket.hits.nodes.length < hitLimit) {
              const node = await createNode(
                this.connection,
                table,
                id,
                match.getScore(id),
                options.hits,
                query
              );
              bucket.hits.nodes.push(node);
              bucket.hits.pagination.count++;
            }
          }
        }
      }
    }

    return {
      pagination: {
        count: buckets.length,
        limit: 0,
        skip: 0,
        hasMore: false,
      },
      buckets,
    };
  }

  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O
  ): Observable<SearchResult<T, O>> {
    return merge(of(1), this.watchTableUpdated(table)).pipe(
      throttleTime(3000, undefined, { leading: true, trailing: true }),
      exhaustMapWithTrailing(() => {
        return fromPromise(async () => {
          return await this.search(table, query, options);
        }).pipe(backoffRetry());
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
    options?: O
  ): Observable<AggregateResult<T, O>> {
    return merge(of(1), this.watchTableUpdated(table)).pipe(
      throttleTime(3000, undefined, { leading: true, trailing: true }),
      exhaustMapWithTrailing(() => {
        return fromPromise(async () => {
          return await this.aggregate(table, query, field, options);
        }).pipe(backoffRetry());
      })
    );
  }

  async deleteByQuery<T extends keyof IndexerSchema>(
    table: T,
    query: Query<T>
  ): Promise<void> {
    const match = await queryRaw(this.connection, table, query);
    const ids = match.toArray();
    for (const id of ids) {
      await this.delete(table, id);
    }
  }

  async insert<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void> {
    const schema = IndexerSchema[table];
    for (const [field, values] of document.fields) {
      const fieldSchema = schema[field];
      // @ts-expect-error
      const shouldIndex = fieldSchema.index !== false;
      // @ts-expect-error
      const shouldStore = fieldSchema.store !== false;

      if (!shouldStore && !shouldIndex) continue;

      const text = getText(values);

      if (typeof text === 'string') {
        await this.connection.apis.ftsAddDocument(
          `${table}:${field as string}`,
          document.id,
          text,
          shouldIndex
        );
      }
    }
    this.tableUpdate$.next(table);
  }

  async delete<T extends keyof IndexerSchema>(
    table: T,
    id: string
  ): Promise<void> {
    const schema = IndexerSchema[table];
    for (const field of Object.keys(schema)) {
      await this.connection.apis.ftsDeleteDocument(`${table}:${field}`, id);
    }
    this.tableUpdate$.next(table);
  }

  async update<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void> {
    // Update is essentially insert (overwrite)
    return this.insert(table, document);
  }

  async refresh<T extends keyof IndexerSchema>(_table: T): Promise<void> {
    // No-op for memory index
  }

  async refreshIfNeed(): Promise<void> {
    await this.connection.apis.ftsFlushIndex();
  }

  async indexVersion(): Promise<number> {
    return this.connection.apis.ftsIndexVersion();
  }
}
