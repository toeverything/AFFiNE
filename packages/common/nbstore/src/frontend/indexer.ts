import { switchMap } from 'rxjs';

import type {
  AggregateOptions,
  IndexerSchema,
  IndexerStorage,
  Query,
  SearchOptions,
} from '../storage';
import type { IndexerSync } from '../sync/indexer';
import { fromPromise } from '../utils/from-promise';

export class IndexerFrontend {
  constructor(
    public readonly storage: IndexerStorage,
    public readonly sync: IndexerSync
  ) {}

  get state$() {
    return this.sync.state$;
  }

  docState$(docId: string) {
    return this.sync.docState$(docId);
  }

  async search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O
  ) {
    await this.waitForConnected();
    return this.storage.search(table, query, options);
  }

  async aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(table: T, query: Query<T>, field: keyof IndexerSchema[T], options?: O) {
    await this.waitForConnected();
    return this.storage.aggregate(table, query, field, options);
  }

  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O
  ) {
    return fromPromise(signal => this.waitForConnected(signal)).pipe(
      switchMap(() => this.storage.search$(table, query, options))
    );
  }

  aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(table: T, query: Query<T>, field: keyof IndexerSchema[T], options?: O) {
    return fromPromise(signal => this.waitForConnected(signal)).pipe(
      switchMap(() => this.storage.aggregate$(table, query, field, options))
    );
  }

  addPriority(docId: string, priority: number) {
    return this.sync.addPriority(docId, priority);
  }

  private waitForConnected(signal?: AbortSignal) {
    return this.storage.connection.waitForConnected(signal);
  }

  waitForCompleted(signal?: AbortSignal) {
    return this.sync.waitForCompleted(signal);
  }

  waitForDocCompleted(docId: string, signal?: AbortSignal) {
    return this.sync.waitForDocCompleted(docId, signal);
  }

  waitForDocCompletedWithPriority(
    docId: string,
    priority: number,
    signal?: AbortSignal
  ) {
    const undo = this.addPriority(docId, priority);
    return this.sync.waitForDocCompleted(docId, signal).finally(() => undo());
  }
}
