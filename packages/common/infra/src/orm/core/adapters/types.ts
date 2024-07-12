import type { Key, TableOptions } from '../types';

export interface TableAdapterOptions extends TableOptions {
  keyField: string;
}

type WhereEqCondition = {
  field: string;
  value: any;
};

type WhereByKeyCondition = {
  byKey: Key;
};

// currently only support eq condition
// TODO(@forehalo): on the way [gt, gte, lt, lte, in, notIn, like, notLike, isNull, isNotNull, And, Or]
export type WhereCondition = WhereEqCondition[] | WhereByKeyCondition;
export type Select = '*' | 'key' | string[];

export type InsertQuery = {
  data: any;
  select?: Select;
};

export type DeleteQuery = {
  where?: WhereCondition;
};

export type UpdateQuery = {
  where?: WhereCondition;
  data: any;
  select?: Select;
};

export type FindQuery = {
  where?: WhereCondition;
  select?: Select;
};

export type ObserveQuery = {
  where?: WhereCondition;
  select?: Select;
  callback: (data: any[]) => void;
};

export type Query =
  | InsertQuery
  | DeleteQuery
  | UpdateQuery
  | FindQuery
  | ObserveQuery;

export interface TableAdapter {
  setup(opts: TableAdapterOptions): void;
  dispose(): void;

  toObject(record: any): Record<string, any>;
  insert(query: InsertQuery): any;
  update(query: UpdateQuery): any[];
  delete(query: DeleteQuery): void;
  find(query: FindQuery): any[];
  observe(query: ObserveQuery): () => void;
}

export interface DBAdapter {
  table(tableName: string): TableAdapter;
}
