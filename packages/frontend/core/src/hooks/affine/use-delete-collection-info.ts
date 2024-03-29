import type { DeleteCollectionInfo } from '@affine/env/filter';
import { useMemo } from 'react';

import { useSession } from './use-current-user';

export const useDeleteCollectionInfo = () => {
  const { user } = useSession();

  return useMemo<DeleteCollectionInfo | null>(
    () => (user ? { userName: user.name, userId: user.id } : null),
    [user]
  );
};
