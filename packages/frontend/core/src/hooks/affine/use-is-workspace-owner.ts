import { getIsOwnerQuery } from '@affine/graphql';
import { useQueryImmutable } from '@affine/workspace/affine/gql';

export function useIsWorkspaceOwner(workspaceId: string) {
  const { data } = useQueryImmutable({
    query: getIsOwnerQuery,
    variables: {
      workspaceId,
    },
  });

  return data.isOwner;
}
