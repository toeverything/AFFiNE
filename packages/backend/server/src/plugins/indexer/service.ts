import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { camelCase, mapKeys, snakeCase } from 'lodash-es';

import { InvalidIndexerInput } from '../../base';
import { SearchProviderName } from './config';
import { SearchProviderFactory } from './factory';
import {
  AggregateQueryDSL,
  BaseQueryDSL,
  HighlightDSL,
  OperationOptions,
  SearchNode,
  SearchQueryDSL,
  TopHitsDSL,
} from './providers';
import { Block, BlockSchema, Doc, DocSchema, SearchTable } from './tables';
import {
  AggregateInput,
  SearchHighlight,
  SearchInput,
  SearchQuery,
  SearchQueryType,
} from './types';

// always return these fields to check permission
const DefaultSourceFields = ['workspace_id', 'doc_id'];

export const SearchTableSort = {
  [SearchTable.block]: ['_score', { updated_at: 'desc' }, 'doc_id', 'block_id'],
  [SearchTable.doc]: ['_score', { updated_at: 'desc' }, 'doc_id'],
};

const TableDir = path.join(import.meta.dirname, 'tables');

const SearchTableMappingFiles = {
  [SearchProviderName.Elasticsearch]: {
    [SearchTable.block]: path.join(TableDir, 'block.sql'),
    [SearchTable.doc]: path.join(TableDir, 'doc.sql'),
  },
  [SearchProviderName.Manticoresearch]: {
    [SearchTable.block]: path.join(TableDir, 'block.sql'),
    [SearchTable.doc]: path.join(TableDir, 'doc.sql'),
  },
};

const SearchTableSchema = {
  [SearchTable.block]: BlockSchema,
  [SearchTable.doc]: DocSchema,
};

