import { Injectable } from '@nestjs/common';
import { omit } from 'lodash-es';

import { InternalServerError } from '../../../base';
import { SearchProviderType } from '../config';
import { SearchTable } from '../tables';
import {
  AggregateQueryDSL,
  AggregateResult,
  HighlightDSL,
  OperationOptions,
  SearchNode,
  SearchQueryDSL,
  SearchResult,
} from './def';
import { ElasticsearchProvider } from './elasticsearch';

interface MSSearchResponse {
  took: number;
  timed_out: boolean;
  hits: {
    total: number;
    hits: {
      _index: string;
      _id: string;
      _score: number;
      _source: Record<string, unknown>;
      highlight?: Record<string, string[]>;
      sort: unknown[];
    }[];
  };
  scroll: string;
}

const SupportIndexedAttributes = [
  'flavour',
  'parent_flavour',
  'parent_block_id',
];

const ConvertEmptyStringToNullValueFields = new Set([
  'ref_doc_id',
  'ref',
  'blob',
  'additional',
  'parent_block_id',
  'parent_flavour',
]);

@Injectable()
export class ManticoresearchProvider extends ElasticsearchProvider {
  override type = SearchProviderType.Manticoresearch;

  override async createTable(
    table: SearchTable,
    mapping: string
  ): Promise<void> {
    const url = `${this.config.provider.endpoint}/cli`;
    const response = await fetch(url, {
      method: 'POST',
      body: mapping,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    // manticoresearch cli response is not json, so we need to handle it manually
    const text = (await response.text()).trim();
    if (!response.ok) {
      this.logger.error(`failed to create table ${table}, response: ${text}`);
      throw new InternalServerError();
    }
    this.logger.log(`created table ${table}, response: ${text}`);
  }

  override async write(
    table: SearchTable,
    documents: Record<string, unknown>[],
    options?: OperationOptions
  ): Promise<void> {
    if (table === SearchTable.block) {
      documents = documents.map(document => ({
        ...document,
        // convert content `string[]` to `string`
        // because manticoresearch full text search does not support `string[]`
        content: Array.isArray(document.content)
          ? document.content.join(' ')
          : document.content,
        // convert one item array to string in `blob`, `ref`, `ref_doc_id`
        blob: this.#formatArrayValue(document.blob),
        ref: this.#formatArrayValue(document.ref),
        ref_doc_id: this.#formatArrayValue(document.ref_doc_id),
        // add extra indexed attributes
        ...SupportIndexedAttributes.reduce(
          (acc, attribute) => {
            acc[`${attribute}_indexed`] = document[attribute];
            return acc;
          },
          {} as Record<string, unknown>
        ),
      }));
    }

    await super.write(table, documents, options);
  }

  /**
   * @see https://manual.manticoresearch.com/Data_creation_and_modification/Deleting_documents?static=true&client=JSON#Deleting-documents
   */
  override async deleteByQuery<T extends SearchTable>(
    table: T,
    query: Record<string, any>,
    options?: OperationOptions
  ): Promise<void> {
    const start = Date.now();
    const url = new URL(`${this.config.provider.endpoint}/delete`);
    if (options?.refresh) {
      url.searchParams.set('refresh', 'true');
    }
    const body = JSON.stringify({
      table,
      // term not work on delete query, so we need to use equals instead
      query: this.parseESQuery(query, { termMappingField: 'equals' }),
    });
    const result = await this.request('POST', url.toString(), body);
    this.logger.debug(
      `deleted by query ${body} in ${Date.now() - start}ms, result: ${JSON.stringify(result)}`
    );
  }

  override async search(
    table: SearchTable,
    dsl: SearchQueryDSL
  ): Promise<SearchResult> {
    const body = this.#convertToSearchBody(dsl);
    const data = (await this.requestSearch(table, body)) as MSSearchResponse;
    return {
      took: data.took,
      timedOut: data.timed_out,
      total: data.hits.total,
      nextCursor: data.scroll,
      nodes: data.hits.hits.map(hit => ({
        _id: hit._id,
        _score: hit._score,
        _source: this.formatDateFields(
          this.#formatSource(dsl._source, hit._source)
        ),
        fields: this.formatDateFields(
          this.#formatFieldsFromSource(dsl.fields, hit._source)
        ),
        highlights: this.#formatHighlights(
          dsl.highlight?.fields,
          hit.highlight
        ),
      })),
    };
  }

  override async aggregate(
    table: SearchTable,
    dsl: AggregateQueryDSL
  ): Promise<AggregateResult> {
    const aggs = dsl.aggs;
    const topHits = aggs.result.aggs.result.top_hits;
    const groupByField = aggs.result.terms.field;
    const searchDSL = {
      ...omit(dsl, 'aggs'),
      // add groupByField to fields if not already in
      fields: topHits.fields.includes(groupByField)
        ? topHits.fields
        : [...topHits.fields, groupByField],
      highlight: topHits.highlight,
    };
    const body = this.#convertToSearchBody(searchDSL);
    const data = (await this.requestSearch(table, body)) as MSSearchResponse;

    // calculate the aggregate buckets
    const bucketsMap = new Map<string, SearchNode[]>();
    for (const hit of data.hits.hits) {
      const key = hit._source[groupByField] as string;
      const node = {
        _id: hit._id,
        _score: hit._score,
        _source: this.formatDateFields(
          this.#formatSource(topHits._source, hit._source)
        ),
        fields: this.formatDateFields(
          this.#formatFieldsFromSource(topHits.fields, hit._source)
        ),
        highlights: this.#formatHighlights(
          topHits.highlight?.fields,
          hit.highlight
        ),
      };
      if (bucketsMap.has(key)) {
        bucketsMap.get(key)?.push(node);
      } else {
        bucketsMap.set(key, [node]);
      }
    }
    return {
      took: data.took,
      timedOut: data.timed_out,
      total: data.hits.total,
      nextCursor: data.scroll,
      buckets: Array.from(bucketsMap.entries()).map(([key, nodes]) => ({
        key,
        count: nodes.length,
        hits: {
          nodes: topHits.size ? nodes.slice(0, topHits.size) : nodes,
        },
      })),
    };
  }

