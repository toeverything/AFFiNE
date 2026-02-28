import { Injectable, Logger } from '@nestjs/common';
import { camelCase, chunk, mapKeys, snakeCase } from 'lodash-es';

import {
  InvalidIndexerInput,
  JobQueue,
  SearchProviderNotFound,
} from '../../base';
import { readAllBlocksFromDocSnapshot } from '../../core/utils/blocksuite';
import { Models } from '../../models';
import { SearchProviderType } from './config';
import { SearchProviderFactory } from './factory';
import {
  AggregateQueryDSL,
  BaseQueryDSL,
  HighlightDSL,
  OperationOptions,
  SearchNode,
  SearchProvider,
  SearchQueryDSL,
  TopHitsDSL,
} from './providers';
import {
  Block,
  blockMapping,
  BlockSchema,
  blockSQL,
  Doc,
  docMapping,
  DocSchema,
  docSQL,
  SearchTable,
} from './tables';
import {
  AggregateInput,
  SearchDoc,
  SearchHighlight,
  SearchInput,
  SearchQuery,
  SearchQueryOccur,
  SearchQueryType,
} from './types';

// always return these fields to check permission
const DefaultSourceFields = ['workspace_id', 'doc_id'] as const;

export const SearchTableSorts = {
  [SearchProviderType.Elasticsearch]: {
    [SearchTable.block]: [
      '_score',
      { updated_at: 'desc' },
      'doc_id',
      'block_id',
    ],
    [SearchTable.doc]: ['_score', { updated_at: 'desc' }, 'doc_id'],
  },
  // add id to sort and make sure scroll can work on manticoresearch
  [SearchProviderType.Manticoresearch]: {
    [SearchTable.block]: ['_score', { updated_at: 'desc' }, 'id'],
    [SearchTable.doc]: ['_score', { updated_at: 'desc' }, 'id'],
  },
} as const;

const SearchTableMappingStrings = {
  [SearchProviderType.Elasticsearch]: {
    [SearchTable.block]: JSON.stringify(blockMapping),
    [SearchTable.doc]: JSON.stringify(docMapping),
  },
  [SearchProviderType.Manticoresearch]: {
    [SearchTable.block]: blockSQL,
    [SearchTable.doc]: docSQL,
  },
};

const SearchTableSchema = {
  [SearchTable.block]: BlockSchema,
  [SearchTable.doc]: DocSchema,
};

const SupportFullTextSearchFields = {
  [SearchTable.block]: ['content'],
  [SearchTable.doc]: ['title'],
};

const AllowAggregateFields = new Set(['docId', 'flavour']);

