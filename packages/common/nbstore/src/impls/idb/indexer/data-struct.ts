import { type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';

import {
  type AggregateOptions,
  type AggregateResult,
  type IndexerDocument,
  type IndexerFieldSchema,
  IndexerSchema,
  type Query,
  type SearchOptions,
  type SearchResult,
} from '../../../storage';
import { shallowEqual } from '../../../utils/shallow-equal';
import type { DocStorageSchema } from '../schema';
import { highlighter } from './highlighter';
import {
  BooleanInvertedIndex,
  FullTextInvertedIndex,
  IntegerInvertedIndex,
  type InvertedIndex,
  StringInvertedIndex,
} from './inverted-index';
import { Match } from './match';

export type DataStructRWTransaction = IDBPTransaction<
  DocStorageSchema,
  ArrayLike<StoreNames<DocStorageSchema>>,
  'readwrite'
>;

export type DataStructROTransaction = IDBPTransaction<
  DocStorageSchema,
  ArrayLike<StoreNames<DocStorageSchema>>,
  'readonly' | 'readwrite'
>;

let debugMarkCount = 0;

export class DataStruct {
  database: IDBPDatabase<DocStorageSchema> = null as any;
  invertedIndex = new Map<string, Map<string, InvertedIndex>>();

  constructor() {
    for (const [tableName, table] of Object.entries(IndexerSchema)) {
      const tableInvertedIndex = new Map<string, InvertedIndex>();

      for (const [fieldName, type] of Object.entries(table)) {
        const typeInfo: IndexerFieldSchema =
          typeof type === 'string' ? { type } : type;
        if ('index' in typeInfo && typeInfo.index === false) {
          // If index is false, we don't need to create an inverted index for this field.
          continue;
        }
        if (typeInfo.type === 'String') {
          tableInvertedIndex.set(
            fieldName,
            new StringInvertedIndex(tableName, fieldName)
          );
        } else if (typeInfo.type === 'Integer') {
          tableInvertedIndex.set(
            fieldName,
            new IntegerInvertedIndex(tableName, fieldName)
          );
        } else if (typeInfo.type === 'FullText') {
          tableInvertedIndex.set(
            fieldName,
            new FullTextInvertedIndex(tableName, fieldName)
          );
        } else if (typeInfo.type === 'Boolean') {
          tableInvertedIndex.set(
            fieldName,
            new BooleanInvertedIndex(tableName, fieldName)
          );
        } else {
          throw new Error(`Field type '${typeInfo.type}' not supported`);
        }
      }

      this.invertedIndex.set(tableName, tableInvertedIndex);
    }
  }

  private async update(
    trx: DataStructRWTransaction,
    table: keyof IndexerSchema,
    document: IndexerDocument
  ) {
    using _ = await this.measure(`update`);
    const existsNid = await trx
      .objectStore('indexerRecords')
      .index('id')
      .getKey([table, document.id]);

    const exists = existsNid
      ? await trx.objectStore('indexerRecords').get(existsNid)
      : null;

    if (!existsNid || !exists) {
      // if not exists, return
      return;
    }

    // delete exists one
    await this.deleteByNid(trx, existsNid);

    const dataMap = new Map([...exists.data, ...document.fields]); // merge exists data with new data
    const nid = await trx
      .objectStore('indexerRecords')
      .put({ table, id: document.id, data: dataMap });

    for (const [key, values] of dataMap) {
      const type = IndexerSchema[table][
        key as keyof IndexerSchema[typeof table]
      ] as IndexerFieldSchema;
      if (!type) {
        continue;
      }

      const typeInfo = typeof type === 'string' ? { type } : type;
      if (typeInfo.index !== false) {
        // If index is false, the field will not be indexed
        const iidx = this.invertedIndex.get(table)?.get(key);
        if (!iidx) {
          continue;
        }
        using _ = await this.measure(`insert[${typeInfo.type}]`);
        await iidx.insert(trx, nid, values);
      }
    }
  }

  private async insert(
    trx: DataStructRWTransaction,
    table: keyof IndexerSchema,
    document: IndexerDocument
  ) {
    using _ = await this.measure(`insert`);
    const existsNid = await trx
      .objectStore('indexerRecords')
      .index('id')
      .getKey([table, document.id]);

    if (existsNid) {
      // delete exists one
      await this.deleteByNid(trx, existsNid);
    }

    const dataMap = document.fields;

    const nid = await trx
      .objectStore('indexerRecords')
      .put({ table, id: document.id, data: dataMap });

    for (const [key, values] of dataMap) {
      const type = IndexerSchema[table][
        key as keyof IndexerSchema[typeof table]
      ] as IndexerFieldSchema;
      if (!type) {
        continue;
      }

      const typeInfo = typeof type === 'string' ? { type } : type;
      if (typeInfo.index !== false) {
        // If index is false, the field will not be indexed
        const iidx = this.invertedIndex.get(table)?.get(key);
        if (!iidx) {
          continue;
        }
        using _ = await this.measure(`insert[${typeInfo.type}]`);
        await iidx.insert(trx, nid, values);
      }
    }
  }

  private async deleteByNid(trx: DataStructRWTransaction, nid: number) {
    await trx.objectStore('indexerRecords').delete(nid);

    const indexIds = await trx
      .objectStore('invertedIndex')
      .index('nid')
      .getAllKeys(nid);

    await Promise.all(
      indexIds.map(indexId => trx.objectStore('invertedIndex').delete(indexId))
    );
  }

  private async delete(
    trx: DataStructRWTransaction,
    table: keyof IndexerSchema,
    id: string
  ) {
    using _ = await this.measure(`delete`);
    const nid = await trx
      .objectStore('indexerRecords')
      .index('id')
      .getKey([table, id]);

    if (nid) {
      await this.deleteByNid(trx, nid);
    } else {
      return;
    }
  }

  private async deleteByQuery(
    trx: DataStructRWTransaction,
    table: keyof IndexerSchema,
    query: Query<any>
  ) {
    using _ = await this.measure(`deleteByQuery`);
    const match = await this.queryRaw(trx, table, query);

    for (const nid of match.scores.keys()) {
      await this.deleteByNid(trx, nid);
    }
  }

  async batchWrite(
    trx: DataStructRWTransaction,
    table: keyof IndexerSchema,
    deleteByQueries: Query<any>[],
    deletes: string[],
    inserts: IndexerDocument<any>[],
    updates: IndexerDocument<any>[]
  ) {
    using _ = await this.measure(`batchWrite`);
    for (const query of deleteByQueries) {
      await this.deleteByQuery(trx, table, query);
    }
    for (const del of deletes) {
      await this.delete(trx, table, del);
    }
    for (const inst of inserts) {
      await this.insert(trx, table, inst);
    }
    for (const update of updates) {
      await this.update(trx, table, update);
    }
  }

  async matchAll(
    trx: DataStructROTransaction,
    table: keyof IndexerSchema
  ): Promise<Match> {
    const allNids = await trx
      .objectStore('indexerRecords')
      .index('table')
      .getAllKeys(table);
    const match = new Match();

    for (const nid of allNids) {
      match.addScore(nid, 1);
    }
    return match;
  }

  async queryRaw(
    trx: DataStructROTransaction,
    table: keyof IndexerSchema,
    query: Query<any>,
    cache: QueryCache = new QueryCache()
  ): Promise<Match> {
    const cached = cache.get(query);
    if (cached) {
      return cached;
    }

    const result = await (async () => {
      using _ = await this.measure(`query[${query.type}]`);
      if (query.type === 'match') {
        const iidx = this.invertedIndex.get(table)?.get(query.field as string);
        if (!iidx) {
          return new Match();
        }
        return await iidx.match(trx, query.match);
      } else if (query.type === 'boolean') {
        const weights = [];
        for (const q of query.queries) {
          weights.push(await this.queryRaw(trx, table, q, cache));
        }
        if (query.occur === 'must') {
          return weights.reduce((acc, w) => acc.and(w));
        } else if (query.occur === 'must_not') {
          const total = weights.reduce((acc, w) => acc.and(w));
          return (await this.matchAll(trx, table)).exclude(total);
        } else if (query.occur === 'should') {
          return weights.reduce((acc, w) => acc.or(w));
        }
      } else if (query.type === 'all') {
        return await this.matchAll(trx, table);
      } else if (query.type === 'boost') {
        return (await this.queryRaw(trx, table, query.query, cache)).boost(
          query.boost
        );
      } else if (query.type === 'exists') {
        const iidx = this.invertedIndex.get(table)?.get(query.field as string);
        if (!iidx) {
          return new Match();
        }
        return await iidx.all(trx);
      }
      throw new Error(`Query type '${query.type}' not supported`);
    })();

    cache.set(query, result);

    return result;
  }

  async clear(trx: DataStructRWTransaction) {
    await trx.objectStore('indexerRecords').clear();
    await trx.objectStore('invertedIndex').clear();
    await trx.objectStore('indexerMetadata').clear();
  }

  async search(
    trx: DataStructROTransaction,
    table: keyof IndexerSchema,
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): Promise<SearchResult<any, any>> {
    const pagination = {
      skip: options.pagination?.skip ?? 0,
      limit: options.pagination?.limit ?? 100,
    };

    const match = await this.queryRaw(trx, table, query);

    const nids = match
      .toArray()
      .slice(pagination.skip, pagination.skip + pagination.limit);

    const nodes = [];
    for (const nid of nids) {
      const record = await trx.objectStore('indexerRecords').get(nid);
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
  }

  async aggregate(
    trx: DataStructROTransaction,
    table: keyof IndexerSchema,
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): Promise<AggregateResult<any, any>> {
    const pagination = {
      skip: options.pagination?.skip ?? 0,
      limit: options.pagination?.limit ?? 100,
    };

    const hitPagination = options.hits
      ? {
          skip: options.hits.pagination?.skip ?? 0,
          limit: options.hits.pagination?.limit ?? 3,
        }
      : { skip: 0, limit: 0 };

    const match = await this.queryRaw(trx, table, query);

    const nids = match.toArray();

    const buckets: {
      key: string;
      nids: number[];
      hits: SearchResult<any, any>['nodes'];
    }[] = [];

    for (const nid of nids) {
      const record = await trx.objectStore('indexerRecords').get(nid);
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
                  bucket.nids.length > hitPagination.limit + hitPagination.skip,
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
  }

  async readonly(database: IDBPDatabase<DocStorageSchema>) {
    return database.transaction(
      ['indexerRecords', 'invertedIndex', 'indexerMetadata'],
      'readonly',
      { durability: 'relaxed' }
    );
  }

  async readwrite(database: IDBPDatabase<DocStorageSchema>) {
    return database.transaction(
      ['indexerRecords', 'invertedIndex', 'indexerMetadata'],
      'readwrite',
      { durability: 'relaxed' }
    );
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

  async measure(name: string) {
    const count = debugMarkCount++;
    performance.mark(`${name}Start(${count})`);
    return {
      [Symbol.dispose]: () => {
        performance.mark(`${name}End(${count})`);
        performance.measure(
          `${name}`,
          `${name}Start(${count})`,
          `${name}End(${count})`
        );
      },
    };
  }
}
class QueryCache {
  private readonly cache: [Query<any>, Match][] = [];

  get(query: Query<any>) {
    return this.cache.find(q => shallowEqual(q[0], query))?.[1];
  }

  set(query: Query<any>, match: Match) {
    this.cache.push([query, match]);
  }
}
