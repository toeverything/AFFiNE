import {
  type GetMembersByWorkspaceIdQuery,
  getMembersByWorkspaceIdQuery,
} from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';

export type Member = Omit<
  GetMembersByWorkspaceIdQuery['workspace']['members'][number],
  '__typename'
>;
export function useMembers(
  workspaceId: string,
  skip: number,
  take: number = 8
) {
  const { data } = useQuery({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId,
      skip,
      take,
    },
  });
  return data.workspace.members;
}
