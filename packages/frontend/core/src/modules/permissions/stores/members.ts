import { getMembersByWorkspaceIdQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../../cloud';

export class WorkspaceMembersStore extends Store {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchMembers(
    workspaceId: string,
    skip: number,
    take: number,
    signal?: AbortSignal
  ) {
    const data = await this.graphqlService.gql({
      query: getMembersByWorkspaceIdQuery,
      variables: {
        workspaceId,
        skip,
        take,
      },
      context: {
        signal,
      },
    });

    return data.workspace;
  }
}
