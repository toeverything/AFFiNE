import { map, merge, type Observable, of, Subject, throttleTime } from 'rxjs';

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
  broadcast$ = new Subject<number>();

  constructor(private readonly schema: Schema) {}

  write(): Promise<IndexWriter<S>> {
    return Promise.resolve(new MemoryIndexWriter(this.data, this.broadcast$));
  }

  async get(id: string): Promise<Document<S> | null> {
    return (await this.getAll([id]))[0] ?? null;
  }

  getAll(ids?: string[]): Promise<Document<S>[]> {
    return Promise.resolve(this.data.getAll(ids));
  }

  has(id: string): Promise<boolean> {
    return Promise.resolve(this.data.has(id));
  }

  async search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, any>> {
    return this.data.search(query, options);
  }

  search$(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Observable<SearchResult<any, any>> {
    return merge(of(1), this.broadcast$).pipe(
      throttleTime(500, undefined, { leading: false, trailing: true }),
      map(() => this.data.search(query, options))
    );
  }

  async aggregate(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Promise<AggregateResult<any, any>> {
    return this.data.aggregate(query, field, options);
  }

  aggregate$(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Observable<AggregateResult<S, AggregateOptions<any>>> {
    return merge(of(1), this.broadcast$).pipe(
      throttleTime(500, undefined, { leading: false, trailing: true }),
      map(() => this.data.aggregate(query, field, options))
    );
  }

  clear(): Promise<void> {
    this.data.clear();
    return Promise.resolve();
  }
}

export class MemoryIndexWriter<S extends Schema> implements IndexWriter<S> {
  inserts: Document[] = [];
  deletes: string[] = [];

  constructor(
    private readonly data: DataStruct,
    private readonly broadcast$: Subject<number>
  ) {}

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
  async search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, any>> {
    return this.data.search(query, options);
  }
  async aggregate(
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
    this.broadcast$.next(1);
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
