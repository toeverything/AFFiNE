import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export enum SearchProviderName {
  Manticoresearch = 'manticoresearch',
  Elasticsearch = 'elasticsearch',
}

const SearchProviderNameSchema = z.nativeEnum(SearchProviderName);

declare global {
  interface AppConfigSchema {
    search: {
      enabled: boolean;
      provider: SearchProviderName;
      endpoint: string;
      username: string;
      password: string;
    };
  }
}

defineModuleConfig('search', {
  enabled: {
    desc: 'Enable search plugin',
    default: true,
  },
  provider: {
    desc: 'Indexer search provider name',
    default: SearchProviderName.Manticoresearch,
    shape: SearchProviderNameSchema,
    env: 'AFFINE_INDEXER_SEARCH_PROVIDER',
  },
  endpoint: {
    desc: 'Indexer search endpoint',
    default: 'http://localhost:9308',
    env: 'AFFINE_INDEXER_SEARCH_ENDPOINT',
    validate: val => {
      // allow to be nullable and empty string
      if (!val) {
        return { success: true, data: val };
      }

      return z.string().url().safeParse(val);
    },
  },
  username: {
    desc: 'Indexer search auth username, if not set, basic auth will be disabled. Optional for elasticsearch',
    link: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/http-clients.html',
    default: '',
    env: 'AFFINE_INDEXER_SEARCH_USERNAME',
  },
  password: {
    desc: 'Indexer search auth password, if not set, basic auth will be disabled. Optional for elasticsearch',
    default: '',
    env: 'AFFINE_INDEXER_SEARCH_PASSWORD',
  },
});
