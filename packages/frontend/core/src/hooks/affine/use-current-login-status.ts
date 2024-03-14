import { useSession } from './use-current-user';

export function useCurrentLoginStatus() {
  const session = useSession();
  return session.status;
}
