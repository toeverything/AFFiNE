import type {
  AggregateOptions,
  IndexerSchema,
  Query,
  SearchOptions,
} from '../storage';
import type { IndexerPreferOptions, IndexerSync } from '../sync/indexer';

export class IndexerFrontend {
  constructor(public readonly sync: IndexerSync) {}

  get state$() {
    return this.sync.state$;
  }

  docState$(docId: string) {
    return this.sync.docState$(docId);
  }

  async search<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ) {
    return this.sync.search(table, query, options);
  }

  async aggregate<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ) {
    return this.sync.aggregate(table, query, field, options);
  }

  search$<T extends keyof IndexerSchema, const O extends SearchOptions<T>>(
    table: T,
    query: Query<T>,
    options?: O & { prefer?: IndexerPreferOptions }
  ) {
    return this.sync.search$(table, query, options);
  }

  aggregate$<
    T extends keyof IndexerSchema,
    const O extends AggregateOptions<T>,
  >(
    table: T,
    query: Query<T>,
    field: keyof IndexerSchema[T],
    options?: O & { prefer?: IndexerPreferOptions }
  ) {
    return this.sync.aggregate$(table, query, field, options);
  }

  addPriority(docId: string, priority: number) {
    return this.sync.addPriority(docId, priority);
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
