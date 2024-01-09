import { revokeMemberPermissionMutation } from '@affine/graphql';
import { useCallback } from 'react';

import { useMutation } from '../use-mutation';
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
