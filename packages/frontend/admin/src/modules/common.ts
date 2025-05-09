import type { GetCurrentUserFeaturesQuery } from '@affine/graphql';
import {
  adminServerConfigQuery,
  FeatureType,
  getCurrentUserFeaturesQuery,
} from '@affine/graphql';
import { useEffect, useState } from 'react';

import { useMutateQueryResource } from '../use-mutation';
import { useQuery } from '../use-query';

export const useServerConfig = () => {
  const { data } = useQuery({
    query: adminServerConfigQuery,
  });

  return data.serverConfig;
};

export const useRevalidateServerConfig = () => {
  const revalidate = useMutateQueryResource();

  return () => {
    return revalidate(adminServerConfigQuery);
  };
};

export const useRevalidateCurrentUser = () => {
  const revalidate = useMutateQueryResource();

  return () => {
    return revalidate(getCurrentUserFeaturesQuery);
  };
};
export const useCurrentUser = () => {
  const { data } = useQuery({
    query: getCurrentUserFeaturesQuery,
  });
  return data.currentUser;
};

export function isAdmin(
  user: NonNullable<GetCurrentUserFeaturesQuery['currentUser']>
) {
  return user.features.includes(FeatureType.Admin);
}

export function useMediaQuery(query: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    function onChange(event: MediaQueryListEvent) {
      setValue(event.matches);
    }

    const result = matchMedia(query);
    result.addEventListener('change', onChange);
    setValue(result.matches);

    return () => result.removeEventListener('change', onChange);
  }, [query]);

  return value;
}
