import { DebugLogger } from '@affine/debug';
import {
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  openDB,
  type StoreNames,
} from 'idb';

import {
  type AggregateOptions,
  type AggregateResult,
  Document,
  type Query,
  type Schema,
  type SearchOptions,
  type SearchResult,
} from '../../';
import { highlighter } from './highlighter';
import {
  BooleanInvertedIndex,
  FullTextInvertedIndex,
  IntegerInvertedIndex,
  type InvertedIndex,
  StringInvertedIndex,
} from './inverted-index';
import { Match } from './match';

const logger = new DebugLogger('indexeddb');

export interface IndexDB extends DBSchema {
  kvMetadata: {
    key: string;
    value: {
      key: string;
      value: any;
    };
  };
  records: {
    key: number;
    value: {
      id: string;
      data: Map<string, string[]>;
    };
    indexes: { id: string };
  };
  invertedIndex: {
    key: number;
    value: {
      nid: number;
      pos?: {
        i: number /* index */;
        l: number /* length */;
        rs: [number, number][] /* ranges: [start, end] */;
      };
      key: ArrayBuffer;
    };
    indexes: { key: ArrayBuffer; nid: number };
  };
}

export type DataStructRWTransaction = IDBPTransaction<
  IndexDB,
  ArrayLike<StoreNames<IndexDB>>,
  'readwrite'
>;

export type DataStructROTransaction = IDBPTransaction<
  IndexDB,
  ArrayLike<StoreNames<IndexDB>>,
  'readonly' | 'readwrite'
>;

export class DataStruct {
  private initializePromise: Promise<void> | null = null;
  database: IDBPDatabase<IndexDB> = null as any;
  invertedIndex = new Map<string, InvertedIndex>();

  constructor(
    readonly databaseName: string,
    readonly schema: Schema
  ) {
    for (const [key, type] of Object.entries(schema)) {
      const typeInfo = typeof type === 'string' ? { type } : type;
      if (typeInfo.index === false) {
        // If index is false, we don't need to create an inverted index for this field.
        continue;
      }
      if (typeInfo.type === 'String') {
        this.invertedIndex.set(key, new StringInvertedIndex(key));
      } else if (typeInfo.type === 'Integer') {
        this.invertedIndex.set(key, new IntegerInvertedIndex(key));
      } else if (typeInfo.type === 'FullText') {
        this.invertedIndex.set(key, new FullTextInvertedIndex(key));
      } else if (type === 'Boolean') {
        this.invertedIndex.set(key, new BooleanInvertedIndex(key));
      } else {
        throw new Error(`Field type '${type}' not supported`);
      }
    }
  }

  private async insert(trx: DataStructRWTransaction, document: Document) {
    const exists = await trx
      .objectStore('records')
      .index('id')
      .get(document.id);

    if (exists) {
      throw new Error('Document already exists');
    }

    const dataMap = new Map();

    for (const [key, values] of document.fields) {
      const type = this.schema[key as string];
      if (!type) {
        continue;
      }
      const typeInfo = typeof type === 'string' ? { type } : type;
      if (typeInfo.store !== false) {
        // If store is false, the field will not be stored
        dataMap.set(key, values);
      }
    }

    const nid = await trx.objectStore('records').add({
      id: document.id,
      data: dataMap,
    });

    for (const [key, values] of document.fields) {
      const iidx = this.invertedIndex.get(key as string);
      if (!iidx) {
        continue;
      }
      await iidx.insert(trx, nid, values);
    }
  }

  private async delete(trx: DataStructRWTransaction, id: string) {
    const nid = await trx.objectStore('records').index('id').getKey(id);

    if (nid) {
      await trx.objectStore('records').delete(nid);
    }

    const indexIds = await trx
      .objectStore('invertedIndex')
      .index('nid')
      .getAllKeys(nid);
    for (const indexId of indexIds) {
      await trx.objectStore('invertedIndex').delete(indexId);
    }
  }

  async batchWrite(
    trx: DataStructRWTransaction,
    deletes: string[],
    inserts: Document[]
  ) {
    const startTime = performance.now();
    try {
      for (const del of deletes) {
        await this.delete(trx, del);
      }
      for (const inst of inserts) {
        await this.insert(trx, inst);
      }
    } finally {
      const endTime = performance.now();
      if (BUILD_CONFIG.debug) {
        performance.measure(
          `[IndexedDB Indexer] Batch Write (${this.databaseName})`,
          {
            start: startTime,
            end: endTime,
          }
        );
      }
      logger.debug(
        `[indexer ${this.databaseName}] batchWrite`,
        endTime - startTime,
        'ms'
      );
    }
  }

