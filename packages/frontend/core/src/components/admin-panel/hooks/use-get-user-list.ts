import { useQuery } from '@affine/core/hooks/use-query';
import { getUserListQuery } from '@affine/graphql';

export const useGetUserList = (skip: number, first?: number) => {
  const { data } = useQuery({
    query: getUserListQuery,
    variables: {
      filter: {
        skip,
        first,
      },
    },
  });

  return data.users || [];
};

export const useGetUserListCount = () => {
  const { data } = useQuery({
    query: getUserListQuery,
    variables: {
      filter: {
        skip: 0,
      },
    },
  });

  console.log('count', data.users.length);

  return data.users.length || 0;
};
