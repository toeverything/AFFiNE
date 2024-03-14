import type { ServerFeature } from '@affine/graphql';
import { oauthProvidersQuery, serverConfigQuery } from '@affine/graphql';
import type { BareFetcher, Middleware } from 'swr';

import { useQueryImmutable } from '../use-query';

const wrappedFetcher = (fetcher: BareFetcher<any> | null, ...args: any[]) =>
  fetcher?.(...args).catch(() => null);

const errorHandler: Middleware = useSWRNext => (key, fetcher, config) => {
  return useSWRNext(key, wrappedFetcher.bind(null, fetcher), config);
};

const useServerConfig = () => {
  const { data: config, error } = useQueryImmutable(
    { query: serverConfigQuery },
    {
      use: [errorHandler],
    }
  );

  if (error || !config) {
    return null;
  }

  return config.serverConfig;
};

type LowercaseServerFeature = Lowercase<ServerFeature>;
type ServerFeatureRecord = {
  [key in LowercaseServerFeature]: boolean;
};

export const useServerFeatures = (): ServerFeatureRecord => {
  const config = useServerConfig();

  if (!config) {
    return {} as ServerFeatureRecord;
  }

  return Array.from(new Set(config.features)).reduce((acc, cur) => {
    acc[cur.toLowerCase() as LowercaseServerFeature] = true;
    return acc;
  }, {} as ServerFeatureRecord);
};

export const useOAuthProviders = () => {
  const { data, error } = useQueryImmutable(
    { query: oauthProvidersQuery },
    {
      use: [errorHandler],
    }
  );

  if (error || !data) {
    return [];
  }

  return data.serverConfig.oauthProviders;
};

export const useServerBaseUrl = () => {
  const config = useServerConfig();

  if (!config) {
    if (environment.isDesktop) {
      // don't use window.location in electron
      return null;
    }
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  }

  return config.baseUrl;
};
