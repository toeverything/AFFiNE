export * from './indexer/document';
export * from './indexer/field-type';
export * from './indexer/query';
export * from './indexer/schema';

import type { Observable } from 'rxjs';

import type { Connection } from '../connection';
import type { IndexerDocument } from './indexer/document';
import type { Query } from './indexer/query';
import type { IndexerSchema } from './indexer/schema';
import type { Storage } from './storage';

export interface IndexerStorage extends Storage {
  readonly storageType: 'indexer';
  readonly isReadonly: boolean;
  readonly recommendRefreshInterval: number; // 100ms

  search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O
  ): Promise<SearchResult<T, O>>;

  aggregate<T extends keyof IndexerSchema, const O extends AggregateOptions<T>>(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Promise<AggregateResult<T, O>>;

  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O
  ): Observable<SearchResult<T, O>>;

  aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Observable<AggregateResult<T, O>>;

  deleteByQuery<T extends keyof IndexerSchema>(
    table: T,
    query: Query<T>
  ): Promise<void>;

  insert<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void>;

  delete<T extends keyof IndexerSchema>(table: T, id: string): Promise<void>;

  update<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void>;

  refresh<T extends keyof IndexerSchema>(table: T): Promise<void>;
  refreshIfNeed(): Promise<void>;
  indexVersion(): Promise<number>;
}

type ResultPagination = {
  count: number;
  limit: number;
  skip: number;
  hasMore: boolean;
};

type PaginationOption = { limit?: number; skip?: number };

type HighlightAbleField<T extends keyof IndexerSchema> = {
  [K in keyof IndexerSchema[T]]: IndexerSchema[T][K] extends 'FullText'
    ? K
    : never;
}[keyof IndexerSchema[T]];

export type SearchOptions<T extends keyof IndexerSchema> = {
  pagination?: PaginationOption;
  highlights?: { field: HighlightAbleField<T>; before: string; end: string }[];
  fields?: (keyof IndexerSchema[T])[];
};

export type SearchResult<
  T extends keyof IndexerSchema,
  O extends SearchOptions<T>,
> = {
  pagination: ResultPagination;
  nodes: ({ id: string; score: number } & (O['fields'] extends any[]
    ? { fields: { [key in O['fields'][number]]: string | string[] } }
    : unknown) &
    (O['highlights'] extends any[]
      ? { highlights: { [key in O['highlights'][number]['field']]: string[] } }
      : unknown))[];
};

export interface AggregateOptions<T extends keyof IndexerSchema> {
  pagination?: PaginationOption;
  hits?: SearchOptions<T>;
}

export type AggregateResult<
  T extends keyof IndexerSchema,
  O extends AggregateOptions<T>,
> = {
  pagination: ResultPagination;
  buckets: ({
    key: string;
    score: number;
    count: number;
  } & (O['hits'] extends object
    ? { hits: SearchResult<T, O['hits']> }
    : unknown))[];
};

export abstract class IndexerStorageBase implements IndexerStorage {
  readonly storageType = 'indexer';
  readonly recommendRefreshInterval: number = 100; // 100ms
  abstract readonly connection: Connection;
  abstract readonly isReadonly: boolean;

  abstract search<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(table: T, query: Query<T>, options?: O): Promise<SearchResult<T, O>>;

  abstract aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Promise<AggregateResult<T, O>>;

  abstract search$<
    T extends keyof IndexerSchema,
    const O extends SearchOptions<T>,
  >(table: T, query: Query<T>, options?: O): Observable<SearchResult<T, O>>;

  abstract aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O
  ): Observable<AggregateResult<T, O>>;

  abstract deleteByQuery<T extends keyof IndexerSchema>(
    table: T,
    query: Query<T>
  ): Promise<void>;

  abstract insert<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void>;

  abstract delete<T extends keyof IndexerSchema>(
    table: T,
    id: string
  ): Promise<void>;

  abstract update<T extends keyof IndexerSchema>(
    table: T,
    document: IndexerDocument<T>
  ): Promise<void>;

  abstract refresh<T extends keyof IndexerSchema>(table: T): Promise<void>;

  abstract refreshIfNeed(): Promise<void>;

  abstract indexVersion(): Promise<number>;
}
