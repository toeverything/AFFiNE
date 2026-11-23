import type { IndexerSchema } from './schema';

export type MatchQuery<T extends keyof IndexerSchema> = {
  type: 'match';
  field: keyof IndexerSchema[T];
  match: string;
};

export type BoostQuery = {
  type: 'boost';
  query: Query<any>;
  boost: number;
};

export type BooleanQuery<T extends keyof IndexerSchema> = {
  type: 'boolean';
  occur: 'should' | 'must' | 'must_not';
  queries: Query<T>[];
};

export type ExistsQuery<T extends keyof IndexerSchema> = {
  type: 'exists';
  field: keyof IndexerSchema[T];
};

export type AllQuery = {
  type: 'all';
};

export type Query<T extends keyof IndexerSchema> =
  | BooleanQuery<T>
  | MatchQuery<T>
  | AllQuery
  | ExistsQuery<T>
  | BoostQuery;
