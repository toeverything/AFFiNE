import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/components/hooks/use-mutation';
import { useQuery } from '@affine/core/components/hooks/use-query';
import {
  createChangePasswordUrlMutation,
  createUserMutation,
  deleteUserMutation,
  getUsersCountQuery,
  listUsersQuery,
  updateAccountFeaturesMutation,
  updateAccountMutation,
} from '@affine/graphql';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { UserInput } from '../schema';

export const useCreateUser = () => {
  const {
    trigger: createAccount,
    isMutating: creating,
    error,
  } = useMutation({
    mutation: createUserMutation,
  });

  const { trigger: updateAccountFeatures } = useMutation({
    mutation: updateAccountFeaturesMutation,
  });

  const revalidate = useMutateQueryResource();

  const create = useAsyncCallback(
    async ({ name, email, features }: UserInput) => {
      try {
        const account = await createAccount({
          input: {
            name,
            email,
          },
        });

        await updateAccountFeatures({
          userId: account.createUser.id,
          features,
        });
        await revalidate(listUsersQuery);
        toast('Account updated successfully');
      } catch (e) {
        toast.error('Failed to update account: ' + (e as Error).message);
      }
    },
    [createAccount, revalidate]
  );

  return { creating: creating || !!error, create };
};

export const useUpdateUser = () => {
  const {
    trigger: updateAccount,
    isMutating: updating,
    error,
  } = useMutation({
    mutation: updateAccountMutation,
  });

  const { trigger: updateAccountFeatures } = useMutation({
    mutation: updateAccountFeaturesMutation,
  });

  const revalidate = useMutateQueryResource();

  const update = useAsyncCallback(
    async ({
      userId,
      name,
      email,
      features,
    }: UserInput & { userId: string }) => {
      try {
        await updateAccount({
          id: userId,
          input: {
            name,
            email,
          },
        });
        await updateAccountFeatures({
          userId,
          features,
        });
        await revalidate(listUsersQuery);
        toast('Account updated successfully');
      } catch (e) {
        toast.error('Failed to update account: ' + (e as Error).message);
      }
    },
    [revalidate, updateAccount]
  );

  return { updating: updating || !!error, update };
};

export const useResetUserPassword = () => {
  const [resetPasswordLink, setResetPasswordLink] = useState('');
  const { trigger: resetPassword } = useMutation({
    mutation: createChangePasswordUrlMutation,
  });

  const onResetPassword = useCallback(
    async (id: string, callback?: () => void) => {
      setResetPasswordLink('');
      resetPassword({
        userId: id,
        callbackUrl: '/auth/changePassword?isClient=false',
      })
        .then(res => {
          setResetPasswordLink(res.createChangePasswordUrl);
          callback?.();
        })
        .catch(e => {
          toast.error('Failed to reset password: ' + e.message);
        });
    },
    [resetPassword]
  );

  return useMemo(() => {
    return {
      resetPasswordLink,
      onResetPassword,
    };
  }, [onResetPassword, resetPasswordLink]);
};

export const useDeleteUser = () => {
  const { trigger: deleteUserById } = useMutation({
    mutation: deleteUserMutation,
  });

  const revalidate = useMutateQueryResource();

  const deleteById = useAsyncCallback(
    async (id: string, callback?: () => void) => {
      await deleteUserById({ id })
        .then(async () => {
          await revalidate(listUsersQuery);
          toast('User deleted successfully');
          callback?.();
        })
        .catch(e => {
          toast.error('Failed to delete user: ' + e.message);
        });
    },
    [deleteUserById, revalidate]
  );

  return deleteById;
};

export const useUserCount = () => {
  const {
    data: { usersCount },
  } = useQuery({
    query: getUsersCountQuery,
  });
  return usersCount;
};
