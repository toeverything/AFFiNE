import type { Document } from './document';
import type { Schema } from './schema';
import type { Searcher, Subscriber } from './searcher';

export interface Index<S extends Schema>
  extends IndexReader<S>,
    Searcher<S>,
    Subscriber<S> {
  write(): Promise<IndexWriter<S>>;

  clear(): Promise<void>;
}

export interface IndexWriter<S extends Schema>
  extends IndexReader<S>,
    Searcher<S> {
  insert(document: Document<S>): void;

  put(document: Document<S>): void;

  delete(id: string): void;

  // TODO(@eyhn)
  // deleteByQuery(query: Query<S>): void;

  commit(): Promise<void>;

  rollback(): void;
}

export interface IndexReader<S extends Schema> {
  get(id: string): Promise<Document<S> | null>;

  getAll(ids?: string[]): Promise<Document<S>[]>;

  has(id: string): Promise<boolean>;
}

export interface IndexStorage {
  getIndex<S extends Schema>(name: string, schema: S): Index<S>;
}
