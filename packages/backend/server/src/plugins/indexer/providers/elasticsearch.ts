import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import {
  InternalServerError,
  InvalidSearchProviderRequest,
} from '../../../base';
import { SearchProviderName } from '../config';
import { SearchTable, SearchTableUniqueId } from '../tables';
import {
  AggregateQueryDSL,
  AggregateResult,
  OperationOptions,
  SearchProvider,
  SearchQueryDSL,
  SearchResult,
} from './def';

interface ESSearchResponse {
  took: number;
  timed_out: boolean;
  hits: {
    total: {
      value: number;
    };
    hits: {
      _index: string;
      _id: string;
      _score: number;
      _source: Record<string, unknown>;
      fields: Record<string, unknown[]>;
      highlight?: Record<string, string[]>;
      sort: unknown[];
    }[];
  };
}

interface ESAggregateResponse extends ESSearchResponse {
  aggregations: {
    result: {
      buckets: {
        key: string;
        doc_count: number;
        result: {
          hits: {
            total: {
              value: number;
            };
            max_score: number;
            hits: {
              _index: string;
              _id: string;
              _score: number;
              _source: Record<string, unknown>;
              fields: Record<string, unknown[]>;
              highlight?: Record<string, string[]>;
            }[];
          };
        };
      }[];
    };
  };
}

@Injectable()
export class ElasticsearchProvider extends SearchProvider {
  provider = SearchProviderName.Elasticsearch;

  /**
   * @see https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-create
   */
  override async createTable(
    table: SearchTable,
    mappingFile: string
  ): Promise<void> {
    const url = `${this.config.endpoint}/${table}`;
    const mapping = await readFile(mappingFile, 'utf-8');
    try {
      const result = await this.request('PUT', url, mapping);
      this.logger.log(
        `created table ${table}, result: ${JSON.stringify(result)}`
      );
    } catch (err) {
      if (
        err instanceof InvalidSearchProviderRequest &&
        err.data.type === 'resource_already_exists_exception'
      ) {
        this.logger.log(`table ${table} already exists`);
      } else {
        throw err;
      }
    }
  }

  override async write(
    table: SearchTable,
    documents: Record<string, unknown>[],
    options?: OperationOptions
  ): Promise<void> {
    const records: string[] = [];
    for (const document of documents) {
      // @ts-expect-error ignore document type check
      const id = SearchTableUniqueId[table](document);
      records.push(
        JSON.stringify({
          index: {
            _index: table,
            _id: id,
          },
        })
      );
      records.push(JSON.stringify(document));
    }
    const query: Record<string, string> = {};
    if (options?.refresh) {
      query.refresh = 'true';
    }
    await this.requestBulk(table, records, query);
  }

