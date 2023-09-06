import { leaveWorkspaceMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useCallback } from 'react';

import { useAppHelper } from '../use-workspaces';

export function useLeaveWorkspace() {
  const { deleteWorkspaceMeta } = useAppHelper();

  const { trigger: leaveWorkspace } = useMutation({
    mutation: leaveWorkspaceMutation,
  });

  return useCallback(
    async (workspaceId: string, workspaceName: string) => {
      deleteWorkspaceMeta(workspaceId);

      await leaveWorkspace({
        workspaceId,
        workspaceName,
        sendLeaveMail: true,
      });
    },
    [deleteWorkspaceMeta, leaveWorkspace]
  );
}
