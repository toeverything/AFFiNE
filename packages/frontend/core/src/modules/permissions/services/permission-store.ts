import type { GraphQLService } from '@affine/core/modules/cloud';
import { getIsOwnerQuery } from '@affine/graphql';
import { Service } from '@toeverything/infra';

export class WorkspacePermissionStoreService extends Service {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchIsOwner(workspaceId: string, signal?: AbortSignal) {
    const isOwner = await this.graphqlService.gql({
      query: getIsOwnerQuery,
      variables: {
        workspaceId,
      },
      context: { signal },
    });

    return isOwner.isOwner;
  }
}