  /**
   * @see https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete-by-query
   */
  override async deleteByQuery<T extends SearchTable>(
    table: T,
    query: Record<string, any>,
    options?: OperationOptions
  ): Promise<void> {
    const url = new URL(`${this.config.endpoint}/${table}/_delete_by_query`);
    if (options?.refresh) {
      url.searchParams.set('refresh', 'true');
    }
    const result = await this.request(
      'POST',
      url.toString(),
      JSON.stringify({ query })
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
    const data = (await this.requestSearch(table, body)) as ESSearchResponse;
    return {
      took: data.took,
      timedOut: data.timed_out,
      total: data.hits.total.value,
      nextCursor: this.#encodeCursor(data.hits.hits.at(-1)?.sort),
      nodes: data.hits.hits.map(hit => ({
        _id: hit._id,
        _score: hit._score,
        _source: hit._source,
        fields: hit.fields,
        highlights: hit.highlight,
      })),
    };
  }

  override async aggregate(
    table: SearchTable,
    dsl: AggregateQueryDSL
  ): Promise<AggregateResult> {
    const body = this.#convertToSearchBody(dsl);
    const data = (await this.requestSearch(table, body)) as ESAggregateResponse;
    // sort buckets by max_score
    const buckets = data.aggregations.result.buckets.sort(
      (a, b) => b.result.hits.max_score - a.result.hits.max_score
    );
    return {
      took: data.took,
      timedOut: data.timed_out,
      total: data.hits.total.value,
      nextCursor: this.#encodeCursor(data.hits.hits.at(-1)?.sort),
      buckets: buckets.map(bucket => ({
        key: bucket.key,
        count: bucket.doc_count,
        hits: {
          nodes: bucket.result.hits.hits.map(hit => ({
            _id: hit._id,
            _score: hit._score,
            _source: hit._source,
            fields: hit.fields,
            highlights: hit.highlight,
          })),
        },
      })),
    };
  }

  protected async requestSearch(table: SearchTable, body: Record<string, any>) {
    const url = `${this.config.endpoint}/${table}/_search`;
    return await this.request('POST', url, JSON.stringify(body));
  }

  /**
   * @see https://www.elastic.co/docs/api/doc/elasticsearch-serverless/operation/operation-bulk-2
   */
  protected async requestBulk(
    table: SearchTable,
    records: string[],
    query?: Record<string, string>
  ) {
    const url = new URL(`${this.config.endpoint}/${table}/_bulk`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return await this.request(
      'POST',
      url.toString(),
      records.join('\n') + '\n',
      'application/x-ndjson'
    );
  }

  protected async request(
    method: 'POST' | 'PUT',
    url: string,
    body: string,
    contentType = 'application/json'
  ) {
    const headers = {
      'Content-Type': contentType,
    } as Record<string, string>;
    if (this.config.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
    }
    const response = await fetch(url, {
      method,
      body,
      headers,
    });
    const data = await response.json();
    this.logger.debug(
      `curl -X ${method} ${url} ${Object.entries(headers)
        .map(
          ([key, value]) =>
            `-H '${key}: ${key === 'Authorization' ? '******' : value}'`
        )
        .join(
          ' '
        )} -d '${body}'\nresponse status: ${response.status}\nbody: ${JSON.stringify(data, null, 2)}`
    );
    // handle error, status >= 400
    // {
    //   "error": {
    //     "root_cause": [
    //       {
    //         "type": "illegal_argument_exception",
    //         "reason": "The bulk request must be terminated by a newline [\\n]"
    //       }
    //     ],
    //     "type": "illegal_argument_exception",
    //     "reason": "The bulk request must be terminated by a newline [\\n]"
    //   },
    //   "status": 400
    // }
    if (response.status >= 500) {
      this.logger.error(
        `request error, url: ${url}, body: ${body}, response status: ${response.status}, response body: ${JSON.stringify(data, null, 2)}`
      );
      throw new InternalServerError();
    }
    if (response.status >= 400) {
      this.logger.warn(
        `request failed, url: ${url}, body: ${body}, response status: ${response.status}, response body: ${JSON.stringify(data, null, 2)}`
      );
      const errorData = data as {
        error: { type: string; reason: string } | string;
      };
      let reason = '';
      let type = '';
      if (typeof errorData.error === 'string') {
        reason = errorData.error;
      } else {
        reason = errorData.error.reason;
        type = errorData.error.type;
      }
      throw new InvalidSearchProviderRequest({
        reason,
        type,
      });
    }
    return data;
  }

  #convertToSearchBody(dsl: SearchQueryDSL | AggregateQueryDSL) {
    const data: Record<string, any> = {
      ...dsl,
    };
    if (dsl.cursor) {
      data.cursor = undefined;
      data.search_after = this.#decodeCursor(dsl.cursor);
    }
    return data;
  }

  #decodeCursor(cursor: string) {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  }

  #encodeCursor(cursor?: unknown[]) {
    return cursor
      ? Buffer.from(JSON.stringify(cursor)).toString('base64')
      : undefined;
  }
}
