import {
  type GetMembersByWorkspaceIdQuery,
  getMembersByWorkspaceIdQuery,
} from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export type Member = Omit<
  GetMembersByWorkspaceIdQuery['workspace']['members'][number],
  '__typename'
>;
export function useMembers(workspaceId: string) {
  const { data } = useQuery({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId,
    },
  });
  return data.workspace.members;
}
