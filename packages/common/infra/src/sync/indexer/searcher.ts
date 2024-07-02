import type { Observable } from 'rxjs';

import type { Query } from './query';
import type { Schema } from './schema';

type HighlightAbleField<S extends Schema> = {
  [K in keyof S]: S[K] extends 'FullText' ? K : never;
}[keyof S];

export interface Searcher<S extends Schema = any> {
  search<const O extends SearchOptions<S>>(
    query: Query<S>,
    options?: O
  ): Promise<SearchResult<S, O>>;
  aggregate<const O extends AggregateOptions<S>>(
    query: Query<S>,
    field: keyof S,
    options?: O
  ): Promise<AggregateResult<S, O>>;
}

export interface Subscriber<S extends Schema = any> {
  search$<const O extends SearchOptions<S>>(
    query: Query<S>,
    options?: O
  ): Observable<SearchResult<S, O>>;
  aggregate$<const O extends AggregateOptions<S>>(
    query: Query<S>,
    field: keyof S,
    options?: O
  ): Observable<AggregateResult<S, O>>;
}

type ResultPagination = {
  count: number;
  limit: number;
  skip: number;
  hasMore: boolean;
};

type PaginationOption = {
  limit?: number;
  skip?: number;
};

export type SearchOptions<S extends Schema> = {
  pagination?: PaginationOption;
  highlights?: {
    field: HighlightAbleField<S>;
    before: string;
    end: string;
  }[];
  fields?: (keyof S)[];
};

export type SearchResult<S extends Schema, O extends SearchOptions<S>> = {
  pagination: ResultPagination;
  nodes: ({
    id: string;
    score: number;
  } & (O['fields'] extends any[]
    ? { fields: { [key in O['fields'][number]]: string | string[] } }
    : unknown) &
    (O['highlights'] extends any[]
      ? { highlights: { [key in O['highlights'][number]['field']]: string[] } }
      : unknown))[];
};

export interface AggregateOptions<S extends Schema> {
  pagination?: PaginationOption;
  hits?: SearchOptions<S>;
}

export type AggregateResult<S extends Schema, O extends AggregateOptions<S>> = {
  pagination: ResultPagination;
  buckets: ({
    key: string;
    score: number;
    count: number;
  } & (O['hits'] extends object
    ? { hits: SearchResult<S, O['hits']> }
    : unknown))[];
};
