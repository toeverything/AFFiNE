import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import { clearLoginStorage } from '@affine/workspace/affine/login';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { jotaiWorkspacesAtom } from '../../atoms';
import { WorkspacePlugins } from '../../plugins';

export function useAffineLogOut() {
  const set = useSetAtom(jotaiWorkspacesAtom);
  const router = useRouter();
  const setCurrentUser = useSetAtom(currentAffineUserAtom);
  return useCallback(() => {
    set(workspaces =>
      workspaces.filter(
        workspace => workspace.flavour !== WorkspaceFlavour.AFFINE
      )
    );
    WorkspacePlugins[WorkspaceFlavour.AFFINE].cleanup?.();
    clearLoginStorage();
    setCurrentUser(null);
    router.reload();
  }, [router, set, setCurrentUser]);
}
