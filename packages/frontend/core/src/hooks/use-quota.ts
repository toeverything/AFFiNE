import { quotaQuery } from '@affine/graphql';

import { useQuery } from './use-query';

export const useUserQuota = () => {
  const { data } = useQuery({
    query: quotaQuery,
  });

  return data.currentUser?.quota || null;
};
