import type {
  AggregateOptions,
  AggregateResult,
  Document,
  Index,
  IndexStorage,
  IndexWriter,
  Query,
  Schema,
  SearchOptions,
  SearchResult,
} from '../../';
import { DataStruct } from './data-struct';

export class MemoryIndex<S extends Schema> implements Index<S> {
  private readonly data: DataStruct = new DataStruct(this.schema);

  constructor(private readonly schema: Schema) {}

  write(): Promise<IndexWriter<S>> {
    return Promise.resolve(new MemoryIndexWriter(this.data));
  }

  async get(id: string): Promise<Document<S> | null> {
    return (await this.getAll([id]))[0] ?? null;
  }

  getAll(ids: string[]): Promise<Document<S>[]> {
    return Promise.resolve(this.data.getAll(ids));
  }

  has(id: string): Promise<boolean> {
    return Promise.resolve(this.data.has(id));
  }

  search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, any>> {
    return this.data.search(query, options);
  }

  aggregate(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Promise<AggregateResult<any, any>> {
    return this.data.aggregate(query, field, options);
  }

  clear(): Promise<void> {
    this.data.clear();
    return Promise.resolve();
  }
}

export class MemoryIndexWriter<S extends Schema> implements IndexWriter<S> {
  inserts: Document[] = [];
  deletes: string[] = [];

  constructor(private readonly data: DataStruct) {}

  async get(id: string): Promise<Document<S> | null> {
    return (await this.getAll([id]))[0] ?? null;
  }

  getAll(ids: string[]): Promise<Document<S>[]> {
    return Promise.resolve(this.data.getAll(ids));
  }

  insert(document: Document): void {
    this.inserts.push(document);
  }
  delete(id: string): void {
    this.deletes.push(id);
  }
  put(document: Document): void {
    this.delete(document.id);
    this.insert(document);
  }
  search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, any>> {
    return this.data.search(query, options);
  }
  aggregate(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Promise<AggregateResult<any, any>> {
    return this.data.aggregate(query, field, options);
  }
  commit(): Promise<void> {
    for (const del of this.deletes) {
      this.data.delete(del);
    }
    for (const inst of this.inserts) {
      this.data.insert(inst);
    }
    return Promise.resolve();
  }
  rollback(): void {}
  has(id: string): Promise<boolean> {
    return Promise.resolve(this.data.has(id));
  }
}

export class MemoryIndexStorage implements IndexStorage {
  getIndex<S extends Schema>(_: string, schema: S): Index<S> {
    return new MemoryIndex(schema);
  }
}
