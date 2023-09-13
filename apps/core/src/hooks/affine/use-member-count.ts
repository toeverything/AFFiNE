import { getMemberCountByWorkspaceIdQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export function useMemberCount(workspaceId: string) {
  const { data } = useQuery({
    query: getMemberCountByWorkspaceIdQuery,
    variables: {
      workspaceId,
    },
  });

  return data.workspace.memberCount;
}
