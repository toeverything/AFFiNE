import { notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/hooks/use-mutation';
import {
  deleteUserMutation,
  getUserCountQuery,
  getUserListQuery,
} from '@affine/graphql';

export const useDeleteUserById = () => {
  const { trigger, isMutating } = useMutation({
    mutation: deleteUserMutation,
  });

  const revalidate = useMutateQueryResource();

  return {
    trigger: useAsyncCallback(
      async (id: string) => {
        const { deleteUser } = await trigger({
          id,
        });
        if (deleteUser?.success) {
          notify.success({
            title: 'Deleted successfully',
            message: 'User has been deleted successfully.',
          });
          await revalidate(getUserListQuery);
          await revalidate(getUserCountQuery);
        } else {
          notify.error({
            title: 'Failed to delete',
            message: 'Failed to delete user, please try again later.',
          });
        }
      },
      [revalidate, trigger]
    ),
    isMutating,
  };
};
