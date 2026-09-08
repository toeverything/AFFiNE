import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export enum SearchProviderType {
  Embedded = 'embedded',
  Elasticsearch = 'elasticsearch',
  ManticoreSearch = 'manticoresearch',
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
    };
  }
}

defineModuleConfig('indexer', {
  enabled: {
    desc: 'Enable indexer plugin',
    default: false,
  },
  'provider.type': {
    desc: 'Indexer search provider. Self-hosted uses the embedded provider by default; remote providers require an endpoint.',
    default: SearchProviderType.Embedded,
    shape: SearchProviderTypeSchema,
  },
  'provider.endpoint': {
    desc: 'Remote indexer endpoint. Not used by the embedded provider.',
    default: '',
    validate: val => {
      // allow to be nullable and empty string
      if (!val) {
        return { success: true, data: val };
      }

      return z.string().url().safeParse(val);
    },
  },
  'provider.apiKey': {
    desc: 'Indexer search service api key. Optional for remote providers',
    link: 'https://www.elastic.co/guide/server/current/api-key.html',
    default: '',
  },
  'provider.username': {
    desc: 'Indexer search service auth username, if not set, basic auth will be disabled. Optional for remote providers',
    link: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/http-clients.html',
    default: '',
  },
  'provider.password': {
    desc: 'Indexer search service auth password, if not set, basic auth will be disabled. Optional for remote providers',
    default: '',
  },
});
