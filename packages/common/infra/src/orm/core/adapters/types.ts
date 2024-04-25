import type { DBSchemaBuilder, TableSchemaBuilder } from '../schema';

export interface Key {
  toString(): string;
}

export interface TableOptions {
  schema: TableSchemaBuilder;
}

export interface TableAdapter<K extends Key = any, T = unknown> {
  setup(opts: TableOptions): void;
  dispose(): void;
  create(key: K, data: Partial<T>): T;
  get(key: K): T;
  subscribe(key: K, callback: (data: T) => void): () => void;
  keys(): K[];
  subscribeKeys(callback: (keys: K[]) => void): () => void;
  update(key: K, data: Partial<T>): T;
  delete(key: K): void;
}

export interface DBAdapter {
  connect(db: DBSchemaBuilder): Promise<void>;
  disconnect(db: DBSchemaBuilder): Promise<void>;

  table(tableName: string): TableAdapter;
}
