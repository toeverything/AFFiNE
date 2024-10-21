import type { Observable } from 'rxjs';
import { from, merge, of, Subject, throttleTime } from 'rxjs';

import { exhaustMapWithTrailing } from '../../../../utils/';
import {
  type AggregateOptions,
  type AggregateResult,
  type Document,
  type Index,
  type IndexStorage,
  type IndexWriter,
  type Query,
  type Schema,
  type SearchOptions,
  type SearchResult,
} from '../../';
import { DataStruct, type DataStructRWTransaction } from './data-struct';

export class IndexedDBIndex<S extends Schema> implements Index<S> {
  data: DataStruct = new DataStruct(this.databaseName, this.schema);
  broadcast$ = new Subject();

  constructor(
    private readonly schema: S,
    private readonly databaseName: string = 'indexer'
  ) {
    const channel = new BroadcastChannel(this.databaseName + ':indexer');
    channel.onmessage = () => {
      this.broadcast$.next(1);
    };
  }

  async get(id: string): Promise<Document<S> | null> {
    return (await this.getAll([id]))[0] ?? null;
  }

  async getAll(ids: string[]): Promise<Document<S>[]> {
    const trx = await this.data.readonly();
    return this.data.getAll(trx, ids);
  }

  async write(): Promise<IndexWriter<S>> {
    return new IndexedDBIndexWriter(this.data, await this.data.readwrite());
  }

  async has(id: string): Promise<boolean> {
    const trx = await this.data.readonly();
    return this.data.has(trx, id);
  }

  async search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, SearchOptions<any>>> {
    const trx = await this.data.readonly();
    return this.data.search(trx, query, options);
  }

  search$(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Observable<SearchResult<any, SearchOptions<any>>> {
    return merge(of(1), this.broadcast$).pipe(
      throttleTime(3000, undefined, { leading: true, trailing: true }),
      exhaustMapWithTrailing(() => {
        return from(
          (async () => {
            const trx = await this.data.readonly();
            return this.data.search(trx, query, options);
          })()
        );
      })
    );
  }

  async aggregate(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Promise<AggregateResult<any, AggregateOptions<any>>> {
    const trx = await this.data.readonly();
    return this.data.aggregate(trx, query, field, options);
  }

  aggregate$(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Observable<AggregateResult<S, AggregateOptions<any>>> {
    return merge(of(1), this.broadcast$).pipe(
      throttleTime(3000, undefined, { leading: true, trailing: true }),
      exhaustMapWithTrailing(() => {
        return from(
          (async () => {
            const trx = await this.data.readonly();
            return this.data.aggregate(trx, query, field, options);
          })()
        );
      })
    );
  }

  async clear(): Promise<void> {
    const trx = await this.data.readwrite();
    return this.data.clear(trx);
  }
}

export class IndexedDBIndexWriter<S extends Schema> implements IndexWriter<S> {
  inserts: Document[] = [];
  deletes: string[] = [];
  channel = new BroadcastChannel(this.data.databaseName + ':indexer');

  constructor(
    private readonly data: DataStruct,
    private readonly trx: DataStructRWTransaction
  ) {}

  async get(id: string): Promise<Document<S> | null> {
    return (await this.getAll([id]))[0] ?? null;
  }

  async getAll(ids?: string[]): Promise<Document<S>[]> {
    const trx = await this.data.readonly();
    return this.data.getAll(trx, ids);
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

  async commit(): Promise<void> {
    await this.data.batchWrite(this.trx, this.deletes, this.inserts);
    this.trx.commit();
    this.channel.postMessage(1);
  }

  rollback(): void {}

  has(id: string): Promise<boolean> {
    return this.data.has(this.trx, id);
  }

  async search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, SearchOptions<any>>> {
    return this.data.search(this.trx, query, options);
  }

  async aggregate(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Promise<AggregateResult<any, AggregateOptions<any>>> {
    return this.data.aggregate(this.trx, query, field, options);
  }
}

export class IndexedDBIndexStorage implements IndexStorage {
  constructor(private readonly databaseName: string) {}
  getIndex<S extends Schema>(name: string, s: S): Index<S> {
    return new IndexedDBIndex(s, this.databaseName + ':' + name);
  }
}