  #convertToSearchBody(dsl: SearchQueryDSL) {
    const data: Record<string, any> = {
      ...dsl,
      query: this.parseESQuery(dsl.query),
      fields: undefined,
      _source: [...new Set([...dsl._source, ...dsl.fields])],
    };

    // https://manual.manticoresearch.com/Searching/Pagination#Pagination-of-search-results
    // use scroll
    if (dsl.cursor) {
      data.cursor = undefined;
      data.options = {
        scroll: dsl.cursor,
      };
    } else {
      data.options = {
        scroll: true,
      };
    }

    // if highlight provided, add all fields to highlight
    // "highlight":{"fields":{"title":{"pre_tags":["<b>"],"post_tags":["</b>"]}}
    // to
    // "highlight":{"pre_tags":["<b>"],"post_tags":["</b>"]}
    if (dsl.highlight) {
      const firstOptions = Object.values(dsl.highlight.fields)[0];
      data.highlight = firstOptions;
    }
    return data;
  }

  /**
   * manticoresearch return date value as timestamp, we need to convert it to Date object
   */
  protected override formatDateValue(value: unknown) {
    if (value && typeof value === 'number') {
      // 1750389254 => new Date(1750389254 * 1000)
      return new Date(value * 1000);
    }
    return value;
  }

  private parseESQuery(
    query: Record<string, any>,
    options?: {
      termMappingField?: string;
      parentNodes?: Record<string, any>[];
    }
  ) {
    let node: Record<string, any> = {};
    if (query.bool) {
      node.bool = {};
      for (const occur in query.bool) {
        const conditions = query.bool[occur];
        if (Array.isArray(conditions)) {
          node.bool[occur] = [];
          // { must: [ { term: [Object] }, { bool: [Object] } ] }
          // {
          //   must: [ { term: [Object] }, { term: [Object] }, { bool: [Object] } ]
          // }
          for (const item of conditions) {
            this.parseESQuery(item, {
              ...options,
              parentNodes: node.bool[occur],
            });
          }
        } else {
          // {
          //   must_not: { term: { doc_id: 'docId' } }
          // }
          node.bool[occur] = this.parseESQuery(conditions, {
            termMappingField: options?.termMappingField,
          });
        }
      }
    } else if (query.term) {
      // {
      //   term: {
      //     workspace_id: {
      //       value: 'workspaceId1'
      //     }
      //   }
      // }
      // to
      // {
      //   term: {
      //     workspace_id: 'workspaceId1'
      //   }
      // }
      let termField = options?.termMappingField ?? 'term';
      let field = Object.keys(query.term)[0];
      let value = query.term[field];
      if (typeof value === 'object' && 'value' in value) {
        if ('boost' in value) {
          // {
          //   term: {
          //     flavour: {
          //       value: 'affine:page',
          //       boost: 1.5,
          //     },
          //   },
          // }
          // to
          // {
          //   match: {
          //     flavour_indexed: {
          //       query: 'affine:page',
          //       boost: 1.5,
          //     },
          //   },
          // }
          if (SupportIndexedAttributes.includes(field)) {
            field = `${field}_indexed`;
          }
          termField = 'match';
          value = {
            query: value.value,
            boost: value.boost,
          };
        } else {
          value = value.value;
        }
      }
      node = {
        [termField]: {
          [field]: value,
        },
      };
    } else if (query.exists) {
      let field = query.exists.field;
      if (SupportIndexedAttributes.includes(field)) {
        // override the field to indexed field
        field = `${field}_indexed`;
      }
      node = {
        ...query,
        exists: {
          ...query.exists,
          field,
        },
      };
    } else {
      node = {
        ...query,
      };
    }
    if (options?.parentNodes) {
      options.parentNodes.push(node);
    }
    // this.logger.verbose(`parsed es query ${JSON.stringify(query, null, 2)} to ${JSON.stringify(node, null, 2)}`);
    return node;
  }

  /**
   * Format fields from source to match the expected format for ManticoreSearch
   */
  #formatFieldsFromSource(fields: string[], source: Record<string, unknown>) {
    return fields.reduce(
      (acc, field) => {
        let value = source[field];
        if (ConvertEmptyStringToNullValueFields.has(field) && value === '') {
          value = null;
        }
        if (value !== null && value !== undefined) {
          // special handle `ref_doc_id`, `ref`, `blob` as string[]
          if (
            (field === 'ref_doc_id' || field === 'ref' || field === 'blob') &&
            typeof value === 'string' &&
            value.startsWith('["')
          ) {
            //'["b5ed7e73-b792-4a80-8727-c009c5b50116","573ccd98-72be-4a43-9e75-fdc67231bcb4"]'
            // to
            // ['b5ed7e73-b792-4a80-8727-c009c5b50116', '573ccd98-72be-4a43-9e75-fdc67231bcb4']
            // or
            // '["{\"foo\": \"bar\"}","{\"foo\": \"baz\"}"]'
            // to
            // [{foo: 'bar'}, {foo: 'baz'}]
            value = JSON.parse(value as string);
          }
          acc[field] = Array.isArray(value) ? value : [value];
        }
        return acc;
      },
      {} as Record<string, unknown[]>
    );
  }

  #formatHighlights(
    highlightFields?: Record<string, HighlightDSL>,
    highlights?: Record<string, string[]>
  ) {
    if (!highlightFields || !highlights) {
      return undefined;
    }
    return this.#formatFieldsFromSource(
      Object.keys(highlightFields),
      highlights
    );
  }

  #formatSource(fields: string[], source: Record<string, unknown>) {
    return fields.reduce(
      (acc, field) => {
        acc[field] = source[field];
        return acc;
      },
      {} as Record<string, unknown>
    );
  }

  #formatArrayValue(value: unknown | unknown[]) {
    if (Array.isArray(value)) {
      if (value.length === 1) {
        return value[0];
      }
      return JSON.stringify(value);
    }
    return value;
  }
}
