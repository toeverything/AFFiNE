import { sessionAtom } from '@toeverything/auth/react';
import { useAtomValue } from 'jotai/react';

export type CheckedUser = {
  id: string;
  name: string;
  email: string;
  image: string;
  hasPassword: boolean;
};

/**
 * This hook checks if the user is logged in.
 * If not, it will throw an error.
 */
export function useCurrentUser(): CheckedUser {
  const { data: session, status } = useAtomValue(sessionAtom);
  // If you are seeing this error, it means that you are not logged in.
  //  This should be prohibited in the development environment, please re-write your component logic.
  if (status === 'unauthenticated') {
    throw new Error('session.status should be authenticated');
  }

  const user = session?.user;

  return {
    id: user?.id ?? 'REPLACE_ME_DEFAULT_ID',
    name: user?.name ?? 'REPLACE_ME_DEFAULT_NAME',
    email: user?.email ?? 'REPLACE_ME_DEFAULT_EMAIL',
    image: user?.image ?? 'REPLACE_ME_DEFAULT_URL',
    hasPassword: user?.hasPassword ?? false,
  };
}
