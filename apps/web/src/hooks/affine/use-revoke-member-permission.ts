import { revokeMemberPermissionMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useCallback } from 'react';

import { useMutateCloud } from './use-mutate-cloud';

export function useRevokeMemberPermission(workspaceId: string) {
  const mutate = useMutateCloud();
  const { trigger } = useMutation({
    mutation: revokeMemberPermissionMutation,
  });

  return useCallback(
    async (userId: string) => {
      await trigger({
        workspaceId,
        userId,
      });
      await mutate();
    },
    [mutate, trigger, workspaceId]
  );
}
