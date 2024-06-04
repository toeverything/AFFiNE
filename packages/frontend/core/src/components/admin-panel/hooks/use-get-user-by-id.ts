import { useQuery } from '@affine/core/hooks/use-query';
import { getUserByIdQuery } from '@affine/graphql';

export const useGetUserById = (id: string) => {
  const { data } = useQuery({
    query: getUserByIdQuery,
    variables: {
      id,
    },
  });

  return data?.userById || null;
};
