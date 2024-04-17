import type { GraphQLService } from '@affine/core/modules/cloud';
import { workspaceQuotaQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

export class WorkspaceQuotaStore extends Store {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchWorkspaceQuota(workspaceId: string, signal?: AbortSignal) {
    const data = await this.graphqlService.gql({
      query: workspaceQuotaQuery,
      variables: {
        id: workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.quota;
  }
}
