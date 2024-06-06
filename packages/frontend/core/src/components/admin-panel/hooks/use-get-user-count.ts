import { useQuery } from '@affine/core/hooks/use-query';
import { getUserCountQuery } from '@affine/graphql';

export const useGetUserListCount = () => {
  const { data } = useQuery({
    query: getUserCountQuery,
  });

  return data.userCount || 0;
};
