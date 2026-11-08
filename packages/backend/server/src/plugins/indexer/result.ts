import { camelCase, mapKeys } from 'lodash-es';

import {
  AggregateInput,
  SearchDoc,
  SearchInput,
  SearchQuery,
  SearchQueryOccur,
  SearchQueryType,
  SearchTable,
} from './types';

export interface SearchNode {
  id: string;
  score: number;
  fields: Record<string, unknown[]>;
  highlights?: Record<string, unknown[]>;
  _source?: Record<string, unknown>;
}

export interface AggregateResult {
  total: number;
  hasMore: boolean;
  buckets: Array<{
    key: string;
    count: number;
    hits: { nodes: SearchNode[] };
  }>;
}

export interface SearchNodeWithMeta extends SearchNode {
  _source: {
    workspaceId: string;
    docId: string;
  };
}

export function formatSearchNodes(nodes: SearchNode[]) {
  return nodes.map(node => ({
    ...node,
    fields: mapKeys(
      Object.fromEntries(
        Object.entries(node.fields).map(([key, values]) => [
          key,
          key === 'created_at' || key === 'updated_at'
            ? values.map(value => new Date(value as string | number))
            : values,
        ])
      ),
      (_, key) => camelCase(key)
    ),
    highlights: node.highlights
      ? mapKeys(node.highlights, (_, key) => camelCase(key))
      : undefined,
    _source: {
      workspaceId: (node._source?.workspace_id ??
        node.fields.workspace_id?.[0]) as string,
      docId: (node._source?.doc_id ?? node.fields.doc_id?.[0]) as string,
    },
  })) as SearchNodeWithMeta[];
}

export function buildSearchDocsInput(
  workspaceId: string,
  keyword: string,
  options?: { limit?: number; docIds?: string[] }
): AggregateInput {
  return {
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
        ...(options?.docIds
          ? [
              {
                type: SearchQueryType.boolean as const,
                occur: SearchQueryOccur.should,
                queries: options.docIds.map(docId => ({
                  type: SearchQueryType.match as const,
                  field: 'docId',
                  match: docId,
                })),
              },
            ]
          : []),
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
          'unitId',
          'projectionVersion',
          'sourceHash',
          'visibility',
          'elementId',
          'frameId',
          'sourceBlockId',
          'flavour',
          'content',
          'createdAt',
          'updatedAt',
          'createdByUserId',
          'updatedByUserId',
        ],
        highlights: [{ field: 'content', before: '<b>', end: '</b>' }],
        pagination: { limit: 2 },
      },
      pagination: { limit: options?.limit ?? 20 },
    },
  };
}

export function buildBasicSearchDocsInput(
  workspaceId: string,
  keyword: string,
  options?: { limit?: number; docIds?: string[] }
): SearchInput {
  const aggregate = buildSearchDocsInput(workspaceId, keyword, options);
  const limit = options?.limit ?? 20;
  const queries: SearchQuery[] = [
    {
      type: SearchQueryType.match as const,
      field: 'workspaceId',
      match: workspaceId,
    },
    {
      type: SearchQueryType.match as const,
      field: 'content',
      match: keyword,
    },
  ];
  if (options?.docIds) {
    queries.push({
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.should,
      queries: options.docIds.map(docId => ({
        type: SearchQueryType.match as const,
        field: 'docId',
        match: docId,
      })),
    });
  }
  return {
    table: aggregate.table,
    query: {
      type: SearchQueryType.boolean,
      occur: SearchQueryOccur.must,
      queries,
    },
    options: {
      fields: ['docId', ...aggregate.options.hits.fields],
      highlights: aggregate.options.hits.highlights,
      pagination: { limit: Math.min(Math.max(limit, 1) * 4, 10_000) },
    },
  };
}

export function collectBasicSearchDocs(
  result: { nodes: SearchNodeWithMeta[] },
  workspaceId: string,
  limit: number
) {
  const seen = new Set<string>();
  const buckets: AggregateResult['buckets'] = [];
  for (const node of result.nodes) {
    const docId = node._source.docId;
    if (seen.has(docId)) continue;
    seen.add(docId);
    buckets.push({ key: docId, count: 1, hits: { nodes: [node] } });
    if (buckets.length === limit) break;
  }
  return collectSearchDocs(
    { total: buckets.length, hasMore: false, buckets },
    workspaceId
  );
}

export function collectSearchDocs(
  result: AggregateResult,
  workspaceId: string
) {
  const docs: SearchDoc[] = [];
  const missingTitles: { workspaceId: string; docId: string }[] = [];
  const userIds: { userId: string }[] = [];

  for (const bucket of result.buckets) {
    const node = bucket.hits.nodes[0];
    const docId = bucket.key;
    const blockId = node.fields.blockId[0] as string;
    const unitId = node.fields.unitId[0] as string;
    const projectionVersion = node.fields.projectionVersion[0] as number;
    const sourceHash = node.fields.sourceHash[0] as string;
    const visibility = node.fields.visibility[0] as string;
    const elementId = node.fields.elementId?.[0] as string | undefined;
    const frameId = node.fields.frameId?.[0] as string | undefined;
    const sourceBlockId = node.fields.sourceBlockId?.[0] as string | undefined;
    const flavour = node.fields.flavour[0] as string;
    const content = node.fields.content[0] as string;
    const createdAt = node.fields.createdAt[0] as Date;
    const updatedAt = node.fields.updatedAt[0] as Date;
    const createdByUserId = node.fields.createdByUserId[0] as string;
    const updatedByUserId = node.fields.updatedByUserId[0] as string;
    const highlight = node.highlights?.content?.[0] as string;
    const title = flavour === 'affine:page' ? content : '';
    if (!title) {
      missingTitles.push({ workspaceId, docId });
    }
    docs.push({
      docId,
      blockId: sourceBlockId || blockId,
      ...(unitId ? { unitId } : {}),
      ...(projectionVersion ? { projectionVersion } : {}),
      ...(sourceHash ? { sourceHash } : {}),
      ...(visibility ? { visibility } : {}),
      ...(elementId ? { elementId } : {}),
      ...(frameId ? { frameId } : {}),
      title,
      highlight,
      createdAt,
      updatedAt,
      createdByUserId,
      updatedByUserId,
    });
    userIds.push({ userId: createdByUserId }, { userId: updatedByUserId });
  }
  return { docs, missingTitles, userIds };
}
