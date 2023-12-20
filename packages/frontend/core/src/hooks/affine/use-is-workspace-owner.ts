import { WorkspaceFlavour } from '@affine/env/workspace';
import { getIsOwnerQuery } from '@affine/graphql';
import { useQueryImmutable } from '@affine/workspace/affine/gql';
import type { WorkspaceMetadata } from '@affine/workspace/metadata';

export function useIsWorkspaceOwner(workspaceMetadata: WorkspaceMetadata) {
  const { data } = useQueryImmutable(
    workspaceMetadata.flavour !== WorkspaceFlavour.LOCAL
      ? {
          query: getIsOwnerQuery,
          variables: {
            workspaceId: workspaceMetadata.id,
          },
        }
      : undefined
  );

  if (workspaceMetadata.flavour === WorkspaceFlavour.LOCAL) {
    return true;
  }

  return data.isOwner;
}
