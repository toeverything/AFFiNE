import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export enum SearchProviderType {
  Manticoresearch = 'manticoresearch',
  Elasticsearch = 'elasticsearch',
}

const SearchProviderTypeSchema = z.nativeEnum(SearchProviderType);

declare global {
  interface AppConfigSchema {
    indexer: {
      enabled: boolean;
      provider: {
        type: SearchProviderType;
        endpoint: string;
        apiKey: string;
        username: string;
        password: string;
      };
      autoIndex: {
        batchSize: number;
      };
    };
  }
}

defineModuleConfig('indexer', {
  enabled: {
    desc: 'Enable indexer plugin',
    default: false,
    env: ['AFFINE_INDEXER_ENABLED', 'boolean'],
  },
  'provider.type': {
    desc: 'Indexer search service provider name',
    default: SearchProviderType.Manticoresearch,
    shape: SearchProviderTypeSchema,
    env: ['AFFINE_INDEXER_SEARCH_PROVIDER', 'string'],
  },
  'provider.endpoint': {
    desc: 'Indexer search service endpoint',
    default: 'http://localhost:9308',
    env: ['AFFINE_INDEXER_SEARCH_ENDPOINT', 'string'],
    validate: val => {
      // allow to be nullable and empty string
      if (!val) {
        return { success: true, data: val };
      }

      return z.string().url().safeParse(val);
    },
  },
  'provider.apiKey': {
    desc: 'Indexer search service api key. Optional for elasticsearch',
    link: 'https://www.elastic.co/guide/server/current/api-key.html',
    default: '',
    env: ['AFFINE_INDEXER_SEARCH_API_KEY', 'string'],
  },
  'provider.username': {
    desc: 'Indexer search service auth username, if not set, basic auth will be disabled. Optional for elasticsearch',
    link: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/http-clients.html',
    default: '',
    env: ['AFFINE_INDEXER_SEARCH_USERNAME', 'string'],
  },
  'provider.password': {
    desc: 'Indexer search service auth password, if not set, basic auth will be disabled. Optional for elasticsearch',
    default: '',
    env: ['AFFINE_INDEXER_SEARCH_PASSWORD', 'string'],
  },
  'autoIndex.batchSize': {
    desc: 'Number of workspaces automatically indexed per batch',
    default: 10,
    shape: z.number().int().positive().max(1000),
  },
});
