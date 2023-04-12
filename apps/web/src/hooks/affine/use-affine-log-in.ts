import { WorkspaceFlavour } from '@affine/workspace/type';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { WorkspacePlugins } from '../../plugins';

export function useAffineLogIn() {
  const router = useRouter();
  return useCallback(async () => {
    await WorkspacePlugins[WorkspaceFlavour.AFFINE].Events[
      'workspace:access'
    ]?.();
    // todo: remove reload page requirement
    router.reload();
  }, [router]);
}
