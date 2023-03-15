import type { Member } from '@affine/datacenter';
import { useCallback } from 'react';
import useSWR from 'swr';

import { QueryKey } from '../../plugins/affine/fetcher';
import { apis } from '../../shared/apis';

export function useMembers(workspaceId: string) {
  const { data, mutate } = useSWR<Member[]>(
    [QueryKey.getMembers, workspaceId],
    {
      fallbackData: [],
    }
  );

  const inviteMember = useCallback(
    async (email: string) => {
      await apis.inviteMember({
        id: workspaceId,
        email,
      });
      return mutate();
    },
    [mutate, workspaceId]
  );

  const removeMember = useCallback(
    async (permissionId: number) => {
      // fixme: what about the workspaceId?
      await apis.removeMember({
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
