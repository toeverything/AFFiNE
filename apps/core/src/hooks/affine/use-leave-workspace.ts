import { leaveWorkspaceMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useCallback } from 'react';

import { RouteLogic, useNavigateHelper } from '../use-navigate-helper';

export function useLeaveWorkspace(workspaceId: string) {
  const { jumpToIndex } = useNavigateHelper();

  const { trigger: leaveWorkspace } = useMutation({
    mutation: leaveWorkspaceMutation,
  });

  return useCallback(async () => {
    await leaveWorkspace({
      workspaceId,
    });
    // TODO: we need delete local workspace API
    jumpToIndex(RouteLogic.REPLACE);
  }, [jumpToIndex, leaveWorkspace, workspaceId]);
}