  async matchAll(trx: DataStructROTransaction): Promise<Match> {
    const allNids = await trx.objectStore('records').getAllKeys();
    const match = new Match();

    for (const nid of allNids) {
      match.addScore(nid, 1);
    }
    return match;
  }

  private async queryRaw(
    trx: DataStructROTransaction,
    query: Query<any>
  ): Promise<Match> {
    if (query.type === 'match') {
      const iidx = this.invertedIndex.get(query.field as string);
      if (!iidx) {
        return new Match();
      }
      return await iidx.match(trx, query.match);
    } else if (query.type === 'boolean') {
      const weights = [];
      for (const q of query.queries) {
        weights.push(await this.queryRaw(trx, q));
      }
      if (query.occur === 'must') {
        return weights.reduce((acc, w) => acc.and(w));
      } else if (query.occur === 'must_not') {
        const total = weights.reduce((acc, w) => acc.and(w));
        return (await this.matchAll(trx)).exclude(total);
      } else if (query.occur === 'should') {
        return weights.reduce((acc, w) => acc.or(w));
      }
    } else if (query.type === 'all') {
      return await this.matchAll(trx);
    } else if (query.type === 'boost') {
      return (await this.queryRaw(trx, query.query)).boost(query.boost);
    } else if (query.type === 'exists') {
      const iidx = this.invertedIndex.get(query.field as string);
      if (!iidx) {
        return new Match();
      }
      return await iidx.all(trx);
    }
    throw new Error(`Query type '${query.type}' not supported`);
  }

  async clear(trx: DataStructRWTransaction) {
    await trx.objectStore('records').clear();
    await trx.objectStore('invertedIndex').clear();
    await trx.objectStore('kvMetadata').clear();
  }

  async search(
    trx: DataStructROTransaction,
    query: Query<any>,
    options: SearchOptions<any>
  ): Promise<SearchResult<any, any>> {
    const startTime = performance.now();
    try {
      const pagination = {
        skip: options.pagination?.skip ?? 0,
        limit: options.pagination?.limit ?? 100,
      };

      const match = await this.queryRaw(trx, query);

      const nids = match
        .toArray()
        .slice(pagination.skip, pagination.skip + pagination.limit);

      const nodes = [];
      for (const nid of nids) {
        const record = await trx.objectStore('records').get(nid);
        if (!record) {
          continue;
        }
        nodes.push(this.resultNode(record, options, match, nid));
      }

      return {
        pagination: {
          count: match.size(),
          hasMore: match.size() > pagination.limit + pagination.skip,
          limit: pagination.limit,
          skip: pagination.skip,
        },
        nodes: nodes,
      };
    } finally {
      const endTime = performance.now();
      if (BUILD_CONFIG.debug) {
        performance.measure(
          `[IndexedDB Indexer] Search (${this.databaseName})`,
          {
            detail: { query, options },
            start: startTime,
            end: endTime,
          }
        );
      }
      logger.debug(
        `[indexer ${this.databaseName}] search`,
        endTime - startTime,
        'ms',
        query
      );
    }
  }

  async aggregate(
    trx: DataStructROTransaction,
    query: Query<any>,
    field: string,
    options: AggregateOptions<any>
  ): Promise<AggregateResult<any, any>> {
    const startTime = performance.now();
    try {
      const pagination = {
        skip: options.pagination?.skip ?? 0,
        limit: options.pagination?.limit ?? 100,
      };

      const hitPagination = options.hits
        ? {
            skip: options.hits.pagination?.skip ?? 0,
            limit: options.hits.pagination?.limit ?? 3,
          }
        : {
            skip: 0,
            limit: 0,
          };

      const match = await this.queryRaw(trx, query);

      const nids = match.toArray();

      const buckets: {
        key: string;
        nids: number[];
        hits: SearchResult<any, any>['nodes'];
      }[] = [];

      for (const nid of nids) {
        const record = await trx.objectStore('records').get(nid);
        if (!record) {
          continue;
        }
        const values = record.data.get(field);
        for (const value of values ?? []) {
          let bucket;
          let bucketIndex = buckets.findIndex(b => b.key === value);
          if (bucketIndex === -1) {
            bucket = { key: value, nids: [], hits: [] };
            buckets.push(bucket);
            bucketIndex = buckets.length - 1;
          } else {
            bucket = buckets[bucketIndex];
          }

          if (
            bucketIndex >= pagination.skip &&
            bucketIndex < pagination.skip + pagination.limit
          ) {
            bucket.nids.push(nid);
            if (
              bucket.nids.length - 1 >= hitPagination.skip &&
              bucket.nids.length - 1 < hitPagination.skip + hitPagination.limit
            ) {
              bucket.hits.push(
                this.resultNode(record, options.hits ?? {}, match, nid)
              );
            }
          }
        }
      }

      return {
        buckets: buckets
          .slice(pagination.skip, pagination.skip + pagination.limit)
          .map(bucket => {
            const result = {
              key: bucket.key,
              score: match.getScore(bucket.nids[0]),
              count: bucket.nids.length,
            } as AggregateResult<any, any>['buckets'][number];

            if (options.hits) {
              (result as any).hits = {
                pagination: {
                  count: bucket.nids.length,
                  hasMore:
                    bucket.nids.length >
                    hitPagination.limit + hitPagination.skip,
                  limit: hitPagination.limit,
                  skip: hitPagination.skip,
                },
                nodes: bucket.hits,
              } as SearchResult<any, any>;
            }

            return result;
          }),
        pagination: {
          count: buckets.length,
          hasMore: buckets.length > pagination.limit + pagination.skip,
          limit: pagination.limit,
          skip: pagination.skip,
        },
      };
    } finally {
      const endTime = performance.now();
      if (BUILD_CONFIG.debug) {
        performance.measure(
          `[IndexedDB Indexer] Aggregate (${this.databaseName})`,
          {
            detail: { query, field, options },
            start: startTime,
            end: endTime,
          }
        );
      }
      logger.debug(
        `[indexer ${this.databaseName}] aggregate`,
        endTime - startTime,
        'ms'
      );
    }
  }

