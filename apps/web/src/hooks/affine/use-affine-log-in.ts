import { WorkspaceFlavour } from '@affine/env/workspace';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { WorkspaceAdapters } from '../../adapters/workspace';

export function useAffineLogIn() {
  const router = useRouter();
  return useCallback(async () => {
    await WorkspaceAdapters[WorkspaceFlavour.AFFINE].Events[
      'workspace:access'
    ]?.();
    // todo: remove reload page requirement
    router.reload();
  }, [router]);
}
