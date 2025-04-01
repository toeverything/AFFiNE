import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';
import { omit } from 'lodash-es';

import { InternalServerError } from '../../../base';
import { SearchProviderName } from '../config';
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

@Injectable()
export class ManticoresearchProvider extends ElasticsearchProvider {
  override provider = SearchProviderName.Manticoresearch;

  override async createTable(
    table: SearchTable,
    mappingFile: string
  ): Promise<void> {
    const url = `${this.config.endpoint}/cli`;
    const sql = await readFile(mappingFile, 'utf-8');
    const response = await fetch(url, {
      method: 'POST',
      body: sql,
      headers: {
        'Content-Type': 'application/plain',
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

  /**
   * @see https://manual.manticoresearch.com/Data_creation_and_modification/Deleting_documents?static=true
   */
  override async deleteByQuery<T extends SearchTable>(
    table: T,
    query: Record<string, any>,
    options?: OperationOptions
  ): Promise<void> {
    const url = new URL(`${this.config.endpoint}/bulk`);
    if (options?.refresh) {
      url.searchParams.set('refresh', 'true');
    }
    const body = {
      delete: {
        table,
        query,
      },
    };
    const result = await this.request(
      'POST',
      url.toString(),
      JSON.stringify(body) + '\n',
      'application/x-ndjson'
    );
    this.logger.log(
      `deleted by query ${table} ${JSON.stringify(query)}, result: ${JSON.stringify(result)}`
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
        _source: this.#formatSource(dsl._source, hit._source),
        fields: this.#formatFieldsFromSource(dsl.fields, hit._source),
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
        _source: this.#formatSource(topHits._source, hit._source),
        fields: this.#formatFieldsFromSource(topHits.fields, hit._source),
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
      fields: undefined,
      _source: [...dsl._source, ...dsl.fields],
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
    // add id to sort and make sure scroll can work
    data.sort.push('id');

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
   * Format fields from source to match the expected format for ManticoreSearch
   */
  #formatFieldsFromSource(fields: string[], source: Record<string, unknown>) {
    return fields.reduce(
      (acc, field) => {
        let value = source[field];
        if (value !== null && value !== undefined && value !== '') {
          // special handle `ref_doc_id` and `ref` as string[]
          if (
            (field === 'ref_doc_id' || field === 'ref') &&
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
}
