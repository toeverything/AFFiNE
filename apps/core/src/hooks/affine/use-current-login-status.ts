import { useSession } from '@toeverything/auth/react';

export function useCurrentLoginStatus():
  | 'authenticated'
  | 'unauthenticated'
  | 'loading' {
  const session = useSession();
  return session.status;
}
