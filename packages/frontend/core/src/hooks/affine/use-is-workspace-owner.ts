import { getIsOwnerQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export function useIsWorkspaceOwner(workspaceId: string) {
  const { data } = useQuery({
    query: getIsOwnerQuery,
    variables: {
      workspaceId,
    },
  });

  return data.isOwner;
}
