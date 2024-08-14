import { useMutateQueryResource } from '@affine/core/hooks/use-mutation';
import { useQueryImmutable } from '@affine/core/hooks/use-query';
import type { GetCurrentUserFeaturesQuery } from '@affine/graphql';
import {
  adminServerConfigQuery,
  FeatureType,
  getCurrentUserFeaturesQuery,
} from '@affine/graphql';

export const useServerConfig = () => {
  const { data } = useQueryImmutable({
    query: adminServerConfigQuery,
  });

  return data.serverConfig;
};

export const useRevalidateCurrentUser = () => {
  const revalidate = useMutateQueryResource();

  return () => {
    revalidate(getCurrentUserFeaturesQuery);
  };
};
export const useCurrentUser = () => {
  const { data } = useQueryImmutable({
    query: getCurrentUserFeaturesQuery,
  });
  return data.currentUser;
};

export function isAdmin(
  user: NonNullable<GetCurrentUserFeaturesQuery['currentUser']>
) {
  return user.features.includes(FeatureType.Admin);
}
