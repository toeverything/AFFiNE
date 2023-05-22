import { WorkspaceFlavour } from '@affine/workspace/type';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { WorkspaceAdapters } from '../../adapters/workspace';

export function useAffineLogOut() {
  const router = useRouter();
  return useCallback(async () => {
    await WorkspaceAdapters[WorkspaceFlavour.AFFINE].Events[
      'workspace:revoke'
    ]?.();
    router.reload();
  }, [router]);
}
