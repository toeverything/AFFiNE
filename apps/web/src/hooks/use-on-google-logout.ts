import { WorkspaceFlavour } from '@affine/workspace/type';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { jotaiWorkspacesAtom } from '../atoms';
import { WorkspacePlugins } from '../plugins';
import { apis } from '../shared/apis';

export function useOnGoogleLogout() {
  const set = useSetAtom(jotaiWorkspacesAtom);
  const router = useRouter();
  return useCallback(() => {
    apis.auth.clear();
    set(workspaces =>
      workspaces.filter(
        workspace => workspace.flavour !== WorkspaceFlavour.AFFINE
      )
    );
    WorkspacePlugins[WorkspaceFlavour.AFFINE].cleanup?.();
    router.reload();
  }, [router, set]);
}
