import { useQueryImmutable } from '@affine/core/hooks/use-query';
import {
  adminServerConfigQuery,
  getCurrentUserFeaturesQuery,
} from '@affine/graphql';

export const useServerConfig = () => {
  const { data } = useQueryImmutable({
    query: adminServerConfigQuery,
  });

  return data.serverConfig;
};

export const useCurrentUser = () => {
  const { data } = useQueryImmutable({
    query: getCurrentUserFeaturesQuery,
  });

  return data.currentUser;
};
