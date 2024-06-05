import { useQuery } from '@affine/core/hooks/use-query';
import { getUserQuery } from '@affine/graphql';

export const useGetUserByEmail = (email: string) => {
  const { data } = useQuery({
    query: getUserQuery,
    variables: {
      email,
    },
  });

  return data?.user || null;
};
