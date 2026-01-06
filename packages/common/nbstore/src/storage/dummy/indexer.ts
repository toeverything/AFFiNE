import { NEVER, type Observable } from 'rxjs';

import { DummyConnection } from '../../connection';
import {
  type AggregateOptions,
  type AggregateResult,
  type IndexerDocument,
  type IndexerSchema,
  IndexerStorageBase,
  type Query,
  type SearchOptions,
  type SearchResult,
} from '../indexer';

export class DummyIndexerStorage extends IndexerStorageBase {
  readonly isReadonly = true;
  readonly connection = new DummyConnection();

  override search<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(_table: T, _query: Query<T>, _options?: O): Promise<SearchResult<T, O>> {
    return Promise.resolve({
      pagination: { count: 0, limit: 0, skip: 0, hasMore: false },
      nodes: [],
    });
  }
  override aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    _table: T,
    _query: Query<T>,
    _field: keyof IndexerSchema[T],
    _options?: O
  ): Promise<AggregateResult<T, O>> {
    return Promise.resolve({
      pagination: { count: 0, limit: 0, skip: 0, hasMore: false },
      buckets: [],
    });
  }
  override search$<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(_table: T, _query: Query<T>, _options?: O): Observable<SearchResult<T, O>> {
    return NEVER;
  }
  override aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    _table: T,
    _query: Query<T>,
    _field: keyof IndexerSchema[T],
    _options?: O
  ): Observable<AggregateResult<T, O>> {
    return NEVER;
  }

  override deleteByQuery<T extends keyof IndexerSchema>(
    _table: T,
    _query: Query<T>
  ): Promise<void> {
    return Promise.resolve();
  }

  override insert<T extends keyof IndexerSchema>(
    _table: T,
    _document: IndexerDocument<T>
  ): Promise<void> {
    return Promise.resolve();
  }
  override delete<T extends keyof IndexerSchema>(
    _table: T,
    _id: string
  ): Promise<void> {
    return Promise.resolve();
  }
  override update<T extends keyof IndexerSchema>(
    _table: T,
    _document: IndexerDocument<T>
  ): Promise<void> {
    return Promise.resolve();
  }
  override refresh<T extends keyof IndexerSchema>(_table: T): Promise<void> {
    return Promise.resolve();
  }
  override async refreshIfNeed(): Promise<void> {
    return Promise.resolve();
  }
  override async indexVersion(): Promise<number> {
    return Promise.resolve(0);
  }
}