type SnakeToCamelCase<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamelCase<Tail>>}`
    : S;
type CamelizeKeys<T> = {
  [K in keyof T as SnakeToCamelCase<K & string>]: T[K];
};
type UpsertDoc = CamelizeKeys<Doc>;
type UpsertBlock = CamelizeKeys<Block>;
type UpsertTypeByTable<T extends SearchTable> = T extends SearchTable.block
  ? UpsertBlock
  : UpsertDoc;

export interface SearchNodeWithMeta extends SearchNode {
  _source: {
    workspaceId: string;
    docId: string;
  };
}

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  constructor(
    // private readonly models: Models,
    private readonly factory: SearchProviderFactory
  ) {}

  async createTables() {
    const searchProvider = this.factory.get();
    if (!searchProvider) {
      this.logger.log('No search provider found, skip creating tables');
      return;
    }
    const mappingFiles = SearchTableMappingFiles[searchProvider.provider];
    for (const table of Object.keys(mappingFiles) as SearchTable[]) {
      await searchProvider.createTable(table, mappingFiles[table]);
    }
  }

  async write<T extends SearchTable>(
    table: T,
    documents: UpsertTypeByTable<T>[],
    options?: OperationOptions
  ) {
    const searchProvider = this.factory.get();
    const schema = SearchTableSchema[table];
    await searchProvider.write(
      table,
      documents.map(d => schema.parse(mapKeys(d, (_, key) => snakeCase(key)))),
      options
    );
  }

  async deleteByQuery<T extends SearchTable>(
    table: T,
    query: SearchQuery,
    options?: OperationOptions
  ) {
    const searchProvider = this.factory.get();
    const dsl = this.#parseQuery(query);
    await searchProvider.deleteByQuery(table, dsl, options);
  }

  async search(input: SearchInput) {
    const searchProvider = this.factory.get();
    const dsl = this.parseInput(input);
    const result = await searchProvider.search(input.table, dsl);
    return {
      ...result,
      nodes: this.#formatSearchNodes(result.nodes),
    };
  }

  async aggregate(input: AggregateInput) {
    const searchProvider = this.factory.get();
    const dsl = this.parseInput(input);
    const result = await searchProvider.aggregate(input.table, dsl);
    for (const bucket of result.buckets) {
      bucket.hits = {
        ...bucket.hits,
        nodes: this.#formatSearchNodes(bucket.hits.nodes),
      };
    }
    return result;
  }

  #formatSearchNodes(nodes: SearchNode[]) {
    return nodes.map(node => ({
      ...node,
      fields: mapKeys(node.fields, (_, key) => camelCase(key)),
      highlights: node.highlights
        ? mapKeys(node.highlights, (_, key) => camelCase(key))
        : undefined,
      _source: {
        workspaceId: node._source.workspace_id,
        docId: node._source.doc_id,
      },
    })) as SearchNodeWithMeta[];
  }

  /**
   * Parse input to ES query DSL
   * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html
   */
  parseInput<T extends SearchInput | AggregateInput>(
    input: T
  ): T extends SearchInput ? SearchQueryDSL : AggregateQueryDSL {
    // common options
    const query = this.#parseQuery(input.query);
    const dsl: BaseQueryDSL = {
      _source: DefaultSourceFields,
      sort: SearchTableSort[input.table],
      query,
    };
    const pagination = input.options.pagination;
    if (pagination?.limit) {
      if (pagination.limit > 1000) {
        throw new InvalidIndexerInput({
          reason: 'limit must be less than 1000',
        });
      }
      dsl.size = pagination.limit;
    }
    if (pagination?.skip) {
      dsl.from = pagination.skip;
    }
    if (pagination?.cursor) {
      dsl.cursor = pagination.cursor;
    }

    if ('fields' in input.options) {
      // for search input
      const searchDsl: SearchQueryDSL = {
        ...dsl,
        fields: input.options.fields.map(snakeCase),
      };
      if (input.options.highlights) {
        searchDsl.highlight = this.#parseHighlights(input.options.highlights);
      }
      // @ts-expect-error should be SearchQueryDSL
      return searchDsl;
    }

    if ('field' in input) {
      // for aggregate input
      // input: {
      //   field: 'docId',
      //   options: {
      //     hits: {
      //       fields: [...],
      //       highlights: [...],
      //       pagination: {
      //         limit: 5,
      //       },
      //     },
      //     pagination: {
      //       limit: 100,
      //     },
      //   },
      // }
      // to
      // "aggs": {
      //   "result": {
      //     "terms": { "field": "doc_id" },
      //     "aggs": {
      //       "result": {
      //         "top_hits": {
      //           "_source": false,
      //           "fields": [...],
      //           "highlights": [...],
      //           "size": 5
      //         }
      //       }
      //     }
      //   }
      // }
      const topHits: TopHitsDSL = {
        _source: DefaultSourceFields,
        fields: input.options.hits.fields.map(snakeCase),
      };
      if (input.options.hits.pagination?.limit) {
        topHits.size = input.options.hits.pagination.limit;
      }
      if (input.options.hits.highlights) {
        topHits.highlight = this.#parseHighlights(
          input.options.hits.highlights
        );
      }
      const aggregateDsl: AggregateQueryDSL = {
        ...dsl,
        aggs: {
          result: {
            terms: { field: snakeCase(input.field) },
            aggs: {
              result: {
                // https://www.elastic.co/docs/reference/aggregations/search-aggregations-metrics-top-hits-aggregation
                top_hits: topHits,
              },
            },
          },
        },
      };
      // @ts-expect-error should be AggregateQueryDSL
      return aggregateDsl;
    }

    throw new InvalidIndexerInput({
      reason: '"field" or "fields" is required',
    });
  }

  #parseQuery(
    query: SearchQuery,
    parentNodes?: unknown[]
  ): Record<string, any> {
    if (query.type === SearchQueryType.match) {
      // required field and match
      if (!query.field) {
        throw new InvalidIndexerInput({
          reason: '"field" is required in match query',
        });
      }
      if (!query.match) {
        throw new InvalidIndexerInput({
          reason: '"match" is required in match query',
        });
      }

      // {
      //   type: 'match',
      //   field: 'refDocId',
      //   match: docId,
      // }
      // to
      // {
      //   match: {
      //     ref_doc_id: {
      //       query: docId
      //     },
      //   },
      // }
      const dsl = {
        match: {
          [snakeCase(query.field)]: {
            query: query.match,
            ...(typeof query.boost === 'number' && { boost: query.boost }),
          },
        },
      };
      if (parentNodes) {
        parentNodes.push(dsl);
      }
      return dsl;
    }
    if (query.type === SearchQueryType.boolean) {
      // required occur and queries
      if (!query.occur) {
        this.logger.debug(`query: ${JSON.stringify(query, null, 2)}`);
        throw new InvalidIndexerInput({
          reason: '"occur" is required in boolean query',
        });
      }
      if (!query.queries) {
        throw new InvalidIndexerInput({
          reason: '"queries" is required in boolean query',
        });
      }

      // {
      //   type: 'boolean',
      //   occur: 'must_not',
      //   queries: [
      //     {
      //       type: 'match',
      //       field: 'docId',
      //       match: 'docId1',
      //     },
      //   ],
      // }
      // to
      // {
      //   bool: {
      //     must_not: [
      //       {
      //         match: { doc_id: { query: 'docId1' } }
      //       },
      //     ],
      //   },
      // }
      const nodes: unknown[] = [];
      const dsl: Record<string, any> = {
        bool: {
          [query.occur]: nodes,
          ...(typeof query.boost === 'number' && { boost: query.boost }),
        },
      };
      for (const subQuery of query.queries) {
        this.#parseQuery(subQuery, nodes);
      }
      if (parentNodes) {
        parentNodes.push(dsl);
      }
      return dsl;
    }
    if (query.type === SearchQueryType.exists) {
      // required field
      if (!query.field) {
        throw new InvalidIndexerInput({
          reason: '"field" is required in exists query',
        });
      }

      // {
      //   type: 'exists',
      //   field: 'refDocId',
      // }
      // to
      // {
      //   exists: {
      //     field: 'ref_doc_id',
      //   },
      // }
      const dsl = {
        exists: {
          field: snakeCase(query.field),
          ...(typeof query.boost === 'number' && { boost: query.boost }),
        },
      };
      if (parentNodes) {
        parentNodes.push(dsl);
      }
      return dsl;
    }
    if (query.type === SearchQueryType.all) {
      // {
      //   type: 'all'
      // }
      // to
      // {
      //   match_all: {},
      // }
      const dsl = {
        match_all: {
          ...(typeof query.boost === 'number' && { boost: query.boost }),
        },
      };
      if (parentNodes) {
        parentNodes.push(dsl);
      }
      return dsl;
    }
    if (query.type === SearchQueryType.boost) {
      // required query and boost
      if (!query.query) {
        throw new InvalidIndexerInput({
          reason: '"query" is required in boost query',
        });
      }
      if (typeof query.boost !== 'number') {
        throw new InvalidIndexerInput({
          reason: '"boost" is required in boost query',
        });
      }

      // {
      //   type: 'boost',
      //   boost: 1.5,
      //   query: {
      //     type: 'match',
      //     field: 'flavour',
      //     match: 'affine:page',
      //   },
      // }
      // to
      // {
      //   "match": {
      //     "flavour": {
      //       "query": "affine:page",
      //       "boost": 1.5
      //     }
      //   }
      // }
      return this.#parseQuery(
        {
          ...query.query,
          boost: query.boost,
        },
        parentNodes
      );
    }
    throw new InvalidIndexerInput({
      reason: `unsupported query type: ${query.type}`,
    });
  }

  /**
   * Parse highlights to ES DSL
   * @see https://www.elastic.co/docs/reference/elasticsearch/rest-apis/highlighting
   */
  #parseHighlights(highlights: SearchHighlight[]) {
    // [
    //   {
    //     field: 'content',
    //     before: '<b>',
    //     end: '</b>',
    //   },
    // ]
    // to
    // {
    //   fields: {
    //     content: {
    //       pre_tags: ['<b>'],
    //       post_tags: ['</b>'],
    //     },
    //   },
    // }
    const fields = highlights.reduce(
      (acc, highlight) => {
        acc[snakeCase(highlight.field)] = {
          pre_tags: [highlight.before],
          post_tags: [highlight.end],
        };
        return acc;
      },
      {} as Record<string, HighlightDSL>
    );
    return { fields };
  }
}
