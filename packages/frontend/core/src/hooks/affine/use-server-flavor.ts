import { serverConfigQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';
import type { BareFetcher, Middleware } from 'swr';

const wrappedFetcher = (fetcher: BareFetcher<any> | null, ...args: any[]) =>
  fetcher?.(...args).catch(() => null);

const errorHandler: Middleware = useSWRNext => (key, fetcher, config) => {
  return useSWRNext(key, wrappedFetcher.bind(null, fetcher), config);
};

export const useServerFlavor = () => {
  const { data: config, error } = useQuery(
    { query: serverConfigQuery },
    {
      use: [errorHandler],
      revalidateOnFocus: false,
      revalidateOnMount: false,
      revalidateIfStale: false,
    }
  );

  if (error || !config) {
    return 'local';
  }

  return config.serverConfig.flavor;
};

export const useSelfHosted = () => {
  const serverFlavor = useServerFlavor();

  return ['local', 'selfhosted'].includes(serverFlavor);
};
