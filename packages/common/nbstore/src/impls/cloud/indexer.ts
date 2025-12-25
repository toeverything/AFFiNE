import {
  type AggregateInput,
  indexerAggregateQuery,
  indexerSearchQuery,
  type SearchInput,
} from '@affine/graphql';
import { Observable } from 'rxjs';

import {
  type AggregateOptions,
  type AggregateResult,
  type IndexerDocument,
  type IndexerSchema,
  IndexerStorageBase,
  type Query,
  type SearchOptions,
  type SearchResult,
} from '../../storage/indexer';
import { HttpConnection } from './http';

interface CloudIndexerStorageOptions {
  serverBaseUrl: string;
  id: string;
}

export class CloudIndexerStorage extends IndexerStorageBase {
  static readonly identifier = 'CloudIndexerStorage';
  readonly isReadonly = true;
  readonly connection = new HttpConnection(this.options.serverBaseUrl);

  constructor(private readonly options: CloudIndexerStorageOptions) {
    super();
  }

  override async search<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(table: T, query: Query<T>, options?: O): Promise<SearchResult<T, O>> {
    const res = await this.connection.gql({
      query: indexerSearchQuery,
      variables: {
        id: this.options.id,
        input: {
          table,
          query,
          options,
        } as SearchInput,
      },
    });
    const result = res.workspace.search as unknown as SearchResult<T, O>;
    return result;
  }

  override search$<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(table: T, query: Query<T>, options?: O): Observable<SearchResult<T, O>> {
    return new Observable(observer => {
      this.search(table, query, options)
        .then(data => {
          observer.next(data);
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
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
    const res = await this.connection.gql({
      query: indexerAggregateQuery,
      variables: {
        id: this.options.id,
        input: { table, query, field, options } as AggregateInput,
      },
    });
    const result = res.workspace.aggregate as unknown as AggregateResult<T, O>;
    return result;
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
    return new Observable(observer => {
      this.aggregate(table, query, field, options)
        .then(data => {
          observer.next(data);
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
    });
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
    return Promise.resolve(1);
  }
}
