import { FeatureType, getUserFeaturesQuery } from '@affine/graphql';
import type { BareFetcher, Middleware } from 'swr';

import { useQueryImmutable } from '../use-query';

const wrappedFetcher = (fetcher: BareFetcher<any> | null, ...args: any[]) =>
  fetcher?.(...args).catch(() => null);

const errorHandler: Middleware = useSWRNext => (key, fetcher, config) => {
  return useSWRNext(key, wrappedFetcher.bind(null, fetcher), config);
};

export function useIsEarlyAccess() {
  const { data } = useQueryImmutable(
    {
      query: getUserFeaturesQuery,
    },
    {
      use: [errorHandler],
    }
  );

  return data?.currentUser?.features.includes(FeatureType.EarlyAccess) ?? false;
}
