import type { DefaultSession } from 'next-auth';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
export type CheckedUser = {
  id: string;
  name: string;
  email: string;
  image: string;
  hasPassword: boolean;
  update: ReturnType<typeof useSession>['update'];
};

// FIXME: Should this namespace be here?
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      hasPassword: boolean;
    } & DefaultSession['user'];
  }
}

/**
 * This hook checks if the user is logged in.
 * If not, it will throw an error.
 */
export function useCurrentUser(): CheckedUser {
  const { data: session, status, update } = useSession();
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
    update,
  };
}
