import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import {
  getLoginStorage,
  parseIdToken,
  setLoginStorage,
  SignMethod,
  storageChangeSlot,
} from '@affine/workspace/affine/login';
import { affineAuth } from '@affine/workspace/affine/shared';
import { rootCurrentWorkspaceIdAtom } from '@affine/workspace/atom';
import type { WorkspaceRegistry } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { useTransformWorkspace } from '../use-transform-workspace';

export function useOnTransformWorkspace() {
  const transformWorkspace = useTransformWorkspace();
  const setUser = useSetAtom(currentAffineUserAtom);
  const setWorkspaceId = useSetAtom(rootCurrentWorkspaceIdAtom);
  return useCallback(
    async <From extends WorkspaceFlavour, To extends WorkspaceFlavour>(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ): Promise<void> => {
      const needRefresh = to === WorkspaceFlavour.AFFINE && !getLoginStorage();
      if (needRefresh) {
        const response = await affineAuth.generateToken(SignMethod.Google);
        if (response) {
          setLoginStorage(response);
          setUser(parseIdToken(response.token));
          storageChangeSlot.emit();
        }
      }
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
    [setUser, setWorkspaceId, transformWorkspace]
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
