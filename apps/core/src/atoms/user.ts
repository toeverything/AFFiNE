import {
  type GetCurrentUserQuery,
  getCurrentUserQuery,
  type UpdateUserMutation,
  updateUserMutation,
} from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useAtom } from 'jotai';
import { atom } from 'jotai/index';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import { useCallback, useEffect } from 'react';

export type User = Omit<GetCurrentUserQuery['currentUser'], '__typename'>;
export type Update = (params?: {
  id?: string;
  email?: string;
  password?: string;
  name?: string;
  avatar?: File;
}) => Promise<Omit<UpdateUserMutation['updateUser'], '__typename'> | null>;

export const userAtom = atom<User | null>(null);

const defaultUpdateParams = {
  email: null,
  password: null,
  name: null,
  avatar: null,
};

export function useUserAtom(): {
  user: User | null;
  update: Update;
} {
  const { status } = useSession();

  const { trigger: updateUser } = useMutation({
    mutation: updateUserMutation,
  });
  const { trigger: getCurrentUser } = useMutation({
    mutation: getCurrentUserQuery,
  });

  const [user, setUser] = useAtom(userAtom);

  const update = useCallback<Update>(
    async params => {
      if (!user?.id && !params?.id) {
        throw new Error('User not found');
      }
      const res = await updateUser({
        ...defaultUpdateParams,
        ...params,
        id: (user?.id || params?.id) as string,
      });
      if (res?.updateUser) {
        setUser(res?.updateUser);
      }
      return res?.updateUser || null;
    },
    [setUser, updateUser, user?.id]
  );

  useEffect(() => {
    if (status === 'authenticated') {
      getCurrentUser().then(res => {
        setUser(res?.currentUser || null);
        // FIXME: Remove it after getCurrentUserQuery is fixed
        if (res?.currentUser?.id) {
          update({ id: res?.currentUser?.id });
        }
      });
    }
  }, [getCurrentUser, setUser, status, update]);

  return {
    user,
    update,
  };
}
