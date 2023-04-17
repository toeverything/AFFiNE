import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import {
  getLoginStorage,
  parseIdToken,
  setLoginStorage,
  SignMethod,
  storageChangeSlot,
} from '@affine/workspace/affine/login';
import type { WorkspaceRegistry } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { affineAuth } from '../../plugins/affine';
import { useTransformWorkspace } from '../use-transform-workspace';

export function useOnTransformWorkspace() {
  const transformWorkspace = useTransformWorkspace();
  const setUser = useSetAtom(currentAffineUserAtom);
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
    },
    [setUser, transformWorkspace]
  );
}
