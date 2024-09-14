import { AuthService } from '@affine/core/modules/cloud';
import type { DeleteCollectionInfo } from '@affine/env/filter';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

export const useDeleteCollectionInfo = () => {
  const authService = useService(AuthService);

  const user = useLiveData(authService.session.account$);

  return useMemo<DeleteCollectionInfo | null>(
    () => (user ? { userName: user.label, userId: user.id } : null),
    [user]
  );
};
