import { getWorkspacePublicByIdQuery } from '@affine/graphql';

import { useQuery } from '../../shared/gql';

export function useIsPublicCloudWorkspace(workspaceId: string) {
  const { data } = useQuery({
    query: getWorkspacePublicByIdQuery,
    variables: { id: workspaceId },
  });
  return data.workspace.public;
}
