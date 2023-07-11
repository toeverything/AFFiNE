import { assertExists } from '@blocksuite/global/utils';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';

export type CheckedUser = {
  name: string;
  email: string;
  avatarUrl: string;
  id: string;
};

// FIXME: Should this namespace be here?
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      avatarUrl: string;
      email: string;
    };
  }
}

/**
 * This hook checks if the user is logged in.
 * If not, it will throw an error.
 */
export function useCurrentUser(): CheckedUser {
  const session = useSession();
  // If you are seeing this error, it means that you are not logged in.
  //  This should be prohibited in the development environment, please re-write your component logic.
  // assertEquals(
  //   session.status,
  //   'authenticated',
  //   'session.status should be authenticated'
  // );
  const user = session.data?.user;
  assertExists(user, 'user should exist');
  return {
    id: user.id,
    name: user.name ?? 'REPLACE_ME_DEFAULT_NAME',
    email: user.email ?? 'REPLACE_ME_DEFAULT_EMAIL',
    avatarUrl: user.avatarUrl ?? 'REPLACE_ME_DEFAULT_URL',
  };
}

export function useUpdateUser() {
  const { update } = useSession();
  return {
    updateUserName: (userName: string) => {
      update({ name: userName }).catch(console.error);
    },
    updateUserAvatar: (avatarUrl: string) => {
      update({ avatarUrl }).catch(console.error);
    },
    removeUserEmail: (email: string) => {
      update({ email }).catch(console.error);
    },
  };
}
