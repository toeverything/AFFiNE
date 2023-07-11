import { Permission } from '@affine/graphql';
import { useMemo } from 'react';

import { useCurrentUser } from './use-current-user';
import { useMembers } from './use-members';

export function useIsWorkspaceOwner(workspaceId: string) {
  const currentUser = useCurrentUser();
  const members = useMembers(workspaceId);
  return useMemo(
    () =>
      members.some(
        member =>
          member.email === currentUser.email &&
          member.permission === Permission.Owner
      ),
    [currentUser.email, members]
  );
}
