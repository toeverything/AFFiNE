// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import { useMemo } from 'react';

export const useDeleteCollectionInfo = () => {
  const user = useSession().data?.user;
  return useMemo(
    () => (user ? { userName: user.name ?? '', userId: user.id } : null),
    [user]
  );
};