type SnakeToCamelCase<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamelCase<Tail>>}`
    : S;
type CamelizeKeys<T> = {
  [K in keyof T as SnakeToCamelCase<K & string>]: T[K];
};
export type UpsertDoc = CamelizeKeys<Doc>;
export type UpsertBlock = CamelizeKeys<Block>;
export type UpsertTypeByTable<T extends SearchTable> =
  T extends SearchTable.block ? UpsertBlock : UpsertDoc;

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
    private readonly models: Models,
    private readonly factory: SearchProviderFactory,
    private readonly queue: JobQueue
  ) {}

  async createTables() {
    let searchProvider: SearchProvider | undefined;
    try {
      searchProvider = this.factory.get();
    } catch (err) {
      if (err instanceof SearchProviderNotFound) {
        this.logger.debug('No search provider found, skip creating tables');
        return;
      }
      throw err;
    }
    const mappings = SearchTableMappingStrings[searchProvider.type];
    for (const table of Object.keys(mappings) as SearchTable[]) {
      await searchProvider.createTable(table, mappings[table]);
    }
  }

  async write<T extends SearchTable>(
    table: T,
    documents: UpsertTypeByTable<T>[],
    options?: OperationOptions
  ) {
    const searchProvider = this.factory.get();
    const schema = SearchTableSchema[table];
    // slice documents to 1000 documents each time
    const documentsChunks = chunk(documents, 1000);
    for (const documentsChunk of documentsChunks) {
      await searchProvider.write(
        table,
        documentsChunk.map(d =>
          schema.parse(mapKeys(d, (_, key) => snakeCase(key)))
        ),
        options
      );
    }
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

  async listDocIds(workspaceId: string) {
    const docIds: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.search({
        table: SearchTable.doc,
        query: {
          type: SearchQueryType.match,
          field: 'workspaceId',
          match: workspaceId,
        },
        options: {
          fields: ['docId'],
          pagination: {
            limit: 10000,
            cursor,
          },
        },
      });
      if (result.nextCursor && result.nextCursor === cursor) {
        // NOTE(@fengmk2): avoid infinite loop bug in manticoresearch
        break;
      }
      docIds.push(...result.nodes.map(node => node.fields.docId[0] as string));
      cursor = result.nextCursor;
      this.logger.debug(
        `get ${result.nodes.length} new / ${docIds.length} total doc ids for workspace ${workspaceId}, nextCursor: ${cursor}`
      );
    } while (cursor);
    return docIds;
  }

  async indexDoc(
    workspaceId: string,
    docId: string,
    options?: OperationOptions
  ) {
    const workspaceSnapshot = await this.models.doc.getSnapshot(
      workspaceId,
      workspaceId
    );
    if (!workspaceSnapshot) {
      this.logger.debug(`workspace ${workspaceId} not found`);
      return;
    }
    const docSnapshot = await this.models.doc.getSnapshot(workspaceId, docId);
    if (!docSnapshot) {
      this.logger.debug(`doc ${workspaceId}/${docId} not found`);
      return;
    }
    if (docSnapshot.blob.length <= 2) {
      this.logger.debug(`doc ${workspaceId}/${docId} is empty, skip indexing`);
      return;
    }
    const result = await readAllBlocksFromDocSnapshot(docId, docSnapshot.blob);
    if (!result) {
      this.logger.warn(
        `parse doc ${workspaceId}/${docId} failed, workspaceSnapshot size: ${workspaceSnapshot.blob.length}, docSnapshot size: ${docSnapshot.blob.length}`
      );
      return;
    }
    await this.write(
      SearchTable.doc,
      [
        {
          workspaceId,
          docId,
          title: result.title,
          summary: result.summary,
          // NOTE(@fengmk): journal is not supported yet
          // journal: result.journal,
          createdByUserId: docSnapshot.createdBy ?? '',
          updatedByUserId: docSnapshot.updatedBy ?? '',
          createdAt: docSnapshot.createdAt,
          updatedAt: docSnapshot.updatedAt,
        },
      ],
      options
    );
    await this.deleteBlocksByDocId(workspaceId, docId, options);
    await this.write(
      SearchTable.block,
      result.blocks.map(block => ({
        workspaceId,
        docId,
        blockId: block.blockId,
        content: block.content ?? '',
        flavour: block.flavour,
        blob: block.blob,
        refDocId: block.refDocId,
        ref: block.ref,
        parentFlavour: block.parentFlavour,
        parentBlockId: block.parentBlockId,
        additional: block.additional
          ? JSON.stringify(block.additional)
          : undefined,
        markdownPreview: undefined,
        createdByUserId: docSnapshot.createdBy ?? '',
        updatedByUserId: docSnapshot.updatedBy ?? '',
        createdAt: docSnapshot.createdAt,
        updatedAt: docSnapshot.updatedAt,
      })),
      options
    );

    await this.queue.add('copilot.embedding.updateDoc', {
      workspaceId,
      docId,
    });
    this.logger.log(
      `synced doc ${workspaceId}/${docId} with ${result.blocks.length} blocks`
    );
  }

  async deleteDoc(
    workspaceId: string,
    docId: string,
    options?: OperationOptions
  ) {
    await this.deleteByQuery(
      SearchTable.doc,
      {
        type: SearchQueryType.boolean,
        occur: SearchQueryOccur.must,
        queries: [
          {
            type: SearchQueryType.match,
            field: 'workspaceId',
            match: workspaceId,
          },
          {
            type: SearchQueryType.match,
            field: 'docId',
            match: docId,
          },
        ],
      },
      options
    );

    await this.deleteBlocksByDocId(workspaceId, docId, options);
    await this.queue.add('copilot.session.deleteDoc', {
      workspaceId,
      docId,
    });
    await this.queue.add('copilot.embedding.deleteDoc', {
      workspaceId,
      docId,
    });
    this.logger.log(`deleted doc ${workspaceId}/${docId}`);
  }

  async deleteBlocksByDocId(
    workspaceId: string,
    docId: string,
    options?: OperationOptions
  ) {
    await this.deleteByQuery(
      SearchTable.block,
      {
        type: SearchQueryType.boolean,
        occur: SearchQueryOccur.must,
        queries: [
          {
            type: SearchQueryType.match,
            field: 'workspaceId',
            match: workspaceId,
          },
          {
            type: SearchQueryType.match,
            field: 'docId',
            match: docId,
          },
        ],
      },
      options
    );
    this.logger.debug(`deleted all blocks in doc ${workspaceId}/${docId}`);
  }

  async deleteWorkspace(workspaceId: string, options?: OperationOptions) {
    await this.deleteByQuery(
      SearchTable.doc,
      {
        type: SearchQueryType.match,
        field: 'workspaceId',
        match: workspaceId,
      },
      options
    );
    this.logger.debug(`deleted all docs in workspace ${workspaceId}`);
    await this.deleteByQuery(
      SearchTable.block,
      {
        type: SearchQueryType.match,
        field: 'workspaceId',
        match: workspaceId,
      },
      options
    );
    this.logger.debug(`deleted all blocks in workspace ${workspaceId}`);
  }

  async deleteByQuery<T extends SearchTable>(
    table: T,
    query: SearchQuery,
    options?: OperationOptions
  ) {
    const searchProvider = this.factory.get();
    const dsl = this.#parseQuery(table, query);
    await searchProvider.deleteByQuery(table, dsl, options);
  }

  async searchBlobNames(workspaceId: string, blobIds: string[]) {
    const result = await this.search({
      table: SearchTable.block,
      query: {
        type: SearchQueryType.boolean,
        occur: SearchQueryOccur.must,
        queries: [
          {
            type: SearchQueryType.match,
            field: 'workspaceId',
            match: workspaceId,
          },
          {
            type: SearchQueryType.match,
            field: 'flavour',
            match: 'affine:attachment',
          },
          {
            type: SearchQueryType.boolean,
            occur: SearchQueryOccur.should,
            queries: blobIds.map(blobId => ({
              type: SearchQueryType.match,
              field: 'blob',
              match: blobId,
            })),
          },
        ],
      },
      options: {
        fields: ['blob', 'content'],
        pagination: {
          limit: 10000,
        },
      },
    });
    const blobNameMap = new Map<string, string>();
    for (const node of result.nodes) {
      const blobId = node.fields.blob[0] as string;
      const content = node.fields.content[0] as string;
      if (blobId && content) {
        blobNameMap.set(blobId, content);
      }
    }
    return blobNameMap;
  }

  async searchDocsByKeyword(
    workspaceId: string,
    keyword: string,
    options?: {
      limit?: number;
    }
  ): Promise<SearchDoc[]> {
    const limit = options?.limit ?? 20;
    const result = await this.aggregate({
      table: SearchTable.block,
      field: 'docId',
      query: {
        type: SearchQueryType.boolean,
        occur: SearchQueryOccur.must,
        queries: [
          {
            type: SearchQueryType.match,
            field: 'workspaceId',
            match: workspaceId,
          },
          {
            type: SearchQueryType.boolean,
            occur: SearchQueryOccur.must,
            queries: [
              {
                type: SearchQueryType.match,
                field: 'content',
                match: keyword,
              },
              {
                type: SearchQueryType.boolean,
                occur: SearchQueryOccur.should,
                queries: [
                  {
                    type: SearchQueryType.match,
                    field: 'content',
                    match: keyword,
                  },
                  {
                    type: SearchQueryType.boost,
                    boost: 1.5,
                    query: {
                      type: SearchQueryType.match,
                      field: 'flavour',
                      match: 'affine:page',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      options: {
        hits: {
          fields: [
            'blockId',
            'flavour',
            'content',
            'createdAt',
            'updatedAt',
            'createdByUserId',
            'updatedByUserId',
          ],
          highlights: [
            {
              field: 'content',
              before: '<b>',
              end: '</b>',
            },
          ],
          pagination: {
            limit: 2,
          },
        },
        pagination: {
          limit,
        },
      },
    });

    const docs: SearchDoc[] = [];
    const missingTitles: { workspaceId: string; docId: string }[] = [];
    const userIds: { userId: string }[] = [];

    for (const bucket of result.buckets) {
      const docId = bucket.key;
      const blockId = bucket.hits.nodes[0].fields.blockId[0] as string;
      const flavour = bucket.hits.nodes[0].fields.flavour[0] as string;
      const content = bucket.hits.nodes[0].fields.content[0] as string;
      const createdAt = bucket.hits.nodes[0].fields.createdAt[0] as Date;
      const updatedAt = bucket.hits.nodes[0].fields.updatedAt[0] as Date;
      const createdByUserId = bucket.hits.nodes[0].fields
        .createdByUserId[0] as string;
      const updatedByUserId = bucket.hits.nodes[0].fields
        .updatedByUserId[0] as string;
      const highlight = bucket.hits.nodes[0].highlights?.content?.[0] as string;
      let title = '';

      // hit title block
      if (flavour === 'affine:page') {
        title = content;
      } else {
        // hit content block, missing title
        missingTitles.push({ workspaceId, docId });
      }

      docs.push({
        docId,
        blockId,
        title,
        highlight,
        createdAt,
        updatedAt,
        createdByUserId,
        updatedByUserId,
      });
      userIds.push({ userId: createdByUserId }, { userId: updatedByUserId });
    }

    if (missingTitles.length > 0) {
      const metas = await this.models.doc.findMetas(missingTitles, {
        select: {
          title: true,
        },
      });
      const titleMap = new Map<string, string>();
      for (const meta of metas) {
        if (meta?.title) {
          titleMap.set(meta.docId, meta.title);
        }
      }
      for (const doc of docs) {
        if (!doc.title) {
          doc.title = titleMap.get(doc.docId) ?? '';
        }
      }
    }

    const userMap = await this.models.user.getPublicUsersMap(userIds);

    for (const doc of docs) {
      doc.createdByUser = userMap.get(doc.createdByUserId);
      doc.updatedByUser = userMap.get(doc.updatedByUserId);
    }

    return docs;
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
    const query = this.#parseQuery(input.table, input.query);
    const searchProvider = this.factory.get();
    const dsl: BaseQueryDSL = {
      _source: [...DefaultSourceFields],
      sort: [...SearchTableSorts[searchProvider.type][input.table]],
      query,
    };
    const pagination = input.options.pagination;
    if (pagination?.limit) {
      if (pagination.limit > 10000) {
        throw new InvalidIndexerInput({
          reason: 'limit must be less than 10000',
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
      if (!AllowAggregateFields.has(input.field)) {
        throw new InvalidIndexerInput({
          reason: `aggregate field "${input.field}" is not allowed`,
        });
      }

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
      //     "terms": {
      //       "field": "doc_id",
      //       "size": 100,
      //       "order": {
      //         "max_score": "desc"
      //       }
      //     },
      //     "aggs": {
      //       "max_score": {
      //         "max": {
      //           "script": {
      //             "source": "_score"
      //           }
      //         }
      //       },
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
        _source: [...DefaultSourceFields],
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
            terms: {
              field: snakeCase(input.field),
              size: dsl.size,
              order: {
                max_score: 'desc',
              },
            },
            aggs: {
              max_score: {
                max: {
                  script: {
                    source: '_score',
                  },
                },
              },
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
    table: SearchTable,
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
      //   field: 'content',
      //   match: keyword,
      // }
      // to
      // {
      //   match: {
      //     content: {
      //       query: keyword
      //     },
      //   },
      // }
      //
      // or
      // {
      //   type: 'match',
      //   field: 'refDocId',
      //   match: docId,
      // }
      // to
      // {
      //   term: {
      //     ref_doc_id: {
      //       value: docId
      //     },
      //   },
      // }
      const field = snakeCase(query.field);
      const isFullTextField = SupportFullTextSearchFields[table].includes(
        query.field
      );
      const op = isFullTextField ? 'match' : 'term';
      const key = isFullTextField ? 'query' : 'value';
      const dsl = {
        [op]: {
          [field]: {
            [key]: query.match,
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
        this.#parseQuery(table, subQuery, nodes);
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
        table,
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
