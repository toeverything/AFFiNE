import { getMembersByWorkspaceIdQuery } from '@affine/graphql';

import { useQuery } from '../../shared/gql';

export function useMembers(workspaceId: string) {
  const { data } = useQuery({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId,
    },
  });
  return data.workspace.members;
}
