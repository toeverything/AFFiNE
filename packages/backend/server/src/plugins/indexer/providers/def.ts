import { Inject, Injectable, Logger } from '@nestjs/common';

import { Config, OnEvent } from '../../../base';
import { SearchProviderType } from '../config';
import { SearchProviderFactory } from '../factory';
import { SearchTable } from '../tables';

export interface SearchNode {
  _id: string;
  _score: number;
  _source: Record<string, unknown>;
  fields: Record<string, unknown[]>;
  highlights?: Record<string, unknown[]>;
}

export interface SearchResult {
  took: number;
  timedOut: boolean;
  total: number;
  nodes: SearchNode[];
  nextCursor?: string;
}

export interface AggregateBucket {
  key: string;
  count: number;
  hits: {
    nodes: SearchNode[];
  };
}

export interface AggregateResult {
  took: number;
  timedOut: boolean;
  total: number;
  buckets: AggregateBucket[];
  nextCursor?: string;
}

export interface BaseQueryDSL {
  _source: string[];
  sort: unknown[];
  query: Record<string, any>;
  size?: number;
  from?: number;
  cursor?: string;
}

export interface HighlightDSL {
  pre_tags: string[];
  post_tags: string[];
}

export interface SearchQueryDSL extends BaseQueryDSL {
  fields: string[];
  highlight?: {
    fields: Record<string, HighlightDSL>;
  };
}

export interface TopHitsDSL extends Omit<
  SearchQueryDSL,
  'query' | 'sort' | 'from' | 'cursor'
> {}

export interface AggregateQueryDSL extends BaseQueryDSL {
  aggs: {
    result: {
      terms: {
        field: string;
        size?: number;
        order: {
          max_score: 'desc';
        };
      };
      aggs: {
        max_score: {
          max: {
            script: {
              source: '_score';
            };
          };
        };
        result: {
          top_hits: TopHitsDSL;
        };
      };
    };
  };
}

export interface OperationOptions {
  refresh?: boolean;
}

@Injectable()
export abstract class SearchProvider {
  abstract type: SearchProviderType;
  /**
   * Create a new search index table.
   */
  abstract createTable(table: SearchTable, mapping: string): Promise<void>;
  /**
   * Search documents from the search index table.
   */
  abstract search(
    table: SearchTable,
    dsl: SearchQueryDSL
  ): Promise<SearchResult>;
  /**
   * Aggregate documents from the search index table.
   */
  abstract aggregate(
    table: SearchTable,
    dsl: AggregateQueryDSL
  ): Promise<AggregateResult>;
  /**
   * Write documents to the search index table.
   * If the document already exists, it will be replaced.
   * If the document does not exist, it will be created.
   */
  abstract write(
    table: SearchTable,
    documents: Record<string, unknown>[],
    options?: OperationOptions
  ): Promise<void>;
  /**
   * Delete documents from the search index table.
   */
  abstract deleteByQuery(
    table: SearchTable,
    query: Record<string, any>,
    options?: OperationOptions
  ): Promise<void>;

  protected readonly logger = new Logger(this.constructor.name);

  @Inject() private readonly factory!: SearchProviderFactory;
  @Inject() private readonly AFFiNEConfig!: Config;

  protected get config() {
    return this.AFFiNEConfig.indexer;
  }

  protected get configured() {
    return this.config.enabled && this.config.provider.type === this.type;
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.setup();
  }

  @OnEvent('config.changed')
  onConfigUpdated(event: Events['config.changed']) {
    if ('indexer' in event.updates) {
      this.setup();
    }
  }

  protected setup() {
    if (this.configured) {
      this.factory.register(this);
    } else {
      this.factory.unregister(this);
    }
  }
}
