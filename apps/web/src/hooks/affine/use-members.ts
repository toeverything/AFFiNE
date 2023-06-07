import type { Member } from '@affine/env/workspace/legacy-cloud';
import { affineApis } from '@affine/workspace/affine/shared';
import { useCallback } from 'react';
import useSWR from 'swr';

import { QueryKey } from '../../adapters/affine/fetcher';

export function useMembers(workspaceId: string) {
  const { data, mutate } = useSWR<Member[]>(
    [QueryKey.getMembers, workspaceId],
    {
      fallbackData: [],
    }
  );

  const inviteMember = useCallback(
    async (email: string) => {
      await affineApis.inviteMember({
        id: workspaceId,
        email,
      });
      return mutate();
    },
    [mutate, workspaceId]
  );

  const removeMember = useCallback(
    async (permissionId: number) => {
      await affineApis.removeMember({
        permissionId,
      });
      return mutate();
    },
    [mutate]
  );

  return {
    members: data ?? [],
    inviteMember,
    removeMember,
  };
}
