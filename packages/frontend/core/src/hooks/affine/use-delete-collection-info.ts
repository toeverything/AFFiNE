import { useMemo } from 'react';

import { useSession } from './use-current-user';

export const useDeleteCollectionInfo = () => {
  const { user } = useSession();

  return useMemo(
    () => (user ? { userName: user.name, userId: user.id } : null),
    [user]
  );
};
