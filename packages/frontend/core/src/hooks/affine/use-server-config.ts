import { serverConfigQuery, ServerDeploymentType } from '@affine/graphql';
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

export const useServerType = () => {
  const config = useServerConfig();

  if (!config) {
    return 'local';
  }

  return config.type;
};

export const useSelfHosted = () => {
  const serverType = useServerType();

  return ['local', ServerDeploymentType.Selfhosted].includes(serverType);
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