  async getAll(
    trx: DataStructROTransaction,
    ids?: string[]
  ): Promise<Document[]> {
    const docs = [];
    if (ids) {
      for (const id of ids) {
        const record = await trx.objectStore('records').index('id').get(id);
        if (record) {
          docs.push(Document.from(record.id, record.data));
        }
      }
    } else {
      const records = await trx.objectStore('records').getAll();
      for (const record of records) {
        docs.push(Document.from(record.id, record.data));
      }
    }

    return docs;
  }

  async has(trx: DataStructROTransaction, id: string): Promise<boolean> {
    const nid = await trx.objectStore('records').index('id').getKey(id);
    return nid !== undefined;
  }

  async readonly() {
    await this.ensureInitialized();
    return this.database.transaction(
      ['records', 'invertedIndex', 'kvMetadata'],
      'readonly',
      {
        durability: 'relaxed',
      }
    );
  }

  async readwrite() {
    await this.ensureInitialized();
    return this.database.transaction(
      ['records', 'invertedIndex', 'kvMetadata'],
      'readwrite',
      {
        durability: 'relaxed',
      }
    );
  }

  private async ensureInitialized() {
    if (this.database) {
      return;
    }
    this.initializePromise ??= this.initialize();
    await this.initializePromise;
  }

  private async initialize() {
    this.database = await openDB<IndexDB>(this.databaseName, 1, {
      upgrade(database) {
        database.createObjectStore('kvMetadata', {
          keyPath: 'key',
        });
        const recordsStore = database.createObjectStore('records', {
          autoIncrement: true,
        });
        recordsStore.createIndex('id', 'id', {
          unique: true,
        });
        const invertedIndexStore = database.createObjectStore('invertedIndex', {
          autoIncrement: true,
        });
        invertedIndexStore.createIndex('key', 'key', { unique: false });
        invertedIndexStore.createIndex('nid', 'nid', { unique: false });
      },
    });
  }

  private resultNode(
    record: { id: string; data: Map<string, string[]> },
    options: SearchOptions<any>,
    match?: Match,
    nid?: number
  ): SearchResult<any, any>['nodes'][number] {
    const node = {
      id: record.id,
      score: match && nid ? match.getScore(nid) : 1,
    } as any;

    if (options.fields) {
      const fields = {} as Record<string, string | string[]>;
      for (const field of options.fields as string[]) {
        fields[field] = record.data.get(field) ?? [''];
        if (fields[field].length === 1) {
          fields[field] = fields[field][0];
        }
      }
      node.fields = fields;
    }

    if (match && nid && options.highlights) {
      const highlights = {} as Record<string, string[]>;
      for (const { field, before, end } of options.highlights) {
        const highlightValues = match.getHighlighters(nid, field);
        if (highlightValues) {
          const rawValues = record.data.get(field) ?? [];
          highlights[field] = Array.from(highlightValues)
            .map(([index, ranges]) => {
              const raw = rawValues[index];

              if (raw) {
                return (
                  highlighter(raw, before, end, ranges, {
                    maxPrefix: 20,
                    maxLength: 50,
                  }) ?? ''
                );
              }

              return '';
            })
            .filter(Boolean);
        }
      }
      node.highlights = highlights;
    }

    return node;
  }
}
