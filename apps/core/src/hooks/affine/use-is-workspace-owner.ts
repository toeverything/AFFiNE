import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { getIsOwnerQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export function useIsWorkspaceOwner(workspace: AffineOfficialWorkspace) {
  const { data } = useQuery({
    query: getIsOwnerQuery,
    variables: {
      workspaceId: workspace.id,
    },
  });

  if (workspace.flavour === WorkspaceFlavour.LOCAL) {
    return true;
  }

  return data.isOwner;
}
