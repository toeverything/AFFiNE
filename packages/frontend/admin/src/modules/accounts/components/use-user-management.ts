import {
  useMutateQueryResource,
  useMutation,
} from '@affine/admin/use-mutation';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  createChangePasswordUrlMutation,
  createUserMutation,
  deleteUserMutation,
  disableUserMutation,
  enableUserMutation,
  type ImportUsersInput,
  type ImportUsersMutation,
  importUsersMutation,
  listUsersQuery,
  updateAccountFeaturesMutation,
  updateAccountMutation,
} from '@affine/graphql';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { UserInput, UserType } from '../schema';

export interface ExportField {
  id: string;
  label: string;
  checked: boolean;
}

export type UserImportReturnType = ImportUsersMutation['importUsers'];

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
    async ({ name, email, password, features }: UserInput) => {
      try {
        const account = await createAccount({
          input: {
            name,
            email,
            password: password === '' ? undefined : password,
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
    [createAccount, revalidate, updateAccountFeatures]
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
    [revalidate, updateAccount, updateAccountFeatures]
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
        callbackUrl: '/auth/changePassword',
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

export const useEnableUser = () => {
  const { trigger: enableUserById } = useMutation({
    mutation: enableUserMutation,
  });

  const revalidate = useMutateQueryResource();

  const enableById = useAsyncCallback(
    async (id: string, callback?: () => void) => {
      await enableUserById({ id })
        .then(async ({ enableUser }) => {
          await revalidate(listUsersQuery);
          toast(`User ${enableUser.email} enabled successfully`);
          callback?.();
        })
        .catch(e => {
          toast.error('Failed to enable user: ' + e.message);
        });
    },
    [enableUserById, revalidate]
  );

  return enableById;
};
export const useDisableUser = () => {
  const { trigger: disableUserById } = useMutation({
    mutation: disableUserMutation,
  });

  const revalidate = useMutateQueryResource();

  const disableById = useAsyncCallback(
    async (id: string, callback?: () => void) => {
      await disableUserById({ id })
        .then(async ({ banUser }) => {
          await revalidate(listUsersQuery);
          toast(`User ${banUser.email} disabled successfully`);
          callback?.();
        })
        .catch(e => {
          toast.error('Failed to disable user: ' + e.message);
        });
    },
    [disableUserById, revalidate]
  );

  return disableById;
};

export const useImportUsers = () => {
  const { trigger: importUsers } = useMutation({
    mutation: importUsersMutation,
  });
  const revalidate = useMutateQueryResource();

  const handleImportUsers = useCallback(
    async (
      input: ImportUsersInput,
      callback?: (importUsers: UserImportReturnType) => void
    ) => {
      await importUsers({ input })
        .then(async ({ importUsers }) => {
          await revalidate(listUsersQuery);
          callback?.(importUsers);
        })
        .catch(e => {
          toast.error('Failed to import users: ' + e.message);
        });
    },
    [importUsers, revalidate]
  );

  return handleImportUsers;
};

export const useExportUsers = () => {
  const exportCSV = useCallback(
    async (users: UserType[], fields: ExportField[], callback?: () => void) => {
      const selectedFields = fields
        .filter(field => field.checked)
        .map(field => field.id);

      if (selectedFields.length === 0) {
        alert('Please select at least one field to export');
        return;
      }

      const headers = selectedFields.map(
        fieldId => fields.find(field => field.id === fieldId)?.label || fieldId
      );

      const csvRows = [headers.join(',')];

      users.forEach(user => {
        const row = selectedFields.map(fieldId => {
          const value = user[fieldId as keyof UserType];

          return typeof value === 'string'
            ? `"${value.replace(/"/g, '""')}"`
            : String(value);
        });
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');

      // Add BOM (Byte Order Mark) to force Excel to interpret the file as UTF-8
      const BOM = '\uFEFF';
      const csvContentWithBOM = BOM + csvContent;

      const blob = new Blob([csvContentWithBOM], {
        type: 'text/csv;charset=utf-8;',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'exported_users.csv');
      link.style.visibility = 'hidden';
      document.body.append(link);
      link.click();

      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 100);

      callback?.();
    },
    []
  );

  const copyToClipboard = useCallback(
    async (users: UserType[], fields: ExportField[], callback?: () => void) => {
      const selectedFields = fields
        .filter(field => field.checked)
        .map(field => field.id);

      const dataToCopy: {
        [key: string]: string;
      }[] = [];
      users.forEach(user => {
        const row: { [key: string]: string } = {};
        selectedFields.forEach(fieldId => {
          const value = user[fieldId as keyof UserType];
          row[fieldId] = typeof value === 'string' ? value : String(value);
        });
        dataToCopy.push(row);
      });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
      callback?.();
    },
    []
  );

  return {
    exportCSV,
    copyToClipboard,
  };
};
