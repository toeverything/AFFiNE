import {
  type AggregateOptions,
  type AggregateResult,
  Document,
  type Query,
  type Schema,
  type SearchOptions,
  type SearchResult,
} from '../../';
import {
  BooleanInvertedIndex,
  FullTextInvertedIndex,
  IntegerInvertedIndex,
  type InvertedIndex,
  StringInvertedIndex,
} from './inverted-index';
import { Match } from './match';

type DataRecord = {
  id: string;
  data: Map<string, string[]>;
  deleted: boolean;
};

export class DataStruct {
  records: DataRecord[] = [];

  idMap = new Map<string, number>();

  invertedIndex = new Map<string, InvertedIndex>();

  constructor(schema: Schema) {
    for (const [key, type] of Object.entries(schema)) {
      const typeInfo = typeof type === 'string' ? { type } : type;

      if (typeInfo.type === 'String') {
        this.invertedIndex.set(key, new StringInvertedIndex(key));
      } else if (typeInfo.type === 'Integer') {
        this.invertedIndex.set(key, new IntegerInvertedIndex(key));
      } else if (typeInfo.type === 'FullText') {
        this.invertedIndex.set(key, new FullTextInvertedIndex(key));
      } else if (typeInfo.type === 'Boolean') {
        this.invertedIndex.set(key, new BooleanInvertedIndex(key));
      } else {
        throw new Error(`Field type '${type}' not supported`);
      }
    }
  }

  getAll(ids?: string[]): Document[] {
    if (ids) {
      return ids
        .map(id => {
          const nid = this.idMap.get(id);
          if (nid === undefined) {
            return undefined;
          }
          return Document.from(id, this.records[nid].data);
        })
        .filter((v): v is Document => v !== undefined);
    } else {
      return this.records
        .filter(record => !record.deleted)
        .map(record => Document.from(record.id, record.data));
    }
  }

  insert(document: Document) {
    if (this.idMap.has(document.id)) {
      throw new Error('Document already exists');
    }

    this.records.push({
      id: document.id,
      data: document.fields as Map<string, string[]>,
      deleted: false,
    });

    const nid = this.records.length - 1;
    this.idMap.set(document.id, nid);
    for (const [key, values] of document.fields) {
      for (const value of values) {
        const iidx = this.invertedIndex.get(key as string);
        if (!iidx) {
          throw new Error(
            `Inverted index '${key.toString()}' not found, document not match schema`
          );
        }
        iidx.insert(nid, value);
      }
    }
  }

  delete(id: string) {
    const nid = this.idMap.get(id);
    if (nid === undefined) {
      throw new Error('Document not found');
    }

    this.records[nid].deleted = true;
    this.records[nid].data = new Map();
  }

  matchAll(): Match {
    const weight = new Match();
    for (let i = 0; i < this.records.length; i++) {
      weight.addScore(i, 1);
    }
    return weight;
  }

  clear() {
    this.records = [];
    this.idMap.clear();
    this.invertedIndex.forEach(v => v.clear());
  }

  private queryRaw(query: Query<any>): Match {
    if (query.type === 'match') {
      const iidx = this.invertedIndex.get(query.field as string);
      if (!iidx) {
        throw new Error(`Field '${query.field as string}' not found`);
      }
      return iidx.match(query.match);
    } else if (query.type === 'boolean') {
      const weights = query.queries.map(q => this.queryRaw(q));
      if (query.occur === 'must') {
        return weights.reduce((acc, w) => acc.and(w));
      } else if (query.occur === 'must_not') {
        const total = weights.reduce((acc, w) => acc.and(w));
        return this.matchAll().exclude(total);
      } else if (query.occur === 'should') {
        return weights.reduce((acc, w) => acc.or(w));
      }
    } else if (query.type === 'all') {
      return this.matchAll();
    } else if (query.type === 'boost') {
      return this.queryRaw(query.query).boost(query.boost);
    } else if (query.type === 'exists') {
      const iidx = this.invertedIndex.get(query.field as string);
      if (!iidx) {
        throw new Error(`Field '${query.field as string}' not found`);
      }
      return iidx.all();
    }
    throw new Error(`Query type '${query.type}' not supported`);
  }

  query(query: Query<any>): Match {
    return this.queryRaw(query).filter(id => !this.records[id].deleted);
  }

  search(
    query: Query<any>,
    options: SearchOptions<any> = {}
  ): SearchResult<any, any> {
    const pagination = {
      skip: options.pagination?.skip ?? 0,
      limit: options.pagination?.limit ?? 100,
    };

    const match = this.query(query);

    const nids = match
      .toArray()
      .slice(pagination.skip, pagination.skip + pagination.limit);

    return {
      pagination: {
        count: match.size(),
        hasMore: match.size() > pagination.limit + pagination.skip,
        limit: pagination.limit,
        skip: pagination.skip,
      },
      nodes: nids.map(nid => this.resultNode(match, nid, options)),
    };
  }

  aggregate(
    query: Query<any>,
    field: string,
    options: AggregateOptions<any> = {}
  ): AggregateResult<any, any> {
    const pagination = {
      skip: options.pagination?.skip ?? 0,
      limit: options.pagination?.limit ?? 100,
    };

    const match = this.query(query);

    const nids = match.toArray();

    const buckets: { key: string; nids: number[] }[] = [];

    for (const nid of nids) {
      for (const value of this.records[nid].data.get(field) ?? []) {
        let bucket = buckets.find(b => b.key === value);
        if (!bucket) {
          bucket = { key: value, nids: [] };
          buckets.push(bucket);
        }
        bucket.nids.push(nid);
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
            const hitsOptions = options.hits;
            const pagination = {
              skip: options.hits.pagination?.skip ?? 0,
              limit: options.hits.pagination?.limit ?? 3,
            };

            const hits = bucket.nids.slice(
              pagination.skip,
              pagination.skip + pagination.limit
            );

            (result as any).hits = {
              pagination: {
                count: bucket.nids.length,
                hasMore:
                  bucket.nids.length > pagination.limit + pagination.skip,
                limit: pagination.limit,
                skip: pagination.skip,
              },
              nodes: hits.map(nid => this.resultNode(match, nid, hitsOptions)),
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

  has(id: string): boolean {
    return this.idMap.has(id);
  }

  private resultNode(
    match: Match,
    nid: number,
    options: SearchOptions<any>
  ): SearchResult<any, any>['nodes'][number] {
    const node = {
      id: this.records[nid].id,
      score: match.getScore(nid),
    } as any;

    if (options.fields) {
      const fields = {} as Record<string, string | string[]>;
      for (const field of options.fields as string[]) {
        fields[field] = this.records[nid].data.get(field) ?? [''];
        if (fields[field].length === 1) {
          fields[field] = fields[field][0];
        }
      }
      node.fields = fields;
    }

    if (options.highlights) {
      const highlights = {} as Record<string, string[]>;
      for (const { field, before, end } of options.highlights) {
        highlights[field] = match
          .getHighlighters(nid, field)
          .flatMap(highlighter => {
            return highlighter(before, end);
          });
      }
      node.highlights = highlights;
    }

    return node;
  }
}
