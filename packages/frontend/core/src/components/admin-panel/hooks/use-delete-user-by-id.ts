import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/hooks/use-mutation';
import { deleteUserMutation, getUserListQuery } from '@affine/graphql';

export const useDeleteUserById = () => {
  const { trigger, isMutating } = useMutation({
    mutation: deleteUserMutation,
  });

  const revalidate = useMutateQueryResource();

  return {
    trigger: useAsyncCallback(
      async (id: string) => {
        await trigger({
          id,
        });
        await revalidate(getUserListQuery);
      },
      [revalidate, trigger]
    ),
    isMutating,
  };
};
