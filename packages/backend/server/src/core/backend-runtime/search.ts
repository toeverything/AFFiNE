import type {
  RuntimeAggregateRequest,
  RuntimeSearchQuery,
  RuntimeSearchRequest,
} from '../../native';

type SearchQueryInput = {
  type: string;
  field?: string;
  match?: string;
  query?: SearchQueryInput;
  queries?: SearchQueryInput[];
  occur?: string;
  boost?: number;
};

type SearchPaginationInput = {
  limit?: number;
  skip?: number;
  cursor?: string;
};

type SearchHighlightInput = {
  field: string;
  before: string;
  end: string;
};

type SearchOptionsInput = {
  fields: string[];
  highlights?: SearchHighlightInput[];
  pagination?: SearchPaginationInput;
};

export type SearchRequestInput = {
  table: 'doc' | 'block';
  query: SearchQueryInput;
  options: SearchOptionsInput;
};

export type AggregateRequestInput = {
  table: 'doc' | 'block';
  query: SearchQueryInput;
  field: string;
  options: {
    hits: SearchOptionsInput;
    pagination?: SearchPaginationInput;
  };
};

export function encodeSearchRequest(
  request: SearchRequestInput
): RuntimeSearchRequest {
  const { queries, rootQuery } = encodeQuery(request.query);
  return {
    table: request.table,
    queries,
    rootQuery,
    options: encodeOptions(request.options),
  };
}

export function encodeAggregateRequest(
  request: AggregateRequestInput
): RuntimeAggregateRequest {
  const { queries, rootQuery } = encodeQuery(request.query);
  return {
    table: request.table,
    queries,
    rootQuery,
    field: request.field,
    options: {
      hits: encodeOptions(request.options.hits),
      pagination: request.options.pagination ?? {},
    },
  };
}

function encodeOptions(options: SearchOptionsInput) {
  return {
    fields: options.fields,
    highlights: options.highlights ?? [],
    pagination: options.pagination ?? {},
  };
}

function encodeQuery(root: SearchQueryInput) {
  const nodes: RuntimeSearchQuery[] = [];
  const visit = (query: SearchQueryInput): number => {
    const index = nodes.length;
    nodes.push({ queryType: query.type });
    nodes[index] = {
      queryType: query.type,
      field: query.field,
      matchValue: query.match,
      query: query.query ? visit(query.query) : undefined,
      queries: query.queries?.map(visit),
      occur: query.occur,
      boost: query.boost,
    };
    return index;
  };
  return { queries: nodes, rootQuery: visit(root) };
}
