import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/hooks/use-mutation';
import {
  addToAdminMutation,
  addToEarlyAccessMutation,
  createChangePasswordUrlMutation,
  createUserMutation,
  deleteUserMutation,
  EarlyAccessType,
  FeatureType,
  listUsersQuery,
  removeAdminMutation,
  removeEarlyAccessMutation,
  updateAccountMutation,
} from '@affine/graphql';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export const useCreateUser = () => {
  const { trigger: createUser } = useMutation({
    mutation: createUserMutation,
  });

  const { trigger: addToEarlyAccess } = useMutation({
    mutation: addToEarlyAccessMutation,
  });

  const { trigger: addToAdmin } = useMutation({
    mutation: addToAdminMutation,
  });

  const revalidate = useMutateQueryResource();

  const updateFeatures = useCallback(
    (email: string, features: FeatureType[]) => {
      const shouldAddToAdmin = features.includes(FeatureType.Admin);
      const shouldAddToAIEarlyAccess = features.includes(
        FeatureType.AIEarlyAccess
      );

      return Promise.all([
        shouldAddToAdmin && addToAdmin({ email }),
        shouldAddToAIEarlyAccess &&
          addToEarlyAccess({ email, type: EarlyAccessType.AI }),
      ]);
    },
    [addToAdmin, addToEarlyAccess]
  );

  const create = useAsyncCallback(
    async ({
      name,
      email,
      password,
      features,
      callback,
    }: {
      name: string;
      email: string;
      password: string;
      features: FeatureType[];
      callback?: () => void;
    }) => {
      await createUser({
        input: {
          name,
          email,
          password,
        },
      })
        .then(async () => {
          await updateFeatures(email, features);
          await revalidate(listUsersQuery);
          toast('User created successfully');
          callback?.();
        })
        .catch(e => {
          toast(e.message);
          console.error(e);
        });
    },
    [createUser, revalidate, updateFeatures]
  );

  return create;
};

interface UpdateUserProps {
  userId: string;
  name: string;
  email: string;
  features: FeatureType[];
  callback?: () => void;
}

export const useUpdateUser = () => {
  const { trigger: updateAccount } = useMutation({
    mutation: updateAccountMutation,
  });

  const { trigger: addToEarlyAccess } = useMutation({
    mutation: addToEarlyAccessMutation,
  });

  const { trigger: removeEarlyAccess } = useMutation({
    mutation: removeEarlyAccessMutation,
  });

  const { trigger: addToAdmin } = useMutation({
    mutation: addToAdminMutation,
  });

  const { trigger: removeAdmin } = useMutation({
    mutation: removeAdminMutation,
  });

  const revalidate = useMutateQueryResource();

  const updateFeatures = useCallback(
    ({ email, features }: { email: string; features: FeatureType[] }) => {
      const shoutAddToAdmin = features.includes(FeatureType.Admin);
      const shoutAddToAIEarlyAccess = features.includes(
        FeatureType.AIEarlyAccess
      );

      return Promise.all([
        shoutAddToAdmin ? addToAdmin({ email }) : removeAdmin({ email }),
        shoutAddToAIEarlyAccess
          ? addToEarlyAccess({ email, type: EarlyAccessType.AI })
          : removeEarlyAccess({ email, type: EarlyAccessType.AI }),
      ]);
    },
    [addToAdmin, addToEarlyAccess, removeAdmin, removeEarlyAccess]
  );

  const update = useAsyncCallback(
    async ({ userId, name, email, features, callback }: UpdateUserProps) => {
      updateAccount({
        id: userId,
        input: {
          name,
          email,
        },
      })
        .then(async () => {
          await updateFeatures({ email, features });
          await revalidate(listUsersQuery);
          toast('Account updated successfully');
          callback?.();
        })
        .catch(e => {
          toast.error('Failed to update account: ' + e.message);
        });
    },
    [revalidate, updateAccount, updateFeatures]
  );

  return update;
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

export const useUserManagement = () => {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { resetPasswordLink, onResetPassword } = useResetUserPassword();

  return useMemo(() => {
    return {
      createUser,
      updateUser,
      deleteUser,
      resetPasswordLink,
      onResetPassword,
    };
  }, [createUser, deleteUser, onResetPassword, resetPasswordLink, updateUser]);
};
