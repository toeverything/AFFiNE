import { Permission } from '@affine/graphql';
import { useMemo } from 'react';

import { useMembers } from './use-members';

export function useIsWorkspaceOwner(workspaceId: string, ownerEmail: string) {
  const members = useMembers(workspaceId);
  return useMemo(
    () =>
      members.some(
        member =>
          member.email === ownerEmail && member.permission === Permission.Owner
      ),
    [ownerEmail, members]
  );
}
