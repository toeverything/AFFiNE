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
      const res = await trigger({
        workspaceId,
        userId,
      });
      await mutate();
      return res;
    },
    [mutate, trigger, workspaceId]
  );
}
