import { WorkspaceFlavour } from '@affine/workspace/type';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { WorkspacePlugins } from '../../plugins';

export function useAffineLogOut() {
  const router = useRouter();
  return useCallback(async () => {
    await WorkspacePlugins[WorkspaceFlavour.AFFINE].Events[
      'workspace:revoke'
    ]?.();
    router.reload();
  }, [router]);
}
