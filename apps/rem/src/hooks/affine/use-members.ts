import { Member } from '@affine/datacenter';
import { useCallback } from 'react';
import useSWR from 'swr';

import { QueryKey } from '../../shared';

export function useMembers(workspaceId: string) {
  const { data, mutate } = useSWR<Member[]>(
    [QueryKey.getMembers, workspaceId],
    {
      fallbackData: [],
    }
  );

  const inviteMember = useCallback(() => {
    mutate();
  }, [mutate]);

  const removeMember = useCallback(() => {
    mutate();
  }, [mutate]);

  return {
    member: data,
    inviteMember,
    removeMember,
  };
}
