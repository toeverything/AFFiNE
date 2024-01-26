import { quotaQuery, workspaceQuotaQuery } from '@affine/graphql';

import { useQuery } from './use-query';

export const useUserQuota = () => {
  const { data } = useQuery({
    query: quotaQuery,
  });

  return data.currentUser?.quota || null;
};

export const useWorkspaceQuota = (id: string) => {
  const { data } = useQuery({
    query: workspaceQuotaQuery,
    variables: {
      id,
    },
  });

  return data.workspace?.quota || null;
};
