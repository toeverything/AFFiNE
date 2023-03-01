import { useEffect } from 'react';

import { RemWorkspace, RemWorkspaceFlavour } from '../shared';

export function useLoadWorkspace(workspace: RemWorkspace | null | undefined) {
  useEffect(() => {
    if (workspace?.flavour === RemWorkspaceFlavour.AFFINE) {
      if (!workspace.firstBinarySynced) {
        workspace.syncBinary();
      }
    }
  }, [workspace]);
}
