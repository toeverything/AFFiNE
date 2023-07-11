import type { Permission } from '@affine/graphql';
import { inviteByEmailMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useCallback } from 'react';

import { useMutateCloud } from './use-mutate-cloud';

export function useInviteMember(workspaceId: string) {
  const { trigger } = useMutation({
    mutation: inviteByEmailMutation,
  });
  const mutate = useMutateCloud();
  return useCallback(
    async (email: string, permission: Permission) => {
      await trigger({
        workspaceId,
        email,
        permission,
      });
      await mutate();
    },
    [mutate, trigger, workspaceId]
  );
}
