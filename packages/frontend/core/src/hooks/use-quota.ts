import { quotaQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export const useUserQuota = () => {
  const { data } = useQuery({
    query: quotaQuery,
  });

  return data.currentUser?.quota || null;
};
