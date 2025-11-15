import { Injectable } from '@nestjs/common';

import {
  InternalServerError,
  InvalidSearchProviderRequest,
} from '../../../base';
import { SearchProviderType } from '../config';
import { DateFieldNames, SearchTable, SearchTableUniqueId } from '../tables';
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
  type = SearchProviderType.Elasticsearch;

  /**
   * @see https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-create
   */
  override async createTable(
    table: SearchTable,
    mapping: string
  ): Promise<void> {
    const url = `${this.config.provider.endpoint}/${table}`;
    try {
      const result = await this.request('PUT', url, mapping);
      this.logger.log(
        `created table ${table}, result: ${JSON.stringify(result)}`
      );
    } catch (err) {
      if (
        err instanceof InvalidSearchProviderRequest &&
        (err.data.type === 'resource_already_exists_exception' ||
          (err.data.type === 'invalid_index_name_exception' &&
            err.data.reason.includes('already exists as alias')))
      ) {
        this.logger.debug(`table ${table} already exists`);
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
    const start = Date.now();
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
    const url = new URL(`${this.config.provider.endpoint}/_bulk`);
    if (options?.refresh) {
      url.searchParams.set('refresh', 'true');
    }
    await this.requestBulk(url.toString(), records);
    this.logger.debug(
      `wrote ${documents.length} documents to ${table} in ${Date.now() - start}ms`
    );
  }

  /**
   * @see https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete-by-query
   */
  override async deleteByQuery<T extends SearchTable>(
    table: T,
    query: Record<string, any>,
    options?: OperationOptions
  ): Promise<void> {
    const start = Date.now();
    const url = new URL(
      `${this.config.provider.endpoint}/${table}/_delete_by_query`
    );
    if (options?.refresh) {
      url.searchParams.set('refresh', 'true');
    }
    const result = await this.request(
      'POST',
      url.toString(),
      JSON.stringify({ query }),
      'application/json',
      // ignore 409 error: version_conflict_engine_exception, version conflict, required seqNo [255898790], primary term [3]. current document has seqNo [256133002] and primary term [3]
      [409]
    );
    this.logger.debug(
      `deleted by query ${table} ${JSON.stringify(query)} in ${Date.now() - start}ms, result: ${JSON.stringify(result).substring(0, 500)}`
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
        _source: this.formatDateFields(hit._source),
        fields: this.formatDateFields(hit.fields),
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
    const buckets = data.aggregations.result.buckets;
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
            _source: this.formatDateFields(hit._source),
            fields: this.formatDateFields(hit.fields),
            highlights: hit.highlight,
          })),
        },
      })),
    };
  }

  protected formatDateFields<T extends Record<string, unknown[] | unknown>>(
    fieldsOrSource: T
  ): T {
    for (const fieldName of DateFieldNames) {
      let values = fieldsOrSource[fieldName];
      if (!values) {
        continue;
      }
      if (Array.isArray(values)) {
        // { created_at: ['2025-06-20T03:02:43.442Z'] } => { created_at: [new Date('2025-06-20T03:02:43.442Z')] }
        values = values.map(this.formatDateValue);
      } else {
        // { created_at: '2025-06-20T03:02:43.442Z' } => { created_at: new Date('2025-06-20T03:02:43.442Z') }
        values = this.formatDateValue(values);
      }
      // @ts-expect-error ignore type check
      fieldsOrSource[fieldName] = values;
    }
    return fieldsOrSource;
  }

  /**
   * elasticsearch return date value as string, we need to convert it to Date object
   */
  protected formatDateValue(value: unknown) {
    if (value && typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }

  protected async requestSearch(table: SearchTable, body: Record<string, any>) {
    const url = `${this.config.provider.endpoint}/${table}/_search`;
    const jsonBody = JSON.stringify(body);
    const start = Date.now();
    try {
      return await this.request('POST', url, jsonBody);
    } finally {
      const duration = Date.now() - start;
      // log slow search
      if (duration > 1000) {
        this.logger.warn(
          `Slow search on ${table} in ${duration}ms, DSL: ${jsonBody}`
        );
      } else {
        this.logger.verbose(
          `search ${table} in ${duration}ms, DSL: ${jsonBody}`
        );
      }
    }
  }

  /**
   * @see https://www.elastic.co/docs/api/doc/elasticsearch-serverless/operation/operation-bulk-2
   */
  protected async requestBulk(url: string, records: string[]) {
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
    contentType = 'application/json',
    ignoreErrorStatus?: number[]
  ) {
    const headers = {
      'Content-Type': contentType,
    } as Record<string, string>;
    if (this.config.provider.apiKey) {
      headers.Authorization = `ApiKey ${this.config.provider.apiKey}`;
    } else if (this.config.provider.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.config.provider.username}:${this.config.provider.password}`).toString('base64')}`;
    }
    const response = await fetch(url, {
      method,
      body,
      headers,
    });
    const data = await response.json();
    if (ignoreErrorStatus?.includes(response.status)) {
      return data;
    }

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
        error?: { type: string; reason: string } | string;
      };
      let reason = '';
      let type = '';
      if (typeof errorData.error === 'string') {
        reason = errorData.error;
      } else if (errorData.error) {
        reason = errorData.error.reason;
        type = errorData.error.type;
      } else {
        reason = `unknown error, status ${response.status}, please check the response body`;
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
