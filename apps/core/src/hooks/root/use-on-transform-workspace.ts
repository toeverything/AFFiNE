import type { WorkspaceRegistry } from '@affine/env/workspace';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { currentPageIdAtom } from '@toeverything/infra/atom';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { useTransformWorkspace } from '../use-transform-workspace';

export function useOnTransformWorkspace() {
  const transformWorkspace = useTransformWorkspace();
  const setWorkspaceId = useSetAtom(currentPageIdAtom);
  return useCallback(
    async <From extends WorkspaceFlavour, To extends WorkspaceFlavour>(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ): Promise<void> => {
      const workspaceId = await transformWorkspace(from, to, workspace);
      window.dispatchEvent(
        new CustomEvent('affine-workspace:transform', {
          detail: {
            from,
            to,
            oldId: workspace.id,
            newId: workspaceId,
          },
        })
      );
      setWorkspaceId(workspaceId);
    },
    [setWorkspaceId, transformWorkspace]
  );
}

declare global {
  // global Events
  interface WindowEventMap {
    'affine-workspace:transform': CustomEvent<{
      from: WorkspaceFlavour;
      to: WorkspaceFlavour;
      oldId: string;
      newId: string;
    }>;
  }
}
